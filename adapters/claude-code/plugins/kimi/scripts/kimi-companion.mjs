#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve core modules from the monorepo root
const CORE_SRC = join(__dirname, "../../../../../core/src");

const { WireClient } = await import(join(CORE_SRC, "wire-client.mjs"));
const { JobControl } = await import(join(CORE_SRC, "job-control.mjs"));
const { GitContext } = await import(join(CORE_SRC, "git-context.mjs"));
const { renderSetupReport, renderReviewResult, renderTaskResult, renderStatusSnapshot, renderCodeResult } =
  await import(join(CORE_SRC, "render.mjs"));
const { buildCodePrompt, parseCodeResult } = await import(join(CORE_SRC, "code-result.mjs"));

const SUBCOMMANDS = ["setup", "review", "adversarial-review", "task", "code", "implement", "status", "result", "cancel"];

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];
  const flags = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      flags[key.replace(/-/g, "_")] = val ?? true;
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { subcommand, flags, positional };
}

function makeKimiClient() {
  const command = process.env.KIMI_COMMAND || "kimi";
  const args = process.env.KIMI_ARGS ? process.env.KIMI_ARGS.split(",").filter(Boolean) : ["--wire"];
  const cwd = process.env.KIMI_WORK_DIR || process.cwd();
  return new WireClient({
    command,
    args,
    cwd,
    capabilities: { supports_question: false, supports_plan_mode: false },
  });
}

function getExecutorInfo() {
  return {
    command: process.env.KIMI_COMMAND || "kimi",
    args: process.env.KIMI_ARGS ? process.env.KIMI_ARGS.split(",").filter(Boolean) : ["--wire"],
    model: process.env.KIMI_MODEL || "",
    worktreeRoot: process.env.KIMI_WORK_DIR || process.cwd(),
    permissionMode: process.env.KIMI_PERMISSION_MODE || "default",
    executor: process.env.KIMI_EXECUTOR || "kimi-wire",
  };
}

async function cmdSetup() {
  let kimiAvailable = false;
  let kimiVersion = "";
  let authenticated = false;
  let serverInfo = null;

  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("kimi", ["--version"]);
    kimiAvailable = true;
    kimiVersion = stdout.trim();
  } catch {
    // ignore
  }

  if (kimiAvailable) {
    try {
      const client = makeKimiClient();
      serverInfo = await client.connect();
      authenticated = true;
      await client.dispose();
    } catch (e) {
      if (e.message?.includes("Authentication")) {
        authenticated = false;
      }
    }
  }

  console.log(renderSetupReport({ kimiAvailable, kimiVersion, authenticated, serverInfo }));
  process.exit(authenticated ? 0 : 1);
}

async function cmdReview(flags) {
  const git = new GitContext();
  const isRepo = await git.isGitRepo();
  if (!isRepo) {
    console.error("Error: Not a git repository.");
    process.exit(1);
  }

  const hasChanges = await git.hasChanges();
  if (!hasChanges) {
    console.log("No changes to review.");
    process.exit(0);
  }

  const target = flags.base ? "baseBranch" : "uncommittedChanges";
  const ctx = await git.collectReviewContext({ target, base: flags.base });

  const prompt = buildReviewPrompt(ctx, flags.adversarial);

  const jc = new JobControl({ stateDir: process.env.KIMI_STATE_DIR });
  const jobId = await jc.create({
    kind: flags.adversarial ? "adversarial-review" : "review",
    target: ctx.target,
    status: "running",
    startedAt: Date.now(),
  });

  let output = "";
  let failed = false;
  try {
    const client = makeKimiClient();
    const info = await client.connect();

    client.on("event", (evt) => {
      const e = evt.detail;
      if (e.type === "ContentPart" && e.payload?.type === "text") {
        output += e.payload.text;
      }
    });

    await client.prompt(prompt);
    await client.dispose();
  } catch (e) {
    failed = true;
    output = e.message;
  }

  let findings = [];
  let clean = false;
  try {
    const parsed = JSON.parse(output);
    if (parsed.findings) {
      findings = parsed.findings;
    } else {
      clean = true;
    }
  } catch {
    clean = output.toLowerCase().includes("no issues") || output.toLowerCase().includes("looks clean");
  }

  await jc.update(jobId, {
    status: failed ? "failed" : "finished",
    finishedAt: Date.now(),
    output: { findings, clean, raw: output },
  });

  console.log(renderReviewResult({ findings, clean, raw: output }));
  process.exit(failed ? 1 : 0);
}

function buildReviewPrompt(ctx, adversarial) {
  let prompt = "Please review the following code changes.\n\n";
  if (ctx.diff) {
    prompt += "## Diff\n\n```diff\n" + ctx.diff + "\n```\n\n";
  }
  if (ctx.untracked?.length > 0) {
    prompt += "## Untracked files\n" + ctx.untracked.map((f) => `- ${f}`).join("\n") + "\n\n";
  }
  prompt += "Provide your review as JSON with the following schema:\n";
  prompt += '{"findings": [{"severity": "error|warning|info", "file": "...", "line": 0, "message": "...", "recommendation": "..."}]}\n';
  if (adversarial) {
    prompt += "\nBe adversarial: challenge assumptions, look for edge cases, and question design decisions.\n";
  }
  return prompt;
}

async function cmdCode(positional) {
  const plan = positional.join(" ");
  if (!plan) {
    console.error("Error: No implementation plan provided.");
    process.exit(1);
  }

  const executorInfo = getExecutorInfo();
  const prompt = buildCodePrompt({ plan, worktreeRoot: executorInfo.worktreeRoot });
  const jc = new JobControl({ stateDir: process.env.KIMI_STATE_DIR });
  const jobId = await jc.create({
    kind: "code",
    status: "running",
    startedAt: Date.now(),
    prompt: plan,
    worktreeRoot: executorInfo.worktreeRoot,
    executor: executorInfo.executor,
    model: executorInfo.model,
    permissionMode: executorInfo.permissionMode,
  });

  let raw = "";
  let failed = false;
  const client = makeKimiClient();

  try {
    await client.connect();
    client.on("event", (evt) => {
      const e = evt.detail;
      if (e.type === "ContentPart" && e.payload?.type === "text") {
        raw += e.payload.text;
      }
    });
    await client.prompt(prompt);
  } catch (e) {
    failed = true;
    raw = e.message || String(e);
  } finally {
    try {
      await client.dispose();
    } catch {
      // ignore cleanup failures
    }
  }

  const parsed = failed
    ? { summary: raw, changedFiles: [], verification: [], followUp: [] }
    : parseCodeResult(raw);
  const output = {
    raw,
    summary: parsed.summary,
    changedFiles: parsed.changedFiles,
    verification: parsed.verification,
    followUp: parsed.followUp,
  };

  await jc.update(jobId, {
    status: failed ? "failed" : "finished",
    finishedAt: Date.now(),
    output,
  });

  console.log(renderCodeResult({ status: failed ? "failed" : "finished", ...output }));
  process.exit(failed ? 1 : 0);
}

async function cmdTask(positional) {
  const prompt = positional.join(" ");
  if (!prompt) {
    console.error("Error: No task prompt provided.");
    process.exit(1);
  }

  const jc = new JobControl({ stateDir: process.env.KIMI_STATE_DIR });
  const jobId = await jc.create({
    kind: "task",
    status: "running",
    startedAt: Date.now(),
    prompt,
  });

  let output = "";
  let failed = false;
  try {
    const client = makeKimiClient();
    await client.connect();
    client.on("event", (evt) => {
      const e = evt.detail;
      if (e.type === "ContentPart" && e.payload?.type === "text") {
        output += e.payload.text;
      }
    });
    await client.prompt(prompt);
    await client.dispose();
  } catch (e) {
    failed = true;
    output = e.message;
  }

  await jc.update(jobId, {
    status: failed ? "failed" : "finished",
    finishedAt: Date.now(),
    output: { raw: output },
  });

  console.log(renderTaskResult({ status: failed ? "failed" : "finished", output }));
  process.exit(failed ? 1 : 0);
}

async function cmdStatus() {
  const jc = new JobControl({ stateDir: process.env.KIMI_STATE_DIR });
  const snapshot = await jc.snapshot();
  console.log(renderStatusSnapshot(snapshot));
}

async function cmdResult(flags) {
  const id = flags.id || flags.i;
  if (!id) {
    console.error("Error: --id is required.");
    process.exit(1);
  }
  const jc = new JobControl({ stateDir: process.env.KIMI_STATE_DIR });
  const job = await jc.read(id);
  if (!job) {
    console.error("Error: Job not found.");
    process.exit(1);
  }
  if (job.status !== "finished" && job.status !== "failed" && job.status !== "cancelled") {
    console.error(`Error: Job is still ${job.status}.`);
    process.exit(1);
  }

  if (job.kind === "review" || job.kind === "adversarial-review") {
    console.log(renderReviewResult(job.output || {}));
  } else {
    console.log(renderTaskResult({ status: job.status, output: job.output?.raw }));
  }
}

async function cmdCancel(flags) {
  const id = flags.id || flags.i;
  if (!id) {
    console.error("Error: --id is required.");
    process.exit(1);
  }
  const jc = new JobControl({ stateDir: process.env.KIMI_STATE_DIR });
  const job = await jc.read(id);
  if (!job) {
    console.error("Error: Job not found.");
    process.exit(1);
  }
  if (job.status !== "running" && job.status !== "queued") {
    console.error(`Error: Job is already ${job.status}.`);
    process.exit(1);
  }
  await jc.update(id, { status: "cancelled", finishedAt: Date.now() });
  console.log(`Job ${id.slice(0, 8)} cancelled.`);
}

async function main() {
  const { subcommand, flags, positional } = parseArgs(process.argv);

  if (!SUBCOMMANDS.includes(subcommand)) {
    console.error(`Usage: kimi-companion.mjs <${SUBCOMMANDS.join("|")}> [options]`);
    process.exit(1);
  }

  switch (subcommand) {
    case "setup":
      await cmdSetup();
      break;
    case "review":
    case "adversarial-review":
      flags.adversarial = subcommand === "adversarial-review";
      await cmdReview(flags);
      break;
    case "task":
      await cmdTask(positional);
      break;
    case "code":
    case "implement":
      await cmdCode(positional);
      break;
    case "status":
      await cmdStatus();
      break;
    case "result":
      await cmdResult(flags);
      break;
    case "cancel":
      await cmdCancel(flags);
      break;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

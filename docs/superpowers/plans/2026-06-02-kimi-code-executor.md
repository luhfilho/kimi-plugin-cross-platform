# Kimi Code Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-platform code implementation path where Claude Code, Codex CLI, and Antigravity CLI plan natively and delegate implementation to Kimi Code through the shared companion.

**Architecture:** Keep behavior in `core/src` and `kimi-companion.mjs`; adapters only expose host-native commands, skills, agents, rules, and workflows. Add a `code`/`implement` companion command that wraps host-authored plans in a stable Kimi executor prompt, persists `kind: "code"` jobs, parses structured implementation reports, and renders status/results consistently.

**Tech Stack:** Node.js ESM, built-in `node:test`, Kimi Wire Protocol over stdio, existing fake-Kimi fixture, Markdown/TOML adapter artifacts.

---

## File Structure

Create:

- `core/src/code-result.mjs` - prompt wrapping and structured output parsing for code implementation jobs.
- `tests/unit/code-result.test.mjs` - unit coverage for code prompt and result parsing.
- `adapters/claude-code/plugins/kimi/commands/code.md` - Claude Code slash command for implementation delegation.
- `adapters/claude-code/plugins/kimi/commands/implement.md` - Claude Code alias command for implementation delegation.
- `adapters/claude-code/plugins/kimi/agents/kimi-code.md` - Claude Code plugin agent instructions for planner-native, Kimi-executor workflow.
- `adapters/codex-cli/agents/kimi-programmer.toml` - Codex agent role metadata for Kimi coding delegation.
- `adapters/codex-cli/skills/kimi-code/SKILL.md` - Codex skill that tells Codex to plan first and invoke Kimi as programmer.
- `adapters/antigravity-cli/skills/kimi-code/SKILL.md` - Antigravity skill equivalent.
- `adapters/antigravity-cli/workflows/kimi-code.md` - Antigravity workflow equivalent.

Modify:

- `core/src/wire-client.mjs` - configurable cwd, initialize payload, request handler, and request-response helpers.
- `core/src/render.mjs` - add `renderCodeResult`, keep status rendering compatible.
- `adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs` - add `code` and `implement` subcommands.
- `tests/fixtures/fake-kimi.mjs` - add code success, code plain text, and approval-request scenarios.
- `tests/unit/wire-client.test.mjs` - add request handling and cwd/init option tests.
- `tests/unit/render.test.mjs` - add code result rendering tests.
- `tests/integration/companion.test.mjs` - add companion `code`/`implement` integration tests.
- `tests/adapters/codex-adapter.test.mjs` - include new Codex skill/agent metadata.
- `tests/adapters/cross-platform-code-adapter.test.mjs` - verify all three host adapter surfaces exist.
- `scripts/install.mjs` - update installed feature messages.
- `README.md` - document `/kimi:code`, Kimi Code executor env vars, and `kimi-agent` example.
- `ARCHITECTURE.md` - document planner/executor split and code job lifecycle.
- `TESTING.md` - document new fake-Kimi scenarios and test commands.

---

### Task 1: Code Result Contract

**Files:**
- Create: `core/src/code-result.mjs`
- Create: `tests/unit/code-result.test.mjs`

- [ ] **Step 1: Write failing prompt/result tests**

Create `tests/unit/code-result.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildCodePrompt, parseCodeResult } from "../../core/src/code-result.mjs";

test("buildCodePrompt wraps a host-authored plan with implementation constraints", () => {
  const prompt = buildCodePrompt({
    plan: "Change render.mjs and run node --test tests/unit/render.test.mjs",
    worktreeRoot: "/repo",
  });

  assert.match(prompt, /You are Kimi Code acting as the implementation worker/);
  assert.match(prompt, /Host-authored implementation plan/);
  assert.match(prompt, /Change render\.mjs/);
  assert.match(prompt, /\/repo/);
  assert.match(prompt, /Return your final answer as JSON/);
  assert.match(prompt, /changed_files/);
  assert.match(prompt, /verification/);
});

test("parseCodeResult accepts structured JSON output", () => {
  const parsed = parseCodeResult(JSON.stringify({
    summary: "Added code result renderer.",
    changed_files: ["core/src/render.mjs"],
    verification: [
      { command: "node --test tests/unit/render.test.mjs", status: "passed", notes: "all good" },
    ],
    follow_up: ["Run full suite"],
  }));

  assert.equal(parsed.summary, "Added code result renderer.");
  assert.deepEqual(parsed.changedFiles, ["core/src/render.mjs"]);
  assert.deepEqual(parsed.verification, [
    { command: "node --test tests/unit/render.test.mjs", status: "passed", notes: "all good" },
  ]);
  assert.deepEqual(parsed.followUp, ["Run full suite"]);
  assert.equal(parsed.raw, undefined);
});

test("parseCodeResult extracts JSON from fenced output", () => {
  const parsed = parseCodeResult([
    "Here is the report:",
    "```json",
    "{\"summary\":\"Done\",\"changed_files\":[\"README.md\"],\"verification\":[],\"follow_up\":[]}",
    "```",
  ].join("\n"));

  assert.equal(parsed.summary, "Done");
  assert.deepEqual(parsed.changedFiles, ["README.md"]);
  assert.deepEqual(parsed.verification, []);
  assert.deepEqual(parsed.followUp, []);
});

test("parseCodeResult preserves plain text as raw fallback", () => {
  const parsed = parseCodeResult("Implemented the change and tests passed.");

  assert.equal(parsed.summary, "Implemented the change and tests passed.");
  assert.deepEqual(parsed.changedFiles, []);
  assert.deepEqual(parsed.verification, []);
  assert.deepEqual(parsed.followUp, []);
  assert.equal(parsed.raw, "Implemented the change and tests passed.");
});

test("parseCodeResult normalizes invalid verification statuses", () => {
  const parsed = parseCodeResult(JSON.stringify({
    summary: "Done",
    changed_files: ["a.js"],
    verification: [{ command: "npm test", status: "green", notes: "ok" }],
    follow_up: [],
  }));

  assert.deepEqual(parsed.verification, [
    { command: "npm test", status: "not_run", notes: "ok" },
  ]);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/unit/code-result.test.mjs
```

Expected: fail with `ERR_MODULE_NOT_FOUND` for `core/src/code-result.mjs`.

- [ ] **Step 3: Implement `core/src/code-result.mjs`**

Create `core/src/code-result.mjs`:

```js
const VALID_VERIFICATION_STATUSES = new Set(["passed", "failed", "not_run"]);

export function buildCodePrompt({ plan, worktreeRoot }) {
  const rootLine = worktreeRoot ? `Repository root: ${worktreeRoot}` : "Repository root: current working directory";
  return [
    "You are Kimi Code acting as the implementation worker.",
    "",
    "The host CLI model has already planned the work. Follow the plan closely and do not broaden scope.",
    "If the plan is impossible or unsafe, stop and report the blocker instead of guessing.",
    rootLine,
    "",
    "Host-authored implementation plan:",
    plan,
    "",
    "Implementation rules:",
    "- Read the relevant files before editing.",
    "- Keep changes limited to the requested task.",
    "- Run the verification commands named in the plan when possible.",
    "- If verification cannot run, explain the exact reason.",
    "- Return your final answer as JSON with this exact shape:",
    "{",
    "  \"summary\": \"short implementation summary\",",
    "  \"changed_files\": [\"path\"],",
    "  \"verification\": [",
    "    {\"command\": \"command run\", \"status\": \"passed|failed|not_run\", \"notes\": \"short notes\"}",
    "  ],",
    "  \"follow_up\": [\"remaining item\"]",
    "}",
  ].join("\n");
}

export function parseCodeResult(rawOutput) {
  const raw = String(rawOutput || "").trim();
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return {
      summary: raw || "No implementation output was returned.",
      changedFiles: [],
      verification: [],
      followUp: [],
      raw,
    };
  }

  return {
    summary: normalizeString(parsed.summary) || "Implementation completed.",
    changedFiles: normalizeStringArray(parsed.changed_files || parsed.changedFiles),
    verification: normalizeVerification(parsed.verification),
    followUp: normalizeStringArray(parsed.follow_up || parsed.followUp),
  };
}

function parseJsonObject(raw) {
  if (!raw) return null;
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeString).filter(Boolean);
}

function normalizeVerification(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const command = normalizeString(entry?.command);
    const rawStatus = normalizeString(entry?.status);
    const status = VALID_VERIFICATION_STATUSES.has(rawStatus) ? rawStatus : "not_run";
    const notes = normalizeString(entry?.notes);
    return { command, status, notes };
  }).filter((entry) => entry.command || entry.notes);
}
```

- [ ] **Step 4: Run the code-result test**

Run:

```bash
node --test tests/unit/code-result.test.mjs
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add core/src/code-result.mjs tests/unit/code-result.test.mjs
git commit -m "feat: add kimi code result contract"
```

---

### Task 2: WireClient Execution Options

**Files:**
- Modify: `core/src/wire-client.mjs`
- Modify: `tests/unit/wire-client.test.mjs`
- Modify: `tests/fixtures/fake-kimi.mjs`

- [ ] **Step 1: Add fake-Kimi initialize capture**

Modify `tests/fixtures/fake-kimi.mjs` so `handleInitialize` records the initialize params when requested:

```js
  if (process.env.FAKE_KIMI_ECHO_INITIALIZE === "1") {
    sendEvent("ContentPart", { type: "text", text: JSON.stringify({ initialize: msg.params }) });
  }
```

Place it after `initialized = true;` and before `sendSuccess(...)`.

- [ ] **Step 2: Add failing WireClient tests**

Append to `tests/unit/wire-client.test.mjs`:

```js
test("WireClient passes cwd and custom initialize params", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "wire-cwd-"));
  const client = new WireClient({
    command: process.execPath,
    args: [FAKE_KIMI],
    cwd: tmp,
    capabilities: { supports_question: true, supports_plan_mode: false },
    externalTools: [
      { name: "open_in_ide", description: "Open file", parameters: { type: "object" } },
    ],
    env: { ...process.env, FAKE_KIMI_ECHO_INITIALIZE: "1" },
  });
  t.after(() => client.dispose());

  const info = await client.connect();
  assert.equal(info.server.name, "fake-kimi");
  assert.equal(client.cwd, tmp);
  assert.equal(client.initializeParams.capabilities.supports_question, true);
  assert.equal(client.initializeParams.external_tools[0].name, "open_in_ide");
});

test("WireClient custom request handler can reject approvals", async (t) => {
  const client = new WireClient({
    command: process.execPath,
    args: [FAKE_KIMI],
    env: { ...process.env, FAKE_KIMI_BEHAVIOR: "approval-required" },
    requestHandler: async (request) => {
      if (request.type === "ApprovalRequest") {
        return {
          request_id: request.payload.id,
          response: "reject",
          feedback: "approval disabled in test",
        };
      }
      return null;
    },
  });
  t.after(() => client.dispose());

  await client.connect();
  const result = await client.prompt("try write");
  assert.equal(result.status, "finished");
});
```

If the existing test file uses different fixture constants, reuse its existing `FAKE_KIMI`, `mkdtemp`, `tmpdir`, and import style instead of duplicating imports.

- [ ] **Step 3: Run failing WireClient tests**

Run:

```bash
node --test tests/unit/wire-client.test.mjs
```

Expected: fail because `cwd`, `capabilities`, `externalTools`, `requestHandler`, `client.cwd`, and `client.initializeParams` do not exist.

- [ ] **Step 4: Implement WireClient options**

Modify `core/src/wire-client.mjs` constructor:

```js
    this._cwd = opts.cwd || opts.workDir || undefined;
    this._capabilities = opts.capabilities || { supports_question: false, supports_plan_mode: false };
    this._externalTools = opts.externalTools || opts.external_tools || [];
    this._hooks = opts.hooks || [];
    this._requestHandler = opts.requestHandler || null;
    this._initializeParams = null;
```

Add getters after `streaming`:

```js
  get cwd() {
    return this._cwd;
  }

  get initializeParams() {
    return this._initializeParams;
  }
```

Modify the spawn call:

```js
    this._proc = spawn(this._command, this._args, {
      cwd: this._cwd,
      env: this._env,
      stdio: ["pipe", "pipe", "pipe"],
    });
```

Replace the initialize request params with:

```js
    this._initializeParams = {
      protocol_version: "1.10",
      client: { name: "kimi-plugin-cross-platform", version: "0.1.0" },
      capabilities: this._capabilities,
    };
    if (this._externalTools.length > 0) {
      this._initializeParams.external_tools = this._externalTools;
    }
    if (this._hooks.length > 0) {
      this._initializeParams.hooks = this._hooks;
    }
```

Then set request params to `this._initializeParams`.

Replace the server request branch in `_handleMessage`:

```js
    if (msg.method === "request") {
      const envelope = msg.params;
      this.dispatchEvent(new CustomEvent("request", { detail: envelope }));
      this._respondToServerRequest(msg.id, envelope);
      return;
    }
```

Add the new helper:

```js
  async _respondToServerRequest(requestId, envelope) {
    try {
      if (this._requestHandler) {
        const handled = await this._requestHandler(envelope);
        if (handled) {
          this._sendRaw({ jsonrpc: "2.0", id: requestId, result: handled });
          return;
        }
      }
      this._autoRespond(requestId, envelope);
    } catch (err) {
      this._sendRaw({
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code: -32000,
          message: err?.message || "Wire request handler failed",
        },
      });
    }
  }
```

- [ ] **Step 5: Add fake approval scenario**

Modify `tests/fixtures/fake-kimi.mjs` in `handlePrompt` before normal content behaviors:

```js
  if (BEHAVIOR === "approval-required") {
    sendRequest("ApprovalRequest", {
      id: "approval-1",
      tool_call_id: "tc-1",
      sender: "Write",
      action: "write file",
      description: "Write file README.md",
      display: [],
    });
    await delay(DELAY_MS);
    sendEvent("ContentPart", { type: "text", text: "Approval request handled." });
  } else if (BEHAVIOR === "review-ok") {
```

Change the existing `if (BEHAVIOR === "review-ok")` to the `else if` shown above.

- [ ] **Step 6: Run WireClient tests**

Run:

```bash
node --test tests/unit/wire-client.test.mjs
```

Expected: pass.

- [ ] **Step 7: Run fake fixture affected tests**

Run:

```bash
node --test tests/integration/companion.test.mjs
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add core/src/wire-client.mjs tests/unit/wire-client.test.mjs tests/fixtures/fake-kimi.mjs
git commit -m "feat: configure kimi wire execution"
```

---

### Task 3: Code Result Rendering

**Files:**
- Modify: `core/src/render.mjs`
- Modify: `tests/unit/render.test.mjs`

- [ ] **Step 1: Add failing render tests**

Append to `tests/unit/render.test.mjs`:

```js
test("renderCodeResult renders structured implementation output", () => {
  const md = renderCodeResult({
    status: "finished",
    summary: "Added code command.",
    changedFiles: ["adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs"],
    verification: [
      { command: "node --test tests/integration/companion.test.mjs", status: "passed", notes: "ok" },
    ],
    followUp: ["Run npm test"],
  });

  assert.match(md, /## Code Result \(finished\)/);
  assert.match(md, /Added code command/);
  assert.match(md, /Changed Files/);
  assert.match(md, /kimi-companion\.mjs/);
  assert.match(md, /node --test tests\/integration\/companion\.test\.mjs/);
  assert.match(md, /Run npm test/);
});

test("renderCodeResult renders raw output fallback", () => {
  const md = renderCodeResult({
    status: "finished",
    summary: "Plain result",
    changedFiles: [],
    verification: [],
    followUp: [],
    raw: "Plain result",
  });

  assert.match(md, /Plain result/);
  assert.match(md, /Raw Output/);
});
```

Add `renderCodeResult` to the existing import from `../../core/src/render.mjs`.

- [ ] **Step 2: Run failing render tests**

Run:

```bash
node --test tests/unit/render.test.mjs
```

Expected: fail because `renderCodeResult` is not exported.

- [ ] **Step 3: Implement `renderCodeResult`**

Append to `core/src/render.mjs`:

```js
export function renderCodeResult({ status, summary, changedFiles = [], verification = [], followUp = [], raw, error }) {
  if (error) {
    return `## Code Result (failed)\n\n\`\`\`\n${error}\n\`\`\``;
  }

  const lines = [`## Code Result (${status})`, ""];
  if (summary) {
    lines.push(summary, "");
  }

  if (changedFiles.length > 0) {
    lines.push("### Changed Files");
    for (const file of changedFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  if (verification.length > 0) {
    lines.push("### Verification");
    lines.push("| Command | Status | Notes |");
    lines.push("|---|---|---|");
    for (const item of verification) {
      lines.push(`| \`${item.command || ""}\` | ${item.status || "not_run"} | ${item.notes || ""} |`);
    }
    lines.push("");
  }

  if (followUp.length > 0) {
    lines.push("### Follow Up");
    for (const item of followUp) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (raw) {
    lines.push("### Raw Output", "", "```", raw, "```");
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run render tests**

Run:

```bash
node --test tests/unit/render.test.mjs
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add core/src/render.mjs tests/unit/render.test.mjs
git commit -m "feat: render kimi code results"
```

---

### Task 4: Companion Code Command

**Files:**
- Modify: `adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs`
- Modify: `tests/fixtures/fake-kimi.mjs`
- Modify: `tests/integration/companion.test.mjs`

- [ ] **Step 1: Add fake code scenarios**

Modify the behavior comment in `tests/fixtures/fake-kimi.mjs`:

```js
 *   - "code-json"        : Returns structured code implementation output
 *   - "code-text"        : Returns plain text code implementation output
```

Add branches in `handlePrompt`:

```js
  } else if (BEHAVIOR === "code-json") {
    sendEvent("ContentPart", {
      type: "text",
      text: JSON.stringify({
        summary: "Implemented code command.",
        changed_files: ["core/src/code-result.mjs"],
        verification: [
          { command: "node --test tests/unit/code-result.test.mjs", status: "passed", notes: "passed" },
        ],
        follow_up: ["Run npm test"],
      }),
    });
  } else if (BEHAVIOR === "code-text") {
    sendEvent("ContentPart", { type: "text", text: "Implemented code command in plain text." });
```

Place these before the existing `task-complete` branch.

- [ ] **Step 2: Add failing companion integration tests**

Append to `tests/integration/companion.test.mjs`:

```js
test("code command stores structured implementation result", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "kimi-code-"));
  const result = await runCompanion(["code", "Implement renderCodeResult"], {
    KIMI_COMMAND: process.execPath,
    KIMI_ARGS: FAKE_KIMI,
    KIMI_STATE_DIR: stateDir,
    FAKE_KIMI_BEHAVIOR: "code-json",
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Code Result \(finished\)/);
  assert.match(result.stdout, /Implemented code command/);
  assert.match(result.stdout, /core\/src\/code-result\.mjs/);

  const files = await readdir(stateDir);
  assert.equal(files.length, 1);
  const job = JSON.parse(await readFile(join(stateDir, files[0]), "utf8"));
  assert.equal(job.kind, "code");
  assert.equal(job.status, "finished");
  assert.equal(job.output.summary, "Implemented code command.");
  assert.deepEqual(job.output.changedFiles, ["core/src/code-result.mjs"]);
});

test("implement alias runs the code command", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "kimi-implement-"));
  const result = await runCompanion(["implement", "Implement alias"], {
    KIMI_COMMAND: process.execPath,
    KIMI_ARGS: FAKE_KIMI,
    KIMI_STATE_DIR: stateDir,
    FAKE_KIMI_BEHAVIOR: "code-text",
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Code Result \(finished\)/);
  assert.match(result.stdout, /Implemented code command in plain text/);
});
```

Use the existing helper names in the file. If the helper is called `execCompanion` instead of `runCompanion`, keep the existing helper and only add the assertions above.

- [ ] **Step 3: Run failing integration tests**

Run:

```bash
node --test tests/integration/companion.test.mjs
```

Expected: fail because `code` and `implement` are not valid subcommands.

- [ ] **Step 4: Import code-result and render code output**

Modify the import block in `kimi-companion.mjs`:

```js
const { renderSetupReport, renderReviewResult, renderTaskResult, renderStatusSnapshot, renderCodeResult } =
  await import(join(CORE_SRC, "render.mjs"));
const { buildCodePrompt, parseCodeResult } = await import(join(CORE_SRC, "code-result.mjs"));
```

- [ ] **Step 5: Add subcommands and executor config**

Change `SUBCOMMANDS`:

```js
const SUBCOMMANDS = ["setup", "review", "adversarial-review", "task", "code", "implement", "status", "result", "cancel"];
```

Replace `makeKimiClient()` with:

```js
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
```

- [ ] **Step 6: Add `cmdCode`**

Add after `cmdTask`:

```js
async function cmdCode(positional) {
  const plan = positional.join(" ");
  if (!plan) {
    console.error("Error: No implementation plan provided.");
    process.exit(1);
  }

  const executor = getExecutorInfo();
  const prompt = buildCodePrompt({ plan, worktreeRoot: executor.worktreeRoot });
  const jc = new JobControl({ stateDir: process.env.KIMI_STATE_DIR });
  const jobId = await jc.create({
    kind: "code",
    status: "running",
    startedAt: Date.now(),
    prompt: plan,
    worktreeRoot: executor.worktreeRoot,
    executor: executor.executor,
    model: executor.model,
    permissionMode: executor.permissionMode,
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

  const parsed = failed
    ? { summary: output, changedFiles: [], verification: [], followUp: [], raw: output }
    : parseCodeResult(output);

  await jc.update(jobId, {
    status: failed ? "failed" : "finished",
    finishedAt: Date.now(),
    output: {
      raw: output,
      summary: parsed.summary,
      changedFiles: parsed.changedFiles,
      verification: parsed.verification,
      followUp: parsed.followUp,
    },
  });

  console.log(renderCodeResult({ status: failed ? "failed" : "finished", ...parsed }));
  process.exit(failed ? 1 : 0);
}
```

- [ ] **Step 7: Route `code` and `implement`**

Add to the switch in `main()`:

```js
    case "code":
    case "implement":
      await cmdCode(positional);
      break;
```

- [ ] **Step 8: Run integration tests**

Run:

```bash
node --test tests/integration/companion.test.mjs
```

Expected: pass.

- [ ] **Step 9: Run unit tests touched so far**

Run:

```bash
npm run test:unit
```

Expected: pass.

- [ ] **Step 10: Commit**

Run:

```bash
git add adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs tests/fixtures/fake-kimi.mjs tests/integration/companion.test.mjs
git commit -m "feat: add kimi code companion command"
```

---

### Task 5: Result Command Support for Code Jobs

**Files:**
- Modify: `adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs`
- Modify: `tests/integration/companion.test.mjs`

- [ ] **Step 1: Add failing result rendering test**

Append to `tests/integration/companion.test.mjs`:

```js
test("result renders code job output with code renderer", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "kimi-code-result-"));
  const codeResult = await runCompanion(["code", "Implement result renderer"], {
    KIMI_COMMAND: process.execPath,
    KIMI_ARGS: FAKE_KIMI,
    KIMI_STATE_DIR: stateDir,
    FAKE_KIMI_BEHAVIOR: "code-json",
  });
  assert.equal(codeResult.code, 0);

  const files = await readdir(stateDir);
  const id = files[0].replace(/\.json$/, "");
  const result = await runCompanion(["result", "--id", id], {
    KIMI_COMMAND: process.execPath,
    KIMI_ARGS: FAKE_KIMI,
    KIMI_STATE_DIR: stateDir,
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Code Result \(finished\)/);
  assert.match(result.stdout, /Implemented code command/);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/integration/companion.test.mjs
```

Expected: fail because `cmdResult` renders all non-review jobs through `renderTaskResult`.

- [ ] **Step 3: Update `cmdResult`**

In `cmdResult(flags)`, before the existing fallback renderer, add:

```js
  if (job.kind === "code") {
    console.log(renderCodeResult({
      status: job.status,
      summary: job.output?.summary,
      changedFiles: job.output?.changedFiles || [],
      verification: job.output?.verification || [],
      followUp: job.output?.followUp || [],
      raw: job.output?.raw,
    }));
    return;
  }
```

- [ ] **Step 4: Run companion integration tests**

Run:

```bash
node --test tests/integration/companion.test.mjs
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs tests/integration/companion.test.mjs
git commit -m "feat: render persisted kimi code jobs"
```

---

### Task 6: Claude Code Adapter Surface

**Files:**
- Create: `adapters/claude-code/plugins/kimi/commands/code.md`
- Create: `adapters/claude-code/plugins/kimi/commands/implement.md`
- Create: `adapters/claude-code/plugins/kimi/agents/kimi-code.md`
- Create: `tests/adapters/cross-platform-code-adapter.test.mjs`

- [ ] **Step 1: Add failing adapter surface test**

Create `tests/adapters/cross-platform-code-adapter.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Claude Code exposes Kimi code commands and agent", () => {
  assert.equal(existsSync(join(ROOT, "adapters/claude-code/plugins/kimi/commands/code.md")), true);
  assert.equal(existsSync(join(ROOT, "adapters/claude-code/plugins/kimi/commands/implement.md")), true);
  assert.equal(existsSync(join(ROOT, "adapters/claude-code/plugins/kimi/agents/kimi-code.md")), true);

  const command = read("adapters/claude-code/plugins/kimi/commands/code.md");
  assert.match(command, /command: \/kimi:code/);
  assert.match(command, /kimi-companion\.mjs code/);

  const alias = read("adapters/claude-code/plugins/kimi/commands/implement.md");
  assert.match(alias, /command: \/kimi:implement/);
  assert.match(alias, /kimi-companion\.mjs implement/);

  const agent = read("adapters/claude-code/plugins/kimi/agents/kimi-code.md");
  assert.match(agent, /name: kimi-code/);
  assert.match(agent, /plan first/i);
  assert.match(agent, /Kimi/i);
});
```

- [ ] **Step 2: Run failing adapter test**

Run:

```bash
node --test tests/adapters/cross-platform-code-adapter.test.mjs
```

Expected: fail because the Claude Code files do not exist.

- [ ] **Step 3: Create Claude command `/kimi:code`**

Create `adapters/claude-code/plugins/kimi/commands/code.md`:

```md
---
name: code
command: /kimi:code
description: Plan with Claude Code and delegate implementation to Kimi Code
---

Use this command when the user wants Kimi to act as the implementation worker.

Workflow:

1. Use Claude Code's native model to understand the request and inspect the repository.
2. Write a concrete implementation plan with files, changes, and verification commands.
3. Invoke `kimi-companion.mjs code "<self-contained implementation plan>"`.
4. Inspect the resulting diff and Kimi report before telling the user the work is complete.

Do not send vague requests to Kimi. The plan must be self-contained.
```

- [ ] **Step 4: Create Claude alias `/kimi:implement`**

Create `adapters/claude-code/plugins/kimi/commands/implement.md`:

```md
---
name: implement
command: /kimi:implement
description: Alias for /kimi:code
---

Use this command as an alias for `/kimi:code`.

Workflow:

1. Plan with Claude Code's native model.
2. Invoke `kimi-companion.mjs implement "<self-contained implementation plan>"`.
3. Review the diff and verification output before final response.
```

- [ ] **Step 5: Create Claude agent `kimi-code`**

Create `adapters/claude-code/plugins/kimi/agents/kimi-code.md`:

```md
---
name: kimi-code
command: /kimi:code
description: Kimi Code implementation worker delegation agent
---

You coordinate implementation delegation to Kimi Code.

Required workflow:

1. Plan first using Claude Code's native model.
2. Make the plan self-contained: include repository constraints, exact task, files likely to touch, and verification commands.
3. Invoke the Kimi companion with `kimi-companion.mjs code "<plan>"`.
4. After Kimi returns, inspect the changed files and verification output.
5. Report completion only after the host model has reviewed the result.

Kimi is the programmer. Claude Code remains the planner and reviewer.
```

- [ ] **Step 6: Run adapter test**

Run:

```bash
node --test tests/adapters/cross-platform-code-adapter.test.mjs
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add adapters/claude-code/plugins/kimi/commands/code.md adapters/claude-code/plugins/kimi/commands/implement.md adapters/claude-code/plugins/kimi/agents/kimi-code.md tests/adapters/cross-platform-code-adapter.test.mjs
git commit -m "feat: add claude kimi code adapter"
```

---

### Task 7: Codex CLI Adapter Surface

**Files:**
- Create: `adapters/codex-cli/agents/kimi-programmer.toml`
- Create: `adapters/codex-cli/skills/kimi-code/SKILL.md`
- Modify: `tests/adapters/codex-adapter.test.mjs`
- Modify: `tests/adapters/cross-platform-code-adapter.test.mjs`

- [ ] **Step 1: Add failing Codex adapter tests**

Append to `tests/adapters/codex-adapter.test.mjs`:

```js
test("Codex Kimi code skill and programmer agent are installed artifacts", () => {
  const skill = readFileSync(join(CODEX_ADAPTER_ROOT, "skills/kimi-code/SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: kimi-code\n/m);
  assert.match(skill, /plan first/i);
  assert.match(skill, /kimi-companion\.mjs code/);

  const agent = readFileSync(join(CODEX_ADAPTER_ROOT, "agents/kimi-programmer.toml"), "utf8");
  assert.match(agent, /name = "kimi-programmer"/);
  assert.match(agent, /Kimi Code/);
});
```

Append to `tests/adapters/cross-platform-code-adapter.test.mjs`:

```js
test("Codex CLI exposes Kimi code skill and agent", () => {
  assert.equal(existsSync(join(ROOT, "adapters/codex-cli/skills/kimi-code/SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "adapters/codex-cli/agents/kimi-programmer.toml")), true);
});
```

- [ ] **Step 2: Run failing adapter tests**

Run:

```bash
npm run test:adapters
```

Expected: fail because Codex code skill and agent do not exist.

- [ ] **Step 3: Create Codex programmer agent**

Create `adapters/codex-cli/agents/kimi-programmer.toml`:

```toml
name = "kimi-programmer"
description = "Plan with Codex and delegate implementation to Kimi Code"

developer_instructions = """
Use Codex native reasoning for planning and final review.
Invoke Kimi Code only after a concrete implementation plan exists.
Prompts sent to Kimi must be self-contained and include files, constraints, and verification commands.
After Kimi returns, inspect the diff and verification output before reporting completion.
"""
```

- [ ] **Step 4: Create Codex skill**

Create `adapters/codex-cli/skills/kimi-code/SKILL.md`:

```md
---
name: kimi-code
description: Plan with Codex, then delegate implementation to Kimi Code as the programmer.
---

# Kimi Code

Use this when the user wants Kimi to implement code from Codex.

## Required Workflow

1. Plan first with Codex's native model.
2. Inspect the repository enough to make the plan concrete.
3. Write a self-contained implementation plan with:
   - exact task;
   - relevant constraints;
   - files likely to change;
   - verification commands;
   - expected final report.
4. Run:

```bash
node path/to/kimi-companion.mjs code "<self-contained implementation plan>"
```

5. Inspect Kimi's output and resulting diff.
6. Report completion only after Codex has reviewed the result.

Kimi is the programmer. Codex remains the planner and reviewer.
```

- [ ] **Step 5: Run adapter tests**

Run:

```bash
npm run test:adapters
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add adapters/codex-cli/agents/kimi-programmer.toml adapters/codex-cli/skills/kimi-code/SKILL.md tests/adapters/codex-adapter.test.mjs tests/adapters/cross-platform-code-adapter.test.mjs
git commit -m "feat: add codex kimi code adapter"
```

---

### Task 8: Antigravity CLI Adapter Surface

**Files:**
- Create: `adapters/antigravity-cli/skills/kimi-code/SKILL.md`
- Create: `adapters/antigravity-cli/workflows/kimi-code.md`
- Modify: `adapters/antigravity-cli/rules/kimi-plugin.md`
- Modify: `tests/adapters/cross-platform-code-adapter.test.mjs`

- [ ] **Step 1: Add failing Antigravity adapter test**

Append to `tests/adapters/cross-platform-code-adapter.test.mjs`:

```js
test("Antigravity CLI exposes Kimi code skill and workflow", () => {
  assert.equal(existsSync(join(ROOT, "adapters/antigravity-cli/skills/kimi-code/SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "adapters/antigravity-cli/workflows/kimi-code.md")), true);
  const rules = read("adapters/antigravity-cli/rules/kimi-plugin.md");
  assert.match(rules, /planner/i);
  assert.match(rules, /programmer/i);
});
```

- [ ] **Step 2: Run failing adapter test**

Run:

```bash
node --test tests/adapters/cross-platform-code-adapter.test.mjs
```

Expected: fail because Antigravity code skill/workflow do not exist.

- [ ] **Step 3: Create Antigravity skill**

Create `adapters/antigravity-cli/skills/kimi-code/SKILL.md`:

```md
# Kimi Code

Use when implementation should be delegated to Kimi Code.

Required workflow:

1. Plan first with Antigravity's native model.
2. Make the plan self-contained with task, constraints, likely files, and verification commands.
3. Invoke `kimi-companion.mjs code "<self-contained implementation plan>"`.
4. Review Kimi's result and changed files before final response.

Kimi is the programmer. Antigravity remains the planner and reviewer.
```

- [ ] **Step 4: Create Antigravity workflow**

Create `adapters/antigravity-cli/workflows/kimi-code.md`:

```md
---
name: kimi-code
trigger: /kimi-code
---

# Kimi Code Workflow

Delegate implementation to Kimi Code after native planning.

## Steps

1. Capture the user's implementation request.
2. Use the native Antigravity model to inspect the repository and produce a concrete plan.
3. Invoke `kimi-companion.mjs code "<self-contained implementation plan>"`.
4. Report job ID and status.
5. Review Kimi's output, changed files, and verification before declaring completion.
```

- [ ] **Step 5: Update Antigravity rules**

Append to `adapters/antigravity-cli/rules/kimi-plugin.md`:

```md
## Planner/executor split

- For implementation work, Antigravity is the planner and reviewer.
- Kimi Code is the programmer.
- Do not send vague implementation prompts to Kimi; send a self-contained plan.
- After Kimi finishes, inspect changed files and verification output before reporting completion.
```

- [ ] **Step 6: Run adapter test**

Run:

```bash
node --test tests/adapters/cross-platform-code-adapter.test.mjs
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add adapters/antigravity-cli/skills/kimi-code/SKILL.md adapters/antigravity-cli/workflows/kimi-code.md adapters/antigravity-cli/rules/kimi-plugin.md tests/adapters/cross-platform-code-adapter.test.mjs
git commit -m "feat: add antigravity kimi code adapter"
```

---

### Task 9: Installer and Documentation

**Files:**
- Modify: `scripts/install.mjs`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `TESTING.md`

- [ ] **Step 1: Update installer messages**

Modify `scripts/install.mjs` Codex success message:

```js
  console.log(`   Skills available: kimi-review, kimi-rescue, kimi-code, kimi-status`);
```

Modify Claude install message:

```js
  console.log(`   Then run: /kimi:setup or /kimi:code`);
```

Modify Antigravity install message:

```js
  console.log(`   Workflows available: kimi-review, kimi-rescue, kimi-code, kimi-status`);
```

- [ ] **Step 2: Add README command docs**

Add `/kimi:code` and `/kimi:implement` to the Claude Code command list near existing `/kimi:rescue`.

Add `kimi-code` to Codex and Antigravity capability lists.

Add a companion section after `task`:

```md
### `code` / `implement`

Delegates implementation to Kimi Code from a host-authored plan.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs code "Implement the plan in docs/plan.md and run npm test"
```

The host CLI should plan first, then call this command with a self-contained implementation plan. Kimi acts as the programmer; the host remains planner and reviewer.
```

Add env vars to the table:

```md
| `KIMI_MODEL` | companion | Optional model label, recommended `kimi-for-coding` for Kimi Code. |
| `KIMI_WORK_DIR` | companion | Working directory for the Kimi subprocess. Defaults to current directory. |
| `KIMI_PERMISSION_MODE` | companion | Permission label for code jobs: `default`, `auto`, or `yolo`. |
| `KIMI_EXECUTOR` | companion | Human-readable executor label stored in jobs. |
```

Add executor example:

```md
KIMI_COMMAND=kimi-agent \
KIMI_ARGS=--work-dir,/path/to/repo,--model,kimi-for-coding \
KIMI_EXECUTOR=kimi-agent \
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs code "Implement the approved plan"
```

- [ ] **Step 3: Update architecture docs**

In `ARCHITECTURE.md`, add:

```md
## Planner/executor code flow

For implementation work, the host CLI remains the planner and reviewer. The shared companion exposes `code` and `implement` commands that wrap a host-authored plan for Kimi Code, persist a `kind: "code"` job, parse Kimi's final report, and render changed files plus verification. Adapters expose this same capability through their native command, skill, agent, rule, or workflow format.
```

- [ ] **Step 4: Update testing docs**

In `TESTING.md`, add fake scenarios:

```md
- `code-json` - structured implementation report
- `code-text` - plain text implementation report
- `approval-required` - emits an approval request before completing
```

Add command:

```bash
FAKE_KIMI_BEHAVIOR=code-json node --test tests/integration/companion.test.mjs
```

- [ ] **Step 5: Run docs/installer relevant tests**

Run:

```bash
npm run test:adapters
node scripts/install.mjs --all --dry-run
```

Expected: adapter tests pass; dry run prints all three install targets without writing.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/install.mjs README.md ARCHITECTURE.md TESTING.md
git commit -m "docs: document kimi code executor"
```

---

### Task 10: Full Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: pass.

- [ ] **Step 2: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: pass.

- [ ] **Step 3: Run adapter tests**

Run:

```bash
npm run test:adapters
```

Expected: pass.

- [ ] **Step 4: Run full suite**

Run:

```bash
npm test
```

Expected: pass.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted files.

- [ ] **Step 6: Final implementation summary**

Report:

- commit range created during implementation;
- tests run and result;
- whether real Kimi was tested;
- documented executor example for `kimi-agent`.


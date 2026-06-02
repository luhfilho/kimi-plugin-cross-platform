import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMPANION = join(__dirname, "../../adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs");
const FAKE_KIMI = join(__dirname, "../fixtures/fake-kimi.mjs");
const REPO_ROOT = join(__dirname, "../..");

async function runCompanion(args, env = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [COMPANION, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
}

async function makeStateDir() {
  return mkdtemp(join(tmpdir(), "kimi-companion-"));
}

async function readJob(stateDir) {
  return (await readJobFile(stateDir)).job;
}

async function readJobFile(stateDir) {
  const files = (await readdir(stateDir)).filter((file) => file.endsWith(".json"));
  assert.equal(files.length, 1);
  return {
    id: files[0].replace(/\.json$/, ""),
    job: JSON.parse(await readFile(join(stateDir, files[0]), "utf8")),
  };
}

function fakeKimiEnv(stateDir, behavior) {
  return {
    KIMI_COMMAND: process.execPath,
    KIMI_ARGS: FAKE_KIMI,
    KIMI_STATE_DIR: stateDir,
    KIMI_WORK_DIR: REPO_ROOT,
    FAKE_KIMI_BEHAVIOR: behavior,
  };
}

describe("kimi-companion integration", () => {
  it("should show usage when called without subcommand", async () => {
    try {
      await execFileAsync("node", [COMPANION]);
      assert.fail("Should have exited with error");
    } catch (e) {
      assert.ok(e.stderr.includes("Usage") || e.stdout.includes("Usage"));
    }
  });

  it("should run setup and report kimi not found", async () => {
    // Force kimi to not be found by using a minimal PATH that still has node
    const nodeDir = process.execPath.substring(0, process.execPath.lastIndexOf("/"));
    const env = { ...process.env, PATH: nodeDir };
    try {
      await execFileAsync("node", [COMPANION, "setup"], { env });
      assert.fail("Should have exited with error");
    } catch (e) {
      const out = e.stdout || e.stderr || "";
      assert.ok(out.includes("Not found"));
    }
  });

  it("code command stores structured implementation result", async () => {
    const stateDir = await makeStateDir();
    try {
      const result = await runCompanion(["code", "Implement code command"], fakeKimiEnv(stateDir, "code-json"));

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Code Result \(finished\)/);
      assert.match(result.stdout, /Implemented code command/);
      assert.match(result.stdout, /core\/src\/code-result\.mjs/);

      const job = await readJob(stateDir);
      assert.equal(job.kind, "code");
      assert.equal(job.status, "finished");
      assert.equal(job.output.summary, "Implemented code command.");
      assert.deepEqual(job.output.changedFiles, ["core/src/code-result.mjs"]);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("result renders code job output with code renderer", async () => {
    const stateDir = await makeStateDir();
    try {
      const codeResult = await runCompanion(["code", "Implement result renderer"], fakeKimiEnv(stateDir, "code-json"));

      assert.equal(codeResult.code, 0);

      const { id } = await readJobFile(stateDir);
      const result = await runCompanion(["result", `--id=${id}`], fakeKimiEnv(stateDir, "code-json"));

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Code Result \(finished\)/);
      assert.match(result.stdout, /Implemented code command/);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("implement alias runs the code command", async () => {
    const stateDir = await makeStateDir();
    try {
      const result = await runCompanion(["implement", "Implement code command"], fakeKimiEnv(stateDir, "code-text"));

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Code Result \(finished\)/);
      assert.match(result.stdout, /Implemented code command in plain text\./);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});

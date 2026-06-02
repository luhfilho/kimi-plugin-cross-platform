import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveExitCode } from "../../scripts/run-tests.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function runRunnerOn(dir) {
  // Strip NODE_TEST_* so the spawned `node --test` runs standalone (not nested
  // inside this test run) and emits a normal TAP summary we can assert against.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("NODE_TEST")) {
      delete env[key];
    }
  }
  return execFileSync(process.execPath, ["scripts/run-tests.mjs", dir], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
}

function withFixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "kimi-run-tests-"));
  try {
    writeFileSync(
      join(dir, "sample.test.mjs"),
      ['import test from "node:test";', 'test("sample", () => {});', ""].join("\n"),
    );
    writeFileSync(
      join(dir, "helper.mjs"),
      'throw new Error("helper module was executed");\n',
    );
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("run-tests collects and runs files marked .test.", () => {
  const stdout = withFixture(runRunnerOn);
  // The single sample.test.mjs must have been discovered and executed.
  assert.match(stdout, /pass 1/);
});

test("run-tests does not execute non-test helper modules", () => {
  const stdout = withFixture(runRunnerOn);
  // helper.mjs has no `.test.` marker, so the runner must never load it.
  assert.doesNotMatch(stdout, /helper module was executed/);
});

test("resolveExitCode reports success when the test process exits 0", () => {
  assert.equal(resolveExitCode({ status: 0, signal: null }), 0);
});

test("resolveExitCode reports failure when the test process exits non-zero", () => {
  assert.equal(resolveExitCode({ status: 1, signal: null }), 1);
});

test("resolveExitCode reports failure when the test process is killed by a signal", () => {
  // spawnSync sets status=null and signal=<name> when the child is killed
  // (SIGKILL/OOM, SIGSEGV, SIGTERM in CI). This must NOT be treated as success.
  assert.equal(resolveExitCode({ status: null, signal: "SIGKILL" }), 1);
});

test("resolveExitCode reports failure when the process fails to spawn", () => {
  // spawnSync sets status=null and error=<Error> on ENOENT/EAGAIN/ENOMEM.
  assert.equal(resolveExitCode({ status: null, signal: null, error: new Error("spawn ENOENT") }), 1);
});

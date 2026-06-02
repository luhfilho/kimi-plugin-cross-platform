import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("run-tests scans directories without executing helper modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "kimi-run-tests-"));
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("NODE_TEST")) {
      delete env[key];
    }
  }

  try {
    writeFileSync(
      join(dir, "sample.test.mjs"),
      [
        'import test from "node:test";',
        'test("sample", () => {});',
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "helper.mjs"),
      'throw new Error("helper module was executed");\n',
    );

    execFileSync(
      "node",
      ["scripts/run-tests.mjs", dir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 3000,
      },
    );

    assert.ok(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMPANION = join(__dirname, "../../adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs");

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
});

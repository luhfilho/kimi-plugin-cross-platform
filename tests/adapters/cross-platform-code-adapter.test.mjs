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

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

  const manifest = JSON.parse(read("adapters/claude-code/plugins/kimi/.claude-plugin/plugin.json"));
  assert.equal(manifest.name, "kimi");
  assert.equal("commands" in manifest, false);
  assert.equal("agents" in manifest, false);
  assert.equal("skills" in manifest, false);

  const command = read("adapters/claude-code/plugins/kimi/commands/code.md");
  assert.match(command, /command: \/kimi:code/);
  assert.match(command, /\.claude\/skills\/kimi\/scripts\/kimi-companion\.mjs/);
  assert.match(command, / code /);

  const alias = read("adapters/claude-code/plugins/kimi/commands/implement.md");
  assert.match(alias, /command: \/kimi:implement/);
  assert.match(alias, /\.claude\/skills\/kimi\/scripts\/kimi-companion\.mjs/);
  assert.match(alias, / implement /);

  const agent = read("adapters/claude-code/plugins/kimi/agents/kimi-code.md");
  assert.match(agent, /name: kimi-code/);
  assert.match(agent, /plan first/i);
  assert.match(agent, /Kimi/i);
});

test("Codex CLI exposes Kimi code skill and agent", () => {
  assert.equal(existsSync(join(ROOT, "adapters/codex-cli/skills/kimi-code/SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "adapters/codex-cli/agents/kimi-programmer.toml")), true);
});

test("Antigravity CLI exposes Kimi code skill and workflow", () => {
  assert.equal(existsSync(join(ROOT, "adapters/antigravity-cli/plugin.json")), true);
  assert.equal(existsSync(join(ROOT, "adapters/antigravity-cli/commands/kimi-code.md")), true);
  assert.equal(existsSync(join(ROOT, "adapters/antigravity-cli/skills/kimi-code/SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "adapters/antigravity-cli/workflows/kimi-code.md")), true);

  const manifest = JSON.parse(read("adapters/antigravity-cli/plugin.json"));
  assert.equal(manifest.name, "kimi");

  const command = read("adapters/antigravity-cli/commands/kimi-code.md");
  assert.match(command, /Do not edit implementation files directly/i);
  assert.match(command, /\.kimi-plugin\/kimi-companion\.mjs/);

  const skill = read("adapters/antigravity-cli/skills/kimi-code/SKILL.md");
  assert.match(skill, /plan first/i);
  assert.match(skill, /native model/i);
  assert.match(skill, /\.kimi-plugin\/kimi-companion\.mjs/);
  assert.match(skill, / code /);
  assert.match(skill, /changed files/i);

  const workflow = read("adapters/antigravity-cli/workflows/kimi-code.md");
  assert.match(workflow, /native Antigravity model/i);
  assert.match(workflow, /\.kimi-plugin\/kimi-companion\.mjs/);
  assert.match(workflow, / code /);
  assert.match(workflow, /code result\/status summary/i);
  assert.match(workflow, /changed files/i);
  assert.match(workflow, /verification/i);
  assert.match(workflow, /follow-up/i);
  assert.doesNotMatch(workflow, /job ID/i);

  const rules = read("adapters/antigravity-cli/rules/kimi-plugin.md");
  assert.match(rules, /planner/i);
  assert.match(rules, /programmer/i);
});

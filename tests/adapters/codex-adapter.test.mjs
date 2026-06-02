import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const codexAdapterRoot = join(repoRoot, "adapters", "codex-cli");

function readAdapterFile(...parts) {
  return readFileSync(join(codexAdapterRoot, ...parts), "utf8");
}

function parseSimpleFrontmatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  assert.equal(lines[0], "---");

  const end = lines.indexOf("---", 1);
  assert.ok(end > 1, "frontmatter must be closed with ---");

  return Object.fromEntries(
    lines.slice(1, end).map((line) => {
      const match = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line);
      assert.ok(match, `invalid frontmatter line: ${line}`);
      return [match[1], match[2].replace(/^"|"$/g, "")];
    }),
  );
}

test("Codex skills declare YAML frontmatter", () => {
  for (const skillName of [
    "kimi-prompting",
    "kimi-rescue",
    "kimi-review",
    "kimi-status",
  ]) {
    const frontmatter = parseSimpleFrontmatter(
      readAdapterFile("skills", skillName, "SKILL.md"),
    );

    assert.equal(frontmatter.name, skillName);
    assert.ok(frontmatter.description, `${skillName} needs a description`);
  }
});

test("Codex agent role uses TOML assignments for behavior", () => {
  const toml = readAdapterFile("agents", "kimi-delegate.toml");

  assert.doesNotMatch(
    toml,
    /^\s*-\s+/m,
    "bare Markdown bullets are not valid TOML entries",
  );
  assert.match(toml, /^name\s*=\s*"kimi-delegate"/m);
  assert.match(toml, /^description\s*=\s*".+"/m);
  assert.match(toml, /^developer_instructions\s*=\s*"""/m);
  assert.doesNotMatch(toml, /^\[(agent|capabilities|behavior)\]/m);
});

test("Codex Kimi code skill and programmer agent are installed artifacts", () => {
  const skill = readFileSync(join(codexAdapterRoot, "skills/kimi-code/SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: kimi-code\n/m);
  assert.match(skill, /plan first/i);
  assert.match(skill, /kimi-companion\.mjs code/);

  const agent = readFileSync(join(codexAdapterRoot, "agents/kimi-programmer.toml"), "utf8");
  assert.match(agent, /name = "kimi-programmer"/);
  assert.match(agent, /Kimi Code/);
});

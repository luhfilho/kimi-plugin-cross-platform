import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const claudeTargets = [join(".claude", "plugins", "kimi")];

const codexTargets = [
  join(".codex", "agents", "kimi-delegate.toml"),
  join(".codex", "agents", "kimi-programmer.toml"),
  join(".codex", "skills", "kimi-review"),
  join(".codex", "skills", "kimi-rescue"),
  join(".codex", "skills", "kimi-code"),
  join(".codex", "skills", "kimi-status"),
  join(".codex", "skills", "kimi-prompting"),
];

const antigravityTargets = [
  join(".antigravity", "rules", "kimi-plugin.md"),
  join(".antigravity", "skills", "kimi-review"),
  join(".antigravity", "skills", "kimi-rescue"),
  join(".antigravity", "skills", "kimi-code"),
  join(".antigravity", "skills", "kimi-status"),
  join(".antigravity", "workflows", "kimi-setup.md"),
  join(".antigravity", "workflows", "kimi-review.md"),
  join(".antigravity", "workflows", "kimi-rescue.md"),
  join(".antigravity", "workflows", "kimi-code.md"),
  join(".antigravity", "workflows", "kimi-status.md"),
  join(".antigravity", "workflows", "kimi-result.md"),
  join(".antigravity", "workflows", "kimi-cancel.md"),
];

const hostTargets = {
  claude: claudeTargets,
  codex: codexTargets,
  antigravity: antigravityTargets,
};

function createInstalledFixture() {
  const home = mkdtempSync(join(tmpdir(), "kimi-install-test-"));
  for (const target of [...claudeTargets, ...codexTargets, ...antigravityTargets]) {
    const absolute = join(home, target);
    if (target.endsWith(".toml") || target.endsWith(".md")) {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, "installed\n");
    } else {
      mkdirSync(absolute, { recursive: true });
      writeFileSync(join(absolute, "SKILL.md"), "installed\n");
    }
  }
  return home;
}

function runInstaller(home, args) {
  return execFileSync(process.execPath, ["scripts/install.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
}

function assertTargets(home, targets, expectedExists) {
  for (const target of targets) {
    assert.equal(existsSync(join(home, target)), expectedExists, target);
  }
}

function withInstalledFixture(run) {
  const home = createInstalledFixture();
  try {
    run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

for (const host of Object.keys(hostTargets)) {
  test(`uninstall --${host} removes only ${host} adapter artifacts`, () => {
    withInstalledFixture((home) => {
      runInstaller(home, ["--uninstall", `--${host}`]);

      for (const [name, targets] of Object.entries(hostTargets)) {
        assertTargets(home, targets, name !== host);
      }
    });
  });
}

test("uninstall --all removes every adapter artifact", () => {
  withInstalledFixture((home) => {
    runInstaller(home, ["--uninstall", "--all"]);

    assertTargets(home, [...claudeTargets, ...codexTargets, ...antigravityTargets], false);
  });
});

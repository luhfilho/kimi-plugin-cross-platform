import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const claudeTargets = [join(".claude", "skills", "kimi")];

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
  join(".antigravity", "plugin.json"),
  join(".antigravity", "rules", "kimi-plugin.md"),
  join(".antigravity", "commands", "kimi-setup.md"),
  join(".antigravity", "commands", "kimi-review.md"),
  join(".antigravity", "commands", "kimi-rescue.md"),
  join(".antigravity", "commands", "kimi-code.md"),
  join(".antigravity", "commands", "kimi-status.md"),
  join(".antigravity", "commands", "kimi-result.md"),
  join(".antigravity", "commands", "kimi-cancel.md"),
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

const sharedTargets = [join(".kimi-plugin")];

const hostTargets = {
  claude: claudeTargets,
  codex: codexTargets,
  antigravity: antigravityTargets,
};

function createInstalledFixture() {
  const home = mkdtempSync(join(tmpdir(), "kimi-install-test-"));
  for (const target of [...claudeTargets, ...codexTargets, ...antigravityTargets, ...sharedTargets]) {
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

function runInstaller(home, args, extraEnv = {}) {
  return execFileSync(process.execPath, ["scripts/install.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
}

function createFakeBin(home, command) {
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });

  if (process.platform === "win32") {
    const cmd = join(bin, `${command}.cmd`);
    writeFileSync(
      cmd,
      "@echo off\r\nif not \"%FAKE_BIN_LOG%\"==\"\" echo %0 %*>>\"%FAKE_BIN_LOG%\"\r\necho fake\r\nexit /b 0\r\n"
    );
    return bin;
  }

  const executable = join(bin, command);
  writeFileSync(
    executable,
    "#!/bin/sh\nif [ -n \"$FAKE_BIN_LOG\" ]; then printf '%s %s\\n' \"$0\" \"$*\" >> \"$FAKE_BIN_LOG\"; fi\necho fake\n"
  );
  chmodSync(executable, 0o755);
  return bin;
}

function assertTargets(home, targets, expectedExists) {
  for (const target of targets) {
    assert.equal(existsSync(join(home, target)), expectedExists, target);
  }
}

function assertSharedRuntime(home) {
  const companion = join(home, ".kimi-plugin", "kimi-companion.mjs");
  assert.equal(existsSync(companion), true, companion);
  assert.equal(existsSync(join(home, ".kimi-plugin", "core", "wire-client.mjs")), true);
  assert.match(readFileSync(companion, "utf8"), /const CORE_SRC = join\(__dirname, "core"\);/);
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

    assertTargets(home, [...claudeTargets, ...codexTargets, ...antigravityTargets, ...sharedTargets], false);
  });
});

test("install --antigravity detects the agy CLI alias", () => {
  const home = mkdtempSync(join(tmpdir(), "kimi-install-test-"));
  try {
    const bin = createFakeBin(home, "agy");
    const output = runInstaller(home, ["--antigravity", "--dry-run"], {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
    });

    assert.match(output, /Antigravity:\s+✅ agy/);
    assert.match(output, /Installing Antigravity CLI adapter/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("install --claude installs plugin in Claude Code autoload skills directory", () => {
  const home = mkdtempSync(join(tmpdir(), "kimi-install-test-"));
  try {
    const bin = createFakeBin(home, "claude");
    runInstaller(home, ["--claude"], {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
    });

    const pluginDir = join(home, ".claude", "skills", "kimi");
    assert.equal(existsSync(join(pluginDir, ".claude-plugin", "plugin.json")), true);
    assert.equal(existsSync(join(pluginDir, "scripts", "kimi-companion.mjs")), true);
    assert.match(
      readFileSync(join(pluginDir, "commands", "code.md"), "utf8"),
      /\.claude\/skills\/kimi\/scripts\/kimi-companion\.mjs/
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("install --codex installs shared companion runtime and executable skill command", () => {
  const home = mkdtempSync(join(tmpdir(), "kimi-install-test-"));
  try {
    const bin = createFakeBin(home, "codex");
    runInstaller(home, ["--codex"], {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
    });

    assertSharedRuntime(home);
    for (const [skill, subcommand] of [
      ["kimi-code", "code"],
      ["kimi-review", "review"],
      ["kimi-rescue", "task"],
      ["kimi-status", "status"],
    ]) {
      const content = readFileSync(join(home, ".codex", "skills", skill, "SKILL.md"), "utf8");
      assert.doesNotMatch(content, /path\/to\/kimi-companion\.mjs/);
      assert.equal(content.includes(".kimi-plugin/kimi-companion.mjs"), true, skill);
      assert.equal(content.includes(` ${subcommand}`), true, skill);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("install --antigravity installs shared companion runtime and executable workflow command", () => {
  const home = mkdtempSync(join(tmpdir(), "kimi-install-test-"));
  try {
    const bin = createFakeBin(home, "agy");
    const log = join(home, "agy.log");
    runInstaller(home, ["--antigravity"], {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      FAKE_BIN_LOG: log,
    });

    assertSharedRuntime(home);
    assert.equal(existsSync(join(home, ".antigravity", "plugin.json")), true);
    assert.equal(existsSync(join(home, ".antigravity", "commands", "kimi-code.md")), true);
    assert.match(readFileSync(log, "utf8"), /agy plugin install .*adapters[/\\]antigravity-cli/);
    assert.match(
      readFileSync(join(home, ".antigravity", "workflows", "kimi-code.md"), "utf8"),
      /\.kimi-plugin\/kimi-companion\.mjs" code/
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

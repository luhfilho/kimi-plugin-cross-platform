#!/usr/bin/env node
/**
 * Kimi Plugin Cross-Platform Kit — Instalador Automatizado
 *
 * Instala o plugin nos 3 CLIs suportados:
 * - Claude Code: ~/.claude/skills/kimi/
 * - Codex CLI: ~/.codex/
 * - Antigravity CLI: ~/.antigravity/
 *
 * Uso: node scripts/install.mjs [--all] [--claude] [--codex] [--antigravity] [--dry-run]
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execSync, execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  chmodSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ─── CLI Detection ───────────────────────────────────────────────────────────

function detectClaudeCode() {
  try {
    execFileSync("claude", ["--version"], { stdio: "pipe" });
    return { installed: true, path: "claude" };
  } catch {
    try {
      const globalPath = execSync("npm root -g", { encoding: "utf8" }).trim();
      const claudeBin = join(globalPath, ".bin", "claude");
      if (existsSync(claudeBin)) {
        return { installed: true, path: claudeBin };
      }
    } catch {
      // ignore
    }
  }
  return { installed: false };
}

function detectCodexCLI() {
  try {
    execFileSync("codex", ["--version"], { stdio: "pipe" });
    return { installed: true, path: "codex" };
  } catch {
    try {
      const globalPath = execSync("npm root -g", { encoding: "utf8" }).trim();
      const codexBin = join(globalPath, ".bin", "codex");
      if (existsSync(codexBin)) {
        return { installed: true, path: codexBin };
      }
    } catch {
      // ignore
    }
  }
  return { installed: false };
}

function detectAntigravityCLI() {
  for (const command of ["agy", "antigravity"]) {
    try {
      execFileSync(command, ["--version"], { stdio: "pipe" });
      return { installed: true, path: command };
    } catch {
      // try the next command name
    }
  }

  try {
    const globalPath = execSync("npm root -g", { encoding: "utf8" }).trim();
    for (const command of ["agy", "antigravity"]) {
      const agBin = join(globalPath, ".bin", command);
      if (existsSync(agBin)) {
        return { installed: true, path: agBin };
      }
    }
  } catch {
    // ignore
  }

  return { installed: false };
}

// ─── Install Helpers ─────────────────────────────────────────────────────────

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || "/tmp";
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyRecursive(src, dst, dryRun) {
  if (dryRun) {
    console.log(`  [DRY-RUN] Would copy: ${src} → ${dst}`);
    return;
  }
  cpSync(src, dst, { recursive: true, force: true });
}

function rewriteCompanionCorePath(companion, replacement) {
  if (!existsSync(companion)) {
    return;
  }

  let content = readFileSync(companion, "utf8");
  content = content.replace(
    'const CORE_SRC = join(__dirname, "../../../../../core/src");',
    replacement
  );
  writeFileSync(companion, content);
  chmodSync(companion, 0o755);
}

function installSharedRuntime(dryRun) {
  const home = getHomeDir();
  const runtimeDir = join(home, ".kimi-plugin");

  if (dryRun) {
    console.log(`  [DRY-RUN] Would install shared runtime: ${runtimeDir}`);
    return;
  }

  ensureDir(runtimeDir);

  const companion = join(runtimeDir, "kimi-companion.mjs");
  copyRecursive(
    join(REPO_ROOT, "adapters", "claude-code", "plugins", "kimi", "scripts", "kimi-companion.mjs"),
    companion,
    false
  );

  const coreDst = join(runtimeDir, "core");
  ensureDir(coreDst);
  copyRecursive(join(REPO_ROOT, "core", "src"), coreDst, false);
  rewriteCompanionCorePath(companion, 'const CORE_SRC = join(__dirname, "core");');
}

function registerAntigravityPlugin(src) {
  for (const command of ["agy", "antigravity"]) {
    try {
      execFileSync(command, ["plugin", "install", src], { stdio: "pipe" });
      console.log(`   ✅ Antigravity plugin registered via ${command}.`);
      return true;
    } catch {
      // try the next command name
    }
  }

  console.log("   ⚠️  Antigravity plugin files copied, but plugin registration failed.");
  return false;
}

function installClaudeCode(dryRun) {
  const home = getHomeDir();
  const pluginDir = join(home, ".claude", "skills", "kimi");

  console.log("\n📦 Installing Claude Code adapter...");
  console.log(`   Target: ${pluginDir}`);

  if (dryRun) {
    console.log("  [DRY-RUN] Would create directory and copy files");
    return true;
  }

  ensureDir(pluginDir);

  const src = join(REPO_ROOT, "adapters", "claude-code", "plugins", "kimi");
  copyRecursive(src, pluginDir, false);

  // Copy core modules so the companion works outside the repo
  const coreDst = join(pluginDir, "core");
  ensureDir(coreDst);
  copyRecursive(join(REPO_ROOT, "core", "src"), coreDst, false);

  // Fix companion import path to use bundled core
  const companion = join(pluginDir, "scripts", "kimi-companion.mjs");
  rewriteCompanionCorePath(companion, 'const CORE_SRC = join(__dirname, "../core");');

  console.log("   ✅ Claude Code adapter installed.");
  console.log(`   Reload with: /reload-plugins`);
  console.log(`   Then run: /kimi:setup or /kimi:code`);
  return true;
}

function installCodexCLI(dryRun) {
  const home = getHomeDir();
  const codexDir = join(home, ".codex");

  console.log("\n📦 Installing Codex CLI adapter...");
  console.log(`   Target: ${codexDir}`);

  if (dryRun) {
    console.log("  [DRY-RUN] Would create directory and copy files");
    return true;
  }

  ensureDir(codexDir);

  const agentsDir = join(codexDir, "agents");
  ensureDir(agentsDir);
  copyRecursive(
    join(REPO_ROOT, "adapters", "codex-cli", "agents"),
    agentsDir,
    false
  );

  const skillsDir = join(codexDir, "skills");
  ensureDir(skillsDir);
  copyRecursive(
    join(REPO_ROOT, "adapters", "codex-cli", "skills"),
    skillsDir,
    false
  );

  installSharedRuntime(false);

  console.log("   ✅ Codex CLI adapter installed.");
  console.log(`   Skills available: kimi-review, kimi-rescue, kimi-code, kimi-status, kimi-prompting`);
  return true;
}

function installAntigravityCLI(dryRun) {
  const home = getHomeDir();
  const agDir = join(home, ".antigravity");
  const src = join(REPO_ROOT, "adapters", "antigravity-cli");

  console.log("\n📦 Installing Antigravity CLI adapter...");
  console.log(`   Target: ${agDir}`);

  if (dryRun) {
    console.log("  [DRY-RUN] Would create directory and copy files");
    return true;
  }

  ensureDir(agDir);
  copyRecursive(join(src, "plugin.json"), join(agDir, "plugin.json"), false);

  const rulesDir = join(agDir, "rules");
  ensureDir(rulesDir);
  copyRecursive(
    join(src, "rules"),
    rulesDir,
    false
  );

  const skillsDir = join(agDir, "skills");
  ensureDir(skillsDir);
  copyRecursive(
    join(src, "skills"),
    skillsDir,
    false
  );

  const commandsDir = join(agDir, "commands");
  ensureDir(commandsDir);
  copyRecursive(
    join(src, "commands"),
    commandsDir,
    false
  );

  const workflowsDir = join(agDir, "workflows");
  ensureDir(workflowsDir);
  copyRecursive(
    join(src, "workflows"),
    workflowsDir,
    false
  );

  installSharedRuntime(false);
  registerAntigravityPlugin(src);

  console.log("   ✅ Antigravity CLI adapter installed.");
  console.log(`   Commands available: /kimi-setup, /kimi-review, /kimi-rescue, /kimi-code, /kimi-status, /kimi-result, /kimi-cancel`);
  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    all: false,
    claude: false,
    codex: false,
    antigravity: false,
    dryRun: false,
    uninstall: false,
  };

  for (const arg of args) {
    switch (arg) {
      case "--all":
        flags.all = true;
        break;
      case "--claude":
        flags.claude = true;
        break;
      case "--codex":
        flags.codex = true;
        break;
      case "--antigravity":
        flags.antigravity = true;
        break;
      case "--dry-run":
      case "-n":
        flags.dryRun = true;
        break;
      case "--uninstall":
      case "-u":
        flags.uninstall = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  if (!flags.claude && !flags.codex && !flags.antigravity) {
    flags.all = true;
  }

  return flags;
}

function printHelp() {
  console.log(`
Kimi Plugin Cross-Platform Kit — Installer

Usage: node scripts/install.mjs [options]

Options:
  --all            Install all detected CLIs, or uninstall all adapter artifacts (default)
  --claude         Install only for Claude Code
  --codex          Install only for Codex CLI
  --antigravity    Install only for Antigravity CLI
  --dry-run, -n    Show what would be done without making changes
  --uninstall, -u  Remove selected adapter artifacts
  --help, -h       Show this help message

Examples:
  node scripts/install.mjs --all
  node scripts/install.mjs --claude --dry-run
  node scripts/install.mjs --uninstall --all
  node scripts/install.mjs --uninstall --codex
`);
}

function getUninstallTargets() {
  const home = getHomeDir();
  return {
    claude: [
      join(home, ".claude", "skills", "kimi"),
    ],
    codex: [
      join(home, ".codex", "agents", "kimi-delegate.toml"),
      join(home, ".codex", "agents", "kimi-programmer.toml"),
      join(home, ".codex", "skills", "kimi-review"),
      join(home, ".codex", "skills", "kimi-rescue"),
      join(home, ".codex", "skills", "kimi-code"),
      join(home, ".codex", "skills", "kimi-status"),
      join(home, ".codex", "skills", "kimi-prompting"),
    ],
    antigravity: [
      join(home, ".antigravity", "plugin.json"),
      join(home, ".antigravity", "rules", "kimi-plugin.md"),
      join(home, ".antigravity", "commands", "kimi-setup.md"),
      join(home, ".antigravity", "commands", "kimi-review.md"),
      join(home, ".antigravity", "commands", "kimi-rescue.md"),
      join(home, ".antigravity", "commands", "kimi-code.md"),
      join(home, ".antigravity", "commands", "kimi-status.md"),
      join(home, ".antigravity", "commands", "kimi-result.md"),
      join(home, ".antigravity", "commands", "kimi-cancel.md"),
      join(home, ".antigravity", "skills", "kimi-review"),
      join(home, ".antigravity", "skills", "kimi-rescue"),
      join(home, ".antigravity", "skills", "kimi-code"),
      join(home, ".antigravity", "skills", "kimi-status"),
      join(home, ".antigravity", "workflows", "kimi-setup.md"),
      join(home, ".antigravity", "workflows", "kimi-review.md"),
      join(home, ".antigravity", "workflows", "kimi-rescue.md"),
      join(home, ".antigravity", "workflows", "kimi-code.md"),
      join(home, ".antigravity", "workflows", "kimi-status.md"),
      join(home, ".antigravity", "workflows", "kimi-result.md"),
      join(home, ".antigravity", "workflows", "kimi-cancel.md"),
    ],
    shared: [
      join(home, ".kimi-plugin"),
    ],
  };
}

function getSelectedUninstallTargets(flags) {
  const targetsByHost = getUninstallTargets();
  if (flags.all) {
    return Object.values(targetsByHost).flat();
  }

  const targets = [];
  for (const host of ["claude", "codex", "antigravity"]) {
    if (flags[host]) {
      targets.push(...targetsByHost[host]);
    }
  }
  return targets;
}

function uninstallSelected(dryRun, flags) {
  const targets = getSelectedUninstallTargets(flags);

  console.log("\n🗑️  Uninstalling Kimi plugin...");
  for (const target of targets) {
    if (dryRun) {
      console.log(`  [DRY-RUN] Would remove if present: ${target}`);
    } else if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      console.log(`  ✅ Removed: ${target}`);
    }
  }
  console.log("\n   ✅ Uninstall complete.");
}

async function main() {
  const flags = parseArgs();

  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   Kimi Plugin Cross-Platform Kit — Installer v0.1.0              ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  if (flags.uninstall) {
    uninstallSelected(flags.dryRun, flags);
    return;
  }

  console.log("\n🔍 Detecting installed CLIs...");
  const claude = detectClaudeCode();
  const codex = detectCodexCLI();
  const antigravity = detectAntigravityCLI();

  console.log(`   Claude Code:    ${claude.installed ? "✅ " + claude.path : "❌ not found"}`);
  console.log(`   Codex CLI:      ${codex.installed ? "✅ " + codex.path : "❌ not found"}`);
  console.log(`   Antigravity:    ${antigravity.installed ? "✅ " + antigravity.path : "❌ not found"}`);

  let installed = 0;

  if ((flags.all || flags.claude) && (claude.installed || (flags.all && flags.dryRun))) {
    if (installClaudeCode(flags.dryRun)) installed++;
  } else if (flags.claude && !claude.installed) {
    console.log("\n⚠️  Claude Code not found. Skipping.");
  }

  if ((flags.all || flags.codex) && (codex.installed || (flags.all && flags.dryRun))) {
    if (installCodexCLI(flags.dryRun)) installed++;
  } else if (flags.codex && !codex.installed) {
    console.log("\n⚠️  Codex CLI not found. Skipping.");
  }

  if ((flags.all || flags.antigravity) && (antigravity.installed || (flags.all && flags.dryRun))) {
    if (installAntigravityCLI(flags.dryRun)) installed++;
  } else if (flags.antigravity && !antigravity.installed) {
    console.log("\n⚠️  Antigravity CLI not found. Skipping.");
  }

  console.log("\n" + "═".repeat(66));
  console.log(`   Installation complete: ${installed} adapter(s) installed.`);
  console.log("═".repeat(66));

  if (!flags.dryRun) {
    console.log("\n📋 Next steps:");
    if (claude.installed) {
      console.log("   Claude Code:  /reload-plugins  →  /kimi:setup");
    }
    if (codex.installed) {
      console.log("   Codex CLI:    codex --agent kimi-delegate");
    }
    if (antigravity.installed) {
      console.log('   Antigravity:  agy -p "/kimi-setup"');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

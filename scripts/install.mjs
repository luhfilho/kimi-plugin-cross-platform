#!/usr/bin/env node
/**
 * Kimi Plugin Cross-Platform Kit — Instalador Automatizado
 *
 * Instala o plugin nos 3 CLIs suportados:
 * - Claude Code: ~/.claude/plugins/kimi/
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
  try {
    execFileSync("antigravity", ["--version"], { stdio: "pipe" });
    return { installed: true, path: "antigravity" };
  } catch {
    try {
      const globalPath = execSync("npm root -g", { encoding: "utf8" }).trim();
      const agBin = join(globalPath, ".bin", "antigravity");
      if (existsSync(agBin)) {
        return { installed: true, path: agBin };
      }
    } catch {
      // ignore
    }
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

function installClaudeCode(dryRun) {
  const home = getHomeDir();
  const pluginDir = join(home, ".claude", "plugins", "kimi");

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
  if (existsSync(companion)) {
    let content = readFileSync(companion, "utf8");
    content = content.replace(
      'const CORE_SRC = join(__dirname, "../../../../../core/src");',
      'const CORE_SRC = join(__dirname, "../core");'
    );
    writeFileSync(companion, content);
    chmodSync(companion, 0o755);
  }

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

  console.log("   ✅ Codex CLI adapter installed.");
  console.log(`   Skills available: kimi-review, kimi-rescue, kimi-code, kimi-status`);
  return true;
}

function installAntigravityCLI(dryRun) {
  const home = getHomeDir();
  const agDir = join(home, ".antigravity");

  console.log("\n📦 Installing Antigravity CLI adapter...");
  console.log(`   Target: ${agDir}`);

  if (dryRun) {
    console.log("  [DRY-RUN] Would create directory and copy files");
    return true;
  }

  ensureDir(agDir);

  const rulesDir = join(agDir, "rules");
  ensureDir(rulesDir);
  copyRecursive(
    join(REPO_ROOT, "adapters", "antigravity-cli", "rules"),
    rulesDir,
    false
  );

  const skillsDir = join(agDir, "skills");
  ensureDir(skillsDir);
  copyRecursive(
    join(REPO_ROOT, "adapters", "antigravity-cli", "skills"),
    skillsDir,
    false
  );

  const workflowsDir = join(agDir, "workflows");
  ensureDir(workflowsDir);
  copyRecursive(
    join(REPO_ROOT, "adapters", "antigravity-cli", "workflows"),
    workflowsDir,
    false
  );

  console.log("   ✅ Antigravity CLI adapter installed.");
  console.log(`   Workflows available: kimi-review, kimi-rescue, kimi-code, kimi-status`);
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
  --all            Install for all detected CLIs (default)
  --claude         Install only for Claude Code
  --codex          Install only for Codex CLI
  --antigravity    Install only for Antigravity CLI
  --dry-run, -n    Show what would be done without making changes
  --uninstall, -u  Remove installed plugins
  --help, -h       Show this help message

Examples:
  node scripts/install.mjs --all
  node scripts/install.mjs --claude --dry-run
  node scripts/install.mjs --uninstall --codex
`);
}

function uninstallAll(dryRun) {
  const home = getHomeDir();
  const targets = [
    join(home, ".claude", "plugins", "kimi"),
    join(home, ".codex", "agents", "kimi-delegate.toml"),
    join(home, ".codex", "skills", "kimi-review"),
    join(home, ".codex", "skills", "kimi-rescue"),
    join(home, ".codex", "skills", "kimi-status"),
    join(home, ".antigravity", "rules", "kimi-plugin.md"),
    join(home, ".antigravity", "skills", "kimi-review"),
    join(home, ".antigravity", "skills", "kimi-rescue"),
    join(home, ".antigravity", "skills", "kimi-status"),
    join(home, ".antigravity", "workflows", "kimi-setup.md"),
    join(home, ".antigravity", "workflows", "kimi-review.md"),
    join(home, ".antigravity", "workflows", "kimi-rescue.md"),
    join(home, ".antigravity", "workflows", "kimi-status.md"),
    join(home, ".antigravity", "workflows", "kimi-result.md"),
    join(home, ".antigravity", "workflows", "kimi-cancel.md"),
  ];

  console.log("\n🗑️  Uninstalling Kimi plugin...");
  for (const target of targets) {
    if (existsSync(target)) {
      if (dryRun) {
        console.log(`  [DRY-RUN] Would remove: ${target}`);
      } else {
        rmSync(target, { recursive: true, force: true });
        console.log(`  ✅ Removed: ${target}`);
      }
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
    uninstallAll(flags.dryRun);
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
      console.log("   Antigravity:  ag run kimi-setup");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

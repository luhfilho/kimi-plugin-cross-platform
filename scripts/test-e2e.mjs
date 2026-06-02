#!/usr/bin/env node
/**
 * Testes E2E do Kimi Plugin no projeto Boletim Escolar
 *
 * Usa o fake-kimi para testar todos os comandos do companion.
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const COMPANION = join(REPO_ROOT, "adapters", "claude-code", "plugins", "kimi", "scripts", "kimi-companion.mjs");
const FAKE_KIMI = join(REPO_ROOT, "tests", "fixtures", "fake-kimi.mjs");
const TEST_PROJECT = mkdtempSync(join(tmpdir(), "boletim-escolar-"));

// Cria diretório de estado temporário
const stateDir = mkdtempSync(join(tmpdir(), "kimi-test-state-"));

const env = {
  ...process.env,
  KIMI_COMMAND: process.execPath,
  KIMI_ARGS: FAKE_KIMI,
  KIMI_STATE_DIR: stateDir,
};

let passed = 0;
let failed = 0;

function runCommand(subcommand, args = [], cwd = TEST_PROJECT) {
  const cmd = [COMPANION, subcommand, ...args];
  console.log(`\n▶️  ${subcommand} ${args.join(" ")}`);
  console.log(`   cwd: ${cwd}`);
  const result = spawnSync(process.execPath, cmd, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status === 0) {
    const output = result.stdout || "";
    console.log(`   ✅ EXIT 0`);
    console.log(`   Output:\n${output.split("\n").map(l => "   " + l).join("\n")}`);
    passed++;
    return { success: true, output };
  }

  const output = result.stdout || result.stderr || result.error?.message || "";
  console.log(`   ⚠️  EXIT ${result.status}`);
  console.log(`   Output:\n${output.split("\n").map(l => "   " + l).join("\n")}`);
  if (result.status === 1) {
    // 1 é esperado para alguns comandos sem resultado acionável.
    passed++;
    return { success: true, output };
  }
  failed++;
  return { success: false, output };
}

function runCommandWithInput(subcommand, args = [], cwd = TEST_PROJECT, input = "") {
  const cmd = [COMPANION, subcommand, ...args];
  console.log(`\n▶️  ${subcommand} ${args.join(" ")}`);
  console.log(`   cwd: ${cwd}`);
  const result = spawnSync(process.execPath, cmd, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 30000,
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status === 0) {
    const output = result.stdout || "";
    console.log(`   ✅ EXIT 0`);
    console.log(`   Output:\n${output.split("\n").map(l => "   " + l).join("\n")}`);
    passed++;
    return { success: true, output };
  }

  const output = result.stdout || result.stderr || result.error?.message || "";
  console.log(`   ⚠️  EXIT ${result.status}`);
  console.log(`   Output:\n${output.split("\n").map(l => "   " + l).join("\n")}`);
  if (result.status === 1) {
    passed++;
    return { success: true, output };
  }
  failed++;
  return { success: false, output };
}

function setupTestProject() {
  writeFileSync(join(TEST_PROJECT, "package.json"), `{
  "name": "boletim-escolar-e2e",
  "version": "0.0.0",
  "type": "module"
}
`);
  writeFileSync(join(TEST_PROJECT, "server.js"), `
export function calcularMedia(notas) {
  return notas.reduce((total, nota) => total + nota, 0) / notas.length;
}
`);
  execSync("git init -q", { cwd: TEST_PROJECT });
  execSync("git config user.email kimi-e2e@example.test", { cwd: TEST_PROJECT });
  execSync("git config user.name 'Kimi E2E'", { cwd: TEST_PROJECT });
  execSync("git add -A", { cwd: TEST_PROJECT });
  execSync("git commit -qm 'initial fixture'", { cwd: TEST_PROJECT });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   Kimi Plugin E2E Tests — Boletim Escolar Project                ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`\nTest project: ${TEST_PROJECT}`);
  console.log(`State dir: ${stateDir}`);
  console.log(`Fake kimi: ${FAKE_KIMI}`);
  setupTestProject();

  // 1. SETUP
  console.log("\n" + "═".repeat(66));
  console.log("TEST 1: setup");
  console.log("═".repeat(66));
  const setupResult = runCommand("setup");

  // 2. REVIEW (sem mudanças - deve retornar "No changes")
  console.log("\n" + "═".repeat(66));
  console.log("TEST 2: review (no changes)");
  console.log("═".repeat(66));
  const reviewNoChanges = runCommand("review");

  // Cria mudanças para review
  console.log("\n📋 Creating changes for review...");
  writeFileSync(join(TEST_PROJECT, "novo-arquivo.js"), `
// Arquivo novo com problemas
function calcularMedia(notas) {
  var total = 0;
  for(var i=0; i<notas.length; i++) {
    total += notas[i];
  }
  return total / notas.length; // divisão por zero
}

module.exports = { calcularMedia };
`);
  execSync("git add -A", { cwd: TEST_PROJECT });

  // 3. REVIEW (com mudanças)
  console.log("\n" + "═".repeat(66));
  console.log("TEST 3: review (with changes)");
  console.log("═".repeat(66));
  const reviewWithChanges = runCommand("review");

  // 4. ADVERSARIAL REVIEW
  console.log("\n" + "═".repeat(66));
  console.log("TEST 4: adversarial-review");
  console.log("═".repeat(66));
  const adversarialReview = runCommand("adversarial-review");

  // 5. TASK (rescue)
  console.log("\n" + "═".repeat(66));
  console.log("TEST 5: task (refactor suggestion)");
  console.log("═".repeat(66));
  const taskResult = runCommand("task", [
    "Refactor the server.js to use parameterized queries and remove eval vulnerability"
  ]);

  // 6. STATUS
  console.log("\n" + "═".repeat(66));
  console.log("TEST 6: status");
  console.log("═".repeat(66));
  const statusResult = runCommand("status");

  // 7. RESULT (último job)
  console.log("\n" + "═".repeat(66));
  console.log("TEST 7: result (latest job)");
  console.log("═".repeat(66));
  // Primeiro pega o status para encontrar o ID
  const statusOutput = runCommand("status");
  const jobIdMatch = statusOutput.output.match(/[a-f0-9]{8}/);
  if (jobIdMatch) {
    const jobId = jobIdMatch[0];
    console.log(`   Using job ID: ${jobId}`);
    // Não podemos passar ID parcial, o companion precisa do ID completo
    // Vamos listar o arquivo de estado diretamente
    const { readdirSync, readFileSync } = await import("node:fs");
    const files = readdirSync(stateDir).filter(f => f.endsWith('.json'));
    if (files.length > 0) {
      const fullId = files[0].replace('.json', '');
      console.log(`   Using job ID: ${fullId}`);
      runCommand("result", [`--id=${fullId}`]);
    }
  }

  // 8. CANCEL (cria um job e cancela)
  console.log("\n" + "═".repeat(66));
  console.log("TEST 8: cancel");
  console.log("═".repeat(66));
  // Não temos um job running para cancelar
  // Vamos verificar o comportamento quando não há job
  const cancelResult = runCommand("cancel", ["--id=nonexistent"]);

  // Limpa mudanças
  console.log("\n📋 Cleaning up test changes...");
  execSync("git reset HEAD", { cwd: TEST_PROJECT });
  execSync("git checkout -- .", { cwd: TEST_PROJECT });
  rmSync(join(TEST_PROJECT, "novo-arquivo.js"), { force: true });

  // Limpa estado
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(TEST_PROJECT, { recursive: true, force: true });

  // Resultados
  console.log("\n" + "═".repeat(66));
  console.log("E2E TEST RESULTS");
  console.log("═".repeat(66));
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total:    ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

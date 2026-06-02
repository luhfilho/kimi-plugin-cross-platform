#!/usr/bin/env node
/**
 * Testes E2E do Kimi Plugin no projeto Boletim Escolar
 *
 * Usa o fake-kimi para testar todos os comandos do companion.
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const COMPANION = join(REPO_ROOT, "adapters", "claude-code", "plugins", "kimi", "scripts", "kimi-companion.mjs");
const FAKE_KIMI = join(REPO_ROOT, "tests", "fixtures", "fake-kimi.mjs");

/**
 * Classifica o resultado de um spawnSync contra o exit code esperado.
 *
 * Falha ao spawnar (result.error) ou morte por sinal (result.signal,
 * status === null) são sempre falha. Caso contrário, o status precisa bater
 * com o esperado: tratar todo `exit 1` como sucesso mascararia regressões
 * reais do companion (exit 1 é o código de erro genérico dele).
 * Exportada para ser testável sem spawnar processos.
 */
export function classifyExit(result, expectStatus = 0) {
  if (result.error) {
    return { success: false, reason: `erro ao spawnar: ${result.error.message}` };
  }
  if (result.signal) {
    return { success: false, reason: `morto por sinal ${result.signal}` };
  }
  if (result.status === expectStatus) {
    return { success: true, reason: `exit ${result.status} (esperado)` };
  }
  return {
    success: false,
    reason: `esperava exit ${expectStatus}, obteve ${result.status}`,
  };
}

async function main() {
  const TEST_PROJECT = mkdtempSync(join(tmpdir(), "boletim-escolar-"));
  const stateDir = mkdtempSync(join(tmpdir(), "kimi-test-state-"));

  const env = {
    ...process.env,
    KIMI_COMMAND: process.execPath,
    KIMI_ARGS: FAKE_KIMI,
    KIMI_STATE_DIR: stateDir,
  };

  let passed = 0;
  let failed = 0;

  function git(args) {
    try {
      execFileSync("git", args, { cwd: TEST_PROJECT, stdio: "pipe", encoding: "utf8" });
    } catch (e) {
      throw new Error(`git ${args.join(" ")} falhou: ${e.stderr || e.message}`);
    }
  }

  function runCommand(subcommand, args = [], { cwd = TEST_PROJECT, expectStatus = 0, input } = {}) {
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

    const verdict = classifyExit(result, expectStatus);
    const output = result.stdout || result.stderr || result.error?.message || "";
    const icon = verdict.success ? "✅" : "❌";
    console.log(`   ${icon} ${verdict.reason}`);
    console.log(`   Output:\n${output.split("\n").map(l => "   " + l).join("\n")}`);

    if (verdict.success) {
      passed++;
    } else {
      failed++;
    }
    return { success: verdict.success, output };
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
    git(["init", "-q"]);
    git(["config", "user.email", "kimi-e2e@example.test"]);
    git(["config", "user.name", "Kimi E2E"]);
    git(["add", "-A"]);
    git(["commit", "-qm", "initial fixture"]);
  }

  try {
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
    runCommand("setup");

    // 2. REVIEW (sem mudanças - deve retornar "No changes")
    console.log("\n" + "═".repeat(66));
    console.log("TEST 2: review (no changes)");
    console.log("═".repeat(66));
    runCommand("review");

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
    git(["add", "-A"]);

    // 3. REVIEW (com mudanças)
    console.log("\n" + "═".repeat(66));
    console.log("TEST 3: review (with changes)");
    console.log("═".repeat(66));
    runCommand("review");

    // 4. ADVERSARIAL REVIEW
    console.log("\n" + "═".repeat(66));
    console.log("TEST 4: adversarial-review");
    console.log("═".repeat(66));
    runCommand("adversarial-review");

    // 5. TASK (rescue)
    console.log("\n" + "═".repeat(66));
    console.log("TEST 5: task (refactor suggestion)");
    console.log("═".repeat(66));
    runCommand("task", [
      "Refactor the server.js to use parameterized queries and remove eval vulnerability"
    ]);

    // 6. STATUS
    console.log("\n" + "═".repeat(66));
    console.log("TEST 6: status");
    console.log("═".repeat(66));
    runCommand("status");

    // 7. RESULT (último job)
    console.log("\n" + "═".repeat(66));
    console.log("TEST 7: result (latest job)");
    console.log("═".repeat(66));
    // Primeiro pega o status para encontrar o ID
    const statusOutput = runCommand("status");
    const jobIdMatch = statusOutput.output.match(/[a-f0-9]{8}/);
    if (jobIdMatch) {
      // Lista o arquivo de estado diretamente para obter o ID completo
      const files = readdirSync(stateDir).filter(f => f.endsWith('.json'));
      if (files.length > 0) {
        const fullId = files[0].replace('.json', '');
        console.log(`   Using job ID: ${fullId}`);
        runCommand("result", [`--id=${fullId}`]);
      }
    }

    // 8. CANCEL — job inexistente: o companion retorna exit 1 ("Job not found")
    console.log("\n" + "═".repeat(66));
    console.log("TEST 8: cancel (job inexistente → exit 1 esperado)");
    console.log("═".repeat(66));
    runCommand("cancel", ["--id=nonexistent"], { expectStatus: 1 });

    // Resultados
    console.log("\n" + "═".repeat(66));
    console.log("E2E TEST RESULTS");
    console.log("═".repeat(66));
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   Total:    ${passed + failed}`);

    return failed > 0 ? 1 : 0;
  } finally {
    // Cleanup garantido mesmo se algum passo lançar
    rmSync(stateDir, { recursive: true, force: true });
    rmSync(TEST_PROJECT, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

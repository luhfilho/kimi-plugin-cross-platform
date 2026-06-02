# Consolidação de Sessão — 2026-05-28

**Projeto:** `kimi-plugin-cross-platform` (repo local `kimi-to-claude-code`)
**Remote:** `git@github.com:luhfilho/kimi-plugin-cross-platform.git`
**Brain Neural Memory:** `totvs` (escopo `--project kimi-plugin-cross-platform`)

---

## 1. Task (o que foi realizado)

1. **`/init`** — Analisado o codebase e criado um `CLAUDE.md` focado e de alto sinal para o projeto (não havia um).
2. **Validação** — Executados *de fato* todos os comandos documentados no `CLAUDE.md`, corrigindo imprecisões reveladas pela execução.
3. **Commit** — `CLAUDE.md` commitado na branch `develop`, **sem co-autor** (regra do usuário).
4. **Merge** — `main → develop` para trazer fixes de CI ausentes em `develop`.
5. **Push** — `origin/develop` sincronizado.

---

## 2. Arquitetura aprendida (contexto do projeto)

- **Split core/adapter:** `core/src/` é o **único** runtime (host-agnostic); `adapters/<host>/` (claude-code, codex-cli, antigravity-cli) são wrappers finos sem lógica de negócio.
- **Módulos core:** `wire-client.mjs` (WireClient, fala Kimi Wire Protocol via JSON-RPC sobre stdio), `job-control.mjs` (JobControl, persiste jobs como JSON em state dir), `git-context.mjs` (GitContext, coleta diffs, trunca em 200KB), `render.mjs` (formatters markdown).
- **Entry point:** `adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs` despacha subcomandos `setup|review|adversarial-review|task|status|result|cancel`.
- **Env vars:** `KIMI_COMMAND` (default `kimi`), `KIMI_ARGS` (default `--wire`), `KIMI_STATE_DIR`, `FAKE_KIMI_BEHAVIOR`/`FAKE_KIMI_DELAY_MS` (testes).

---

## 3. Desafios enfrentados

| # | Desafio |
|---|---------|
| D1 | Projeto sem memória/brain prévio — necessário reconstruir contexto do zero. |
| D2 | Detalhe não-óbvio do deploy: o caminho de import no fonte ≠ caminho em produção. |
| D3 | Documentar comandos com exemplos *fiéis* (não inventados). |
| D4 | `develop` divergente de `main`, exigindo merge sem quebrar o histórico. |
| D5 | Outputs de leitura git contraditórios entre si durante o merge. |

---

## 4. Erros encontrados (e cometidos)

- **E1 — Exemplo de teste fictício no doc:** o `CLAUDE.md` inicial usava `--test-name-pattern="parses findings"`, um nome de teste que **não existe** em `render.test.mjs` (os reais começam com `renders ...`).
- **E2 — Comando documentado que falha:** `npm run test:adapters` foi listado como funcional, mas `tests/adapters/` está **vazio**; o runner imprime `No test files found.` e **sai com código 1**.
- **E3 — Leitura git stale via hook `rtk`:** após o merge, `git log -1` (reescrito para `rtk git ...`) retornou `36349fb` com 1 parent, enquanto o HEAD **real** já era o merge commit `14b8d29` com 2 parents. Cache desatualizado do filtro `rtk`.

---

## 5. Aprendizados (insights reutilizáveis)

- **A1 — Installer reescreve import path:** `scripts/install.mjs` copia `core/` para dentro do plugin instalado e reescreve `const CORE_SRC` de `../../../../../core/src` para `../core`. Ao editar/mover o companion, considerar os dois caminhos.
- **A2 — `run-tests.mjs` é intencional:** runner custom existe para contornar expansão de glob divergente entre shells/SOs. **Não** substituir por `node --test tests/**/*.mjs` (quebra a CI).
- **A3 — Kimi Wire Protocol não tem `review/start` nativo:** reviews são `prompt` + template JSON estruturado, e a saída é parseada do JSON da resposta do modelo. Verbos do protocolo: `initialize`, `prompt`, `steer`, `cancel`.
- **A4 — `WireClient extends EventTarget`** (estilo browser), não `EventEmitter` do Node — por isso tem um shim `.on(type, listener)`.
- **A5 — Testes que spawnam child process travam o test runner do Node** se os pipes stdio ficarem abertos; o fixture `fake-kimi.mjs` instala handlers `SIGTERM`/`SIGINT` e os testes chamam `process.exit(0)` em `after()`.
- **A6 — Hook `rtk` pode servir leituras git cacheadas/stale:** mutações (commit/merge/push) são confiáveis; para ler o estado verdadeiro do histórico, usar `rtk proxy git ...` (bypass do filtro).
- **A7 — `nmem train` aceita markdown:** treinar a brain a partir de um arquivo `.md` estruturado é o caminho para consolidar conhecimento de sessão.

---

## 6. Evidências (verificações executadas)

| Verificação | Resultado |
|-------------|-----------|
| Node | v22.21.1 (≥20 ✓) |
| `npm install` | up to date, 0 vulnerabilities |
| `npm run test:unit` | **32/32 pass**, 0 fail |
| `npm run test:integration` | **2/2 pass** |
| `node --test <file>` (single file) | 5/5 pass |
| `node --test --test-name-pattern="renders review findings"` | 1/1 pass (filtro confirmado) |
| `node scripts/install.mjs --dry-run` | detectou Claude Code + Codex; Antigravity ausente; nenhuma escrita |
| `npm run test:adapters` | `No test files found.` → exit 1 (diretório vazio) |
| Commit em develop | `36349fb` — autor único Luciano Filho, sem co-autor |
| Merge | `14b8d29` "Merge branch 'main' into develop", 2 parents (`36349fb` + `4543297`) |
| Push | `origin/develop` = `14b8d29`; `rev-list --left-right --count` = `0 0` (em sincronia) |

---

## 7. Soluções aplicadas

- **S1 (→E1):** Substituído o exemplo por um nome de teste **real e verificado** (`renders review findings`), confirmado rodando `--test-name-pattern`.
- **S2 (→E2):** Anotado explicitamente no `CLAUDE.md` que `test:adapters` sai com código 1 por `tests/adapters/` vazio (falha ruidosa, não silenciosa — boa para CI).
- **S3 (→E3):** Usado `rtk proxy git log/rev-list` para obter o HEAD real (`14b8d29`, 2 parents) e confirmar a sincronia com o remoto.
- **S4 (→D4):** Merge de 3 vias limpo, sem conflito, por os arquivos serem disjuntos (`main` mexeu em `package.json`/`run-tests.mjs`; `develop` só adicionou `CLAUDE.md`); testes re-rodados pós-merge (32/32, 2/2).

---

## 8. Estado final

- `develop` = `14b8d29`, em sincronia com `origin/develop`, contendo `CLAUDE.md` + fixes de CI de `main`.
- CI esperada verde (`test:unit` + `test:integration` em Node 20/22).
- `CLAUDE.md` existe **apenas em `develop`** (não em `main`) — pendente eventual PR `develop → main`.
- `PROJECT_MEMORY.md` e `codex-plugin-cc/` (repo git aninhado separado) permanecem untracked e fora dos commits.

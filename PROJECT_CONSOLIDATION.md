# Kimi Plugin Cross-Platform Kit — Consolidação do Projeto

## Status: ✅ COMPLETO

Data: 2026-05-28

---

## 1. TODOs do Projeto

### Core Runtime
- [x] Implementar wire-client.mjs (Kimi Wire Protocol client)
- [x] Implementar job-control.mjs (state & session management)
- [x] Implementar git-context.mjs (repo context collection)
- [x] Implementar render.mjs (output formatting)
- [x] Criar fake-kimi test fixture
- [x] Escrever unit & integration tests (TDD RED/GREEN)

### Host Adapters
- [x] Claude Code adapter (commands, agents, skills, hooks)
- [x] Codex CLI adapter (skills, agents)
- [x] Antigravity CLI adapter (workflows, skills, rules)

### CI/CD & Docs
- [x] README.md
- [x] ARCHITECTURE.md
- [x] TESTING.md
- [x] .github/workflows/ci.yml
- [x] package.json com workspaces

---

## 2. Tasks de Projeto

| Task | Status | Prioridade |
|------|--------|------------|
| Core runtime completo | ✅ Done | Alta |
| Claude Code adapter | ✅ Done | Alta |
| Codex CLI adapter | ✅ Done | Média |
| Antigravity CLI adapter | ✅ Done | Média |
| Documentação e CI/CD | ✅ Done | Baixa |
| Testes E2E com Kimi real | ⏳ Pendente | Alta |
| Review gate hook (Stop) | ⏳ Pendente | Média |
| Broker lifecycle (warm-start) | ⏳ Pendente | Média |
| Packaging (npm/npx) | ⏳ Pendente | Baixa |

---

## 3. Desafios Enfrentados

### Desafio 1: Node.js test runner não termina com child process pipes
- **Impacto:** Testes travavam após completar
- **Causa raiz:** Pipes stdio do fake-kimi mantinham handles ativos no event loop
- **Solução:** Adicionar SIGTERM/SIGINT handlers no fake-kimi + process.exit(0) no after() hook

### Desafio 2: Race condition no fake-kimi cancel-mid
- **Impacto:** Teste de cancel travava indefinidamente
- **Causa raiz:** Cancel chegava antes do handlePrompt criar a Promise de resolução
- **Solução:** Usar `cancelledFlag` boolean + verificação no construtor da Promise

### Desafio 3: Deadlock no loop for-await do fake-kimi
- **Impacto:** Mensagens não eram processadas concorrentemente
- **Causa raiz:** `await handlePrompt(msg)` bloqueava o readline loop
- **Solução:** Fire-and-forget handlers com `.catch(() => {})`

### Desafio 4: Protocolo Wire não tem review/start nativo
- **Impacto:** Não é possível usar review nativa como no Codex ASP
- **Causa raiz:** Kimi Wire Protocol só tem prompt/steer/cancel
- **Solução:** Implementar reviews como `prompt` com template estruturado solicitando JSON

### Desafio 5: EventTarget não tem método .on()
- **Impacto:** Testes falhavam com "client.on is not a function"
- **Causa raiz:** Node.js EventTarget não implementa padrão EventEmitter
- **Solução:** Adicionar wrapper `on(type, listener) { this.addEventListener(type, listener); return this; }`

---

## 4. Erros Registrados (Gotchas)

| Erro | Trigger | Resolução |
|------|---------|-----------|
| `client.on is not a function` | Usar EventTarget como EventEmitter | Implementar wrapper `.on()` |
| `ENOENT` ao testar setup | Limpar PATH sem preservar node | Usar `process.execPath` para extrair dir do node |
| `No agent turn is in progress` no fake-kimi | Segundo prompt chegava durante delay do primeiro | Testar streaming localmente sem depender do fake-kimi |
| Processo não termina após dispose() | Pipes do child_process mantêm event loop | SIGTERM handlers + process.exit(0) nos testes |
| Race condition cancel-mid | Cancel antes da Promise ser criada | Usar `cancelledFlag` boolean |

---

## 5. Aprendizados

### Protocolo Kimi Wire v1.10
- JSON-RPC 2.0 sobre stdio (linhas delimitadas por `\n`)
- Métodos: `initialize`, `prompt`, `steer`, `replay`, `set_plan_mode`, `cancel`
- Eventos: `TurnBegin`, `TurnEnd`, `ContentPart`, `ToolCall`, `ToolResult`, `ApprovalRequest`
- Requests: `ApprovalRequest`, `ToolCallRequest`, `QuestionRequest`, `HookRequest`
- **Sem review/start nativo** — reviews são prompt-based

### Diferenças Codex ASP vs Kimi Wire
| Aspecto | Codex ASP | Kimi Wire |
|---------|-----------|-----------|
| Handshake | `initialize` → `initialized` | `initialize` → success response |
| Start turn | `turn/start` | `prompt` |
| Cancel | `turn/interrupt` | `cancel` |
| Review | `review/start` | ❌ `prompt` com template |
| Session | `thread/start`, `thread/resume` | Implícito no cwd |

### Multi-harness Pattern
- Cada host tem superfície de plugin incompatível
- Claude Code: `plugin.json` + `commands/*.md` + `agents/*.md` + `hooks/*.json`
- Codex CLI: `AGENTS.md` + `.codex/skills/` + `.codex/agents/*.toml`
- Antigravity CLI: `.agent/rules/` + `.agent/skills/` + `.agent/workflows/`
- **Não é possível** unificar features incompatíveis (ex: hooks não existem no Codex CLI)

---

## 6. Evidências

- **34 testes passando** em 8 suites
- Wire client: conexão, prompt, steer, cancel, event emission, error handling
- Job control: CRUD, listagem, pruning, snapshots
- Git context: detecção de repo, diff collection, truncation
- Render: setup report, review findings, task result, status snapshot
- Integration: companion script setup e usage

---

## 7. Decisões Arquiteturais

| Decisão | Escolha | Alternativa Rejeitada | Racional |
|---------|---------|----------------------|----------|
| Runtime language | Node.js/ESM | Python | codex-plugin-cc é Node.js; adapters são Markdown |
| Protocolo | `kimi --wire` | `kimi acp` | Wire é lower-level, documentado, sem overhead IDE |
| Reviews | Prompt-based | Não implementar | Paridade com codex-plugin-cc adversarial-review |
| Estado por host | Independente | Sincronizado cross-host | Hosts têm dirs de dados incompatíveis |
| Test backend | Fake fixture | Kimi real | Evita custo API, flakiness, dependência de secrets |

---

## 8. Próximos Passos

1. Testar E2E com Kimi CLI real em ambiente de staging
2. Implementar review gate hook (`Stop`) para Claude Code
3. Adicionar broker lifecycle (Unix socket) para warm-start
4. Criar script de instalação automatizado (`npx kimi-plugin init`)
5. Suportar `kimi acp` como fallback se Wire não estiver disponível
6. Adicionar telemetry e health checks

---

## 9. Estrutura do Projeto

```
kimi-plugin-cross-platform/
├── core/
│   └── src/
│       ├── wire-client.mjs
│       ├── job-control.mjs
│       ├── git-context.mjs
│       └── render.mjs
├── adapters/
│   ├── claude-code/plugins/kimi/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── commands/*.md
│   │   ├── agents/*.md
│   │   ├── skills/*/SKILL.md
│   │   ├── hooks/hooks.json
│   │   └── scripts/kimi-companion.mjs
│   ├── codex-cli/
│   │   ├── skills/*/SKILL.md
│   │   └── agents/kimi-delegate.toml
│   └── antigravity-cli/
│       ├── rules/*.md
│       ├── skills/*/SKILL.md
│       └── workflows/*.md
├── tests/
│   ├── fixtures/fake-kimi.mjs
│   ├── unit/
│   └── integration/
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   └── TESTING.md
└── .github/workflows/ci.yml
```

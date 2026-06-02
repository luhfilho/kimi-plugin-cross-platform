# AGENTS.md

This file provides guidance when working with code in this repository.

## What this is

`kimi-plugin-cross-platform` — a cross-platform kit that lets three host CLIs (Claude Code, Codex CLI, Antigravity CLI) delegate work to the **Kimi CLI** (Moonshot AI) for code review, "rescue" tasks, and background jobs. Pure Node.js (ESM, `>=20`), npm workspaces, no build step, no runtime dependencies.

## Commands

```bash
npm test                  # all tests (node --test via custom runner)
npm run test:unit         # unit tests only (tests/unit/)
npm run test:integration  # integration tests only (tests/integration/)
npm run test:adapters     # adapter tests (tests/adapters/)

# Run a single test FILE
node --test tests/unit/wire-client.test.mjs
# Run a single test CASE within a file (pattern matches the it()/test() name)
node --test --test-name-pattern="renders review findings" tests/unit/render.test.mjs

node scripts/test-e2e.mjs           # end-to-end suite (uses fake-kimi fixture)
node scripts/install.mjs --all      # install adapters into ~/.claude, ~/.codex, ~/.antigravity
node scripts/install.mjs --dry-run  # preview install actions without writing
```

- **Lint/format are NOT configured** — `npm run lint`/`npm run format` are placeholder `echo`s. Do not assume a linter exists.
- **CI** (`.github/workflows/ci.yml`) runs `test:unit`, `test:integration`, and `test:adapters` on Node 20 and 22. It does **not** run e2e.

### Do not "simplify" the test runner

`scripts/run-tests.mjs` is a hand-rolled runner that walks directories and passes explicit test file paths to `node --test`. It exists specifically to work around **shell glob-expansion differences across platforms** and to avoid executing helper fixtures as top-level tests — replacing it with `node --test tests/**/*.mjs` will break CI on some shells. Leave it in place.

## Architecture

Two layers. The split is the most important thing to understand:

```
core/src/          ← the ONLY runtime logic. Host-agnostic. Change behavior here.
adapters/<host>/   ← thin wrappers (commands, skills, agents, prompts). No business logic.
```

**`core/src/` modules:**
- `wire-client.mjs` — `WireClient`, speaks the **Kimi Wire Protocol** (JSON-RPC over stdio) to a spawned `kimi --wire` process. Extends `EventTarget` (browser-style), so it has a custom `.on(type, listener)` shim — it is **not** a Node `EventEmitter`. Public methods: `connect`, `prompt`, `steer`, `cancel`, `dispose`. Emits `"event"` (carrying `TurnBegin`/`ContentPart`/`TurnEnd` envelopes), `"request"`, and `"error"`.
- `job-control.mjs` — `JobControl`, persists each job as a JSON file in a state dir under `$HOME` (override with `KIMI_STATE_DIR`). `create`/`read`/`update`/`delete`/`list`/`snapshot`, auto-prunes to a max job count.
- `git-context.mjs` — `GitContext`, collects review diffs (working tree, or current branch vs a base), truncating at `maxDiffBytes` (default 200 KB).
- `render.mjs` — pure markdown formatters: `renderSetupReport`, `renderReviewResult`, `renderTaskResult`, `renderStatusSnapshot`.

**Entry point & data flow:** Each host invokes `adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs` (the CLI dispatcher). It parses a subcommand — `setup | review | adversarial-review | task | status | result | cancel` — and wires together `GitContext` (gather diff) → `JobControl` (record job) → `WireClient` (drive Kimi) → `render` (markdown back to the host).

**Adapters:**
- `claude-code/plugins/kimi/` — `plugin.json` manifest, 7 commands, 1 agent (`kimi-rescue`), 3 skills, `hooks.json` (a `SessionStart` hook runs `kimi-companion.mjs setup`).
- `codex-cli/` — 4 skills + `kimi-delegate.toml` agent.
- `antigravity-cli/` — 1 rule, 3 skills, 6 workflows.

### The installer rewrites import paths — don't be fooled by the relative path

In source, `kimi-companion.mjs` imports core via `../../../../../core/src` (its location inside the repo tree). `scripts/install.mjs` **copies `core/` into the installed plugin directory and rewrites that constant to `../core`** so the companion works standalone outside the repo. When editing the companion's `CORE_SRC` line or moving files, account for both the in-repo path and this install-time rewrite.

## Kimi Wire Protocol notes

- There is **no native `review/start`** in the Kimi Wire Protocol (unlike Codex ASP). Reviews are sent as a plain `prompt` containing a structured-JSON template; the result is then **parsed from JSON** out of the model's response. See `buildReviewPrompt` in the companion and the protocol-mapping table in `ARCHITECTURE.md`.
- Protocol verbs are only `initialize`, `prompt`, `steer`, `cancel`. Anything richer is built on top of `prompt`.

## Testing conventions

- `tests/fixtures/fake-kimi.mjs` simulates `kimi --wire` so tests never touch the network or a real Kimi install. Pick a scenario with `FAKE_KIMI_BEHAVIOR` (`review-ok`, `review-findings`, `task-complete`, `auth-required`, `network-error`, `slow`, `cancel-mid`) and timing with `FAKE_KIMI_DELAY_MS`.
- When a test spawns a child process (the fixture), it **must** clean up: the fixture installs `SIGTERM`/`SIGINT` handlers and tests call `process.exit(0)` in `after()` hooks. Without this the Node test runner **hangs after completion** because open stdio pipes keep the event loop alive. Mirror this pattern in any new process-spawning test.

## Environment variables

| Var | Used by | Purpose |
|-----|---------|---------|
| `KIMI_COMMAND` | companion | Binary to spawn (default `kimi`) |
| `KIMI_ARGS` | companion | Comma-separated args (default `--wire`) |
| `KIMI_STATE_DIR` | `JobControl` | Where job JSON files live (default under `$HOME`) |
| `FAKE_KIMI_BEHAVIOR`, `FAKE_KIMI_DELAY_MS` | tests only | Fixture scenario & timing |

## Repo notes

- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- `codex-plugin-cc/` was a separate nested checkout used for reference and has been removed from this workspace. Do not recreate or edit it as part of this codebase.

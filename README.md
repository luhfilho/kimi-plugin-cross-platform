# Kimi Plugin Cross-Platform Kit

Cross-platform adapter kit for using the Kimi CLI from multiple AI coding
assistants. The same host-agnostic Node.js runtime powers thin integrations for
Claude Code, Codex CLI, and Antigravity CLI.

Use it to:

- run Kimi-backed reviews on local git changes;
- delegate implementation to Kimi Code while the host CLI plans and reviews;
- delegate rescue tasks to Kimi;
- keep background job state across assistant sessions;
- install the same workflow into supported host CLIs without duplicating core
  logic.

The package is pure Node.js ESM, targets Node 20+, uses npm workspaces, has no
runtime dependencies, and has no build step.

## Current Status

- Version: `0.2.0`
- Runtime: stable core modules under `core/src`
- Hosts: Claude Code, Codex CLI, Antigravity CLI
- Tests: unit, integration, adapter, fake-Kimi e2e, and real functional smoke
  coverage across available host CLIs
- CI: Node 20 and 22 on GitHub Actions for unit, integration, and adapter tests

Release highlights:

- Kimi Code executor: hosts create the implementation plan, Kimi performs the
  code change, and the host model reviews the diff and verification.
- Claude Code exposes `/kimi:code` and `/kimi:implement` through the current
  plugin schema under `~/.claude/skills/kimi`.
- Codex CLI installs `kimi-code` plus a `kimi-programmer` agent and uses the
  shared runtime at `~/.kimi-plugin/kimi-companion.mjs`.
- Antigravity CLI installs and registers a real `agy` plugin with `/kimi-code`
  and related commands.
- The installer now detects the `agy` binary, installs shared runtime assets,
  and has host-specific uninstall coverage.

## Showcase: end-to-end proof of concept

A complete, working app built entirely through this plugin's workflow on
**v0.2.0**, as live evidence that the cross-platform pipeline works end to end:

**[jogo-da-velha-kimi-demo](https://github.com/luhfilho/jogo-da-velha-kimi-demo)**
— a retro/neon Tic-Tac-Toe in pure vanilla JavaScript (no frameworks, no build).

- ▶️ **Live demo (GitHub Pages):** https://luhfilho.github.io/jogo-da-velha-kimi-demo/
- 📋 **Full write-up & evidence:** [`docs/showcase-jogo-da-velha.md`](docs/showcase-jogo-da-velha.md)

How it was produced — the host plans, Kimi implements, an independent model
reviews, and the host runs functional tests:

| Step | Tool | Role |
|------|------|------|
| 1. Plan | Claude Code (host) | Requirements, architecture, implementation plan |
| 2. Implement | Kimi via `/kimi:code` | Wrote `index.html`, `styles.css`, `script.js` |
| 3. Review | Codex (adversarial) | Found 5 issues, incl. a critical AI race condition |
| 4. Fix | Kimi | Applied the fixes (generation token + `clearTimeout`) |
| 5. Test | Chrome DevTools | 7 functional scenarios passed, console clean |

## Requirements

- Node.js `>=20.0.0`
- npm
- Git
- Kimi CLI available as `kimi` for real use
- At least one supported host CLI:
  - Claude Code
  - Codex CLI
  - Antigravity CLI

Tests do not require a real Kimi account or network access. They use
`tests/fixtures/fake-kimi.mjs`.

## Quick Start

```bash
git clone git@github.com:luhfilho/kimi-plugin-cross-platform.git
cd kimi-plugin-cross-platform
npm install

# Preview installation
node scripts/install.mjs --all --dry-run

# Install adapters for detected CLIs
node scripts/install.mjs --all
```

Selective install:

```bash
node scripts/install.mjs --claude
node scripts/install.mjs --codex
node scripts/install.mjs --antigravity
```

Uninstall:

```bash
node scripts/install.mjs --uninstall --all
node scripts/install.mjs --uninstall --claude
node scripts/install.mjs --uninstall --codex
node scripts/install.mjs --uninstall --antigravity
```

## What Gets Installed

| Host | Installed assets | Target |
|---|---|---|
| Claude Code | Plugin, commands, agents, skills, hooks, companion script, copied core runtime | `~/.claude/skills/kimi` |
| Codex CLI | Skills, agent roles, shared companion runtime | `~/.codex/skills`, `~/.codex/agents`, `~/.kimi-plugin` |
| Antigravity CLI | Registered `agy` plugin, commands, skills, workflows, shared companion runtime | `~/.gemini/config/plugins/kimi`, `~/.antigravity`, `~/.kimi-plugin` |

The Claude Code installer also copies `core/src` into the installed plugin and
rewrites the companion's core import path so it works outside this repository.
Codex and Antigravity use the shared runtime at `~/.kimi-plugin/kimi-companion.mjs`.

## Host Workflows

### Claude Code

Installed slash commands:

- `/kimi:setup`
- `/kimi:review`
- `/kimi:adversarial-review`
- `/kimi:rescue`
- `/kimi:code`
- `/kimi:implement`
- `/kimi:status`
- `/kimi:result`
- `/kimi:cancel`

The Claude Code plugin also includes:

- `kimi-rescue` and `kimi-code` agents for delegated task execution;
- `kimi-cli-runtime`, `kimi-prompting`, and `kimi-result-handling` skills;
- a `SessionStart` hook that can run setup checks.

### Codex CLI

Installed Codex assets:

- agent roles: `kimi-delegate`, `kimi-programmer`
- skills:
  - `kimi-review`
  - `kimi-rescue`
  - `kimi-code`
  - `kimi-status`
  - `kimi-prompting`

Codex loads these from `~/.codex`. The role file must use top-level TOML fields
`name`, `description`, and `developer_instructions`; the skill files must start
with YAML frontmatter containing `name` and `description`.

### Antigravity CLI

Installed Antigravity assets:

- registered plugin: `kimi`
- commands:
  - `/kimi-setup`
  - `/kimi-review`
  - `/kimi-rescue`
  - `/kimi-code`
  - `/kimi-status`
  - `/kimi-result`
  - `/kimi-cancel`
- rule copy: `kimi-plugin.md`
- skills:
  - `kimi-review`
  - `kimi-rescue`
  - `kimi-code`
  - `kimi-status`
- workflow copies:
  - `kimi-setup`
  - `kimi-review`
  - `kimi-rescue`
  - `kimi-code`
  - `kimi-status`
  - `kimi-result`
  - `kimi-cancel`

## Companion Commands

All source-tree commands can be exercised directly through:

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs <command>
```

Installed Codex and Antigravity adapters route to the shared runtime:

```bash
node "$HOME/.kimi-plugin/kimi-companion.mjs" <command>
```

Installed Claude Code routes to its plugin-local runtime:

```bash
node "$HOME/.claude/skills/kimi/scripts/kimi-companion.mjs" <command>
```

Supported commands:

### `setup`

Checks whether Kimi is available, whether `kimi --wire` can initialize, and
prints a Markdown setup report.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs setup
```

### `review`

Collects git changes and asks Kimi for structured JSON review output.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs review
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs review --base=main
```

If there are no changes, it prints `No changes to review.`

### `adversarial-review`

Same as `review`, but the prompt asks Kimi to challenge assumptions and look
harder for edge cases.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs adversarial-review
```

### `task`

Delegates a self-contained task prompt to Kimi and stores the result as a job.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs task "Refactor the review parser"
```

### `code` / `implement`

Delegates implementation to Kimi Code from a host-authored plan.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs code "Implement the plan in docs/plan.md and run npm test"
```

The host CLI should plan first, then call this command with a self-contained implementation plan. Kimi acts as the programmer; the host remains planner and reviewer.

Expected host behavior:

1. Inspect the repository enough to write a concrete implementation plan.
2. Include files likely to change, constraints, and verification commands.
3. Invoke `code` or `implement` with that plan.
4. Inspect Kimi's changed files and verification output before reporting
   completion.

### `status`

Shows a Markdown snapshot of recent jobs.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs status
```

### `result`

Prints the result for a finished, failed, or cancelled job.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs result --id=<job-id>
```

### `cancel`

Marks a running or queued job as cancelled.

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs cancel --id=<job-id>
```

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `KIMI_COMMAND` | companion, tests | Binary to spawn. Defaults to `kimi`. |
| `KIMI_ARGS` | companion, tests | Comma-separated args. Defaults to `--wire`. |
| `KIMI_MODEL` | companion | Optional model label, recommended `kimi-for-coding` for Kimi Code. |
| `KIMI_WORK_DIR` | companion | Working directory for the Kimi subprocess. Defaults to current directory. |
| `KIMI_PERMISSION_MODE` | companion | Permission label for code jobs: `default`, `auto`, or `yolo`. |
| `KIMI_EXECUTOR` | companion | Human-readable executor label stored in jobs. |
| `KIMI_STATE_DIR` | `JobControl` | Directory for persisted job JSON files. |
| `FAKE_KIMI_BEHAVIOR` | tests | Fake Kimi scenario. |
| `FAKE_KIMI_DELAY_MS` | tests | Fake Kimi response delay. |

Example using the fixture manually:

```bash
KIMI_COMMAND=node \
KIMI_ARGS=tests/fixtures/fake-kimi.mjs \
KIMI_STATE_DIR=/tmp/kimi-state \
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs setup
```

Example using Kimi Code executor settings:

```bash
KIMI_COMMAND=kimi-agent \
KIMI_ARGS=--work-dir,/path/to/repo,--model,kimi-for-coding \
KIMI_EXECUTOR=kimi-agent \
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs code "Implement the approved plan"
```

## Architecture

The repository has two layers.

```text
core/src/          host-agnostic runtime logic
adapters/<host>/   thin host wrappers, prompts, skills, rules, workflows
```

Runtime modules:

- `wire-client.mjs`: `WireClient`, JSON-RPC over stdio client for
  `kimi --wire`. It extends `EventTarget` and provides an `.on()` convenience
  method, but it is not a Node `EventEmitter`.
- `job-control.mjs`: `JobControl`, file-backed job persistence under the user's
  home directory or `KIMI_STATE_DIR`.
- `git-context.mjs`: `GitContext`, review context collector for working-tree and
  branch diffs, with truncation for large diffs.
- `render.mjs`: pure Markdown renderers for setup reports, review results, task
  results, and status snapshots.

Data flow:

```text
host command
  -> kimi-companion.mjs
  -> GitContext, when review context is needed
  -> JobControl, for persisted job state
  -> WireClient, for Kimi Wire Protocol calls
  -> render.mjs, for Markdown output back to the host
```

## Kimi Wire Protocol Notes

Kimi Wire Protocol is JSON-RPC 2.0 over stdio. The runtime uses the protocol
verbs available to Kimi CLI:

- `initialize`
- `prompt`
- `steer`
- `cancel`

There is no native `review/start` method. Reviews are implemented as normal
`prompt` calls containing a structured review request. The companion then parses
JSON from the model response when available.

## Testing

Run everything:

```bash
npm test
```

Run focused suites:

```bash
npm run test:unit
npm run test:integration
npm run test:adapters
node scripts/test-e2e.mjs
```

Run a single file:

```bash
node --test tests/unit/wire-client.test.mjs
```

Run a single test case:

```bash
node --test --test-name-pattern="classifyExit" tests/unit/test-e2e.test.mjs
```

The custom runner in `scripts/run-tests.mjs` intentionally walks directories and
passes explicit test files to `node --test`. It exists to avoid shell glob
differences across platforms. Do not replace it with a shell glob.

Directory scans only include files with `.test.` in the filename, so helper
fixtures such as `tests/fixtures/fake-kimi.mjs` are not executed as tests.

### Fake Kimi Scenarios

`tests/fixtures/fake-kimi.mjs` simulates `kimi --wire`.

Supported scenarios:

- `review-ok`
- `review-findings`
- `task-complete`
- `auth-required`
- `network-error`
- `slow`
- `cancel-mid`

Example:

```bash
FAKE_KIMI_BEHAVIOR=review-findings \
FAKE_KIMI_DELAY_MS=5 \
node --test tests/unit/wire-client.test.mjs
```

## CI

GitHub Actions runs on Node 20 and 22:

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:adapters`

The e2e script is intentionally available locally but is not part of the CI
workflow in this branch.

## Project Structure

```text
.
|-- adapters/
|   |-- antigravity-cli/
|   |-- claude-code/
|   `-- codex-cli/
|-- core/
|   `-- src/
|-- docs/
|-- scripts/
|-- tests/
|   |-- adapters/
|   |-- fixtures/
|   |-- integration/
|   `-- unit/
|-- AGENTS.md
|-- CHANGELOG.md
|-- PROJECT_MEMORY.md
`-- README.md
```

## Development Notes

- Keep runtime behavior in `core/src`.
- Keep adapters thin. They should hold host-specific commands, skills, prompts,
  rules, workflows, and install layout.
- Preserve `scripts/run-tests.mjs`; it is intentionally not a shell glob.
- Process-spawning tests must clean up child processes. Open stdio pipes can keep
  the Node test runner alive after assertions finish.
- `codex-plugin-cc/` was a separate nested checkout used for reference. It is
  not part of this project.

## Troubleshooting

### Codex skips Kimi skills

Check that each installed `~/.codex/skills/kimi-*/SKILL.md` starts with:

```markdown
---
name: kimi-...
description: ...
---
```

Then restart Codex.

### Codex ignores `kimi-delegate`

Check `~/.codex/agents/kimi-delegate.toml`. It should define top-level fields,
not `[agent]`, `[capabilities]`, or `[behavior]` tables:

```toml
name = "kimi-delegate"
description = "Delegate work to Kimi CLI"

developer_instructions = """
Always formulate self-contained prompts for Kimi.
Report job IDs and status to the user.
Parse structured JSON review output when available.
"""
```

### MCP startup warnings in Codex

Codex may warn when optional MCP servers require missing environment variables.
Either set the required secrets or disable those server blocks in
`~/.codex/config.toml`.

### `npm test` hangs

Make sure `scripts/run-tests.mjs` filters directory scans to `*.test.*` files.
Executing the fake Kimi fixture as a top-level test can leave the test run
waiting on stdio.

### Real Kimi is unavailable

Run:

```bash
node adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs setup
```

For tests, use `KIMI_COMMAND=node` and `KIMI_ARGS=tests/fixtures/fake-kimi.mjs`
instead of a real Kimi install.

## Roadmap

Tracked ideas:

- broker lifecycle for a warm shared `kimi --wire` process;
- review gate hook for blocking commits with findings;
- real Kimi end-to-end integration tests;
- partial job ID support for `cancel` and `result`;
- configurable command timeouts;
- status pagination for large job histories.

## License

MIT

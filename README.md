# Kimi Plugin Cross-Platform Kit

A cross-platform plugin kit that integrates [Kimi CLI](https://www.moonshot.cn/) (Moonshot AI) into Claude Code, Codex CLI, and Antigravity CLI. Run code reviews, delegate rescue tasks, and manage background jobs — from whichever AI coding assistant you prefer.

[![Tests](https://github.com/luhfilho/kimi-plugin-cross-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/luhfilho/kimi-plugin-cross-platform/actions)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What You Get

| Feature | Claude Code | Codex CLI | Antigravity CLI |
|---------|-------------|-----------|-----------------|
| Code Review | `/kimi:review` | `kimi-review` skill | `kimi-review` workflow |
| Adversarial Review | `/kimi:adversarial-review` | — | — |
| Task / Rescue | `/kimi:rescue` + agent | `kimi-rescue` skill | `kimi-rescue` workflow |
| Job Status | `/kimi:status` | `kimi-status` skill | `kimi-status` workflow |
| Job Result | `/kimi:result` | — | `kimi-result` workflow |
| Job Cancel | `/kimi:cancel` | — | `kimi-cancel` workflow |
| Setup Check | `/kimi:setup` | — | `kimi-setup` workflow |

---

## Requirements

- **Node.js 20.0+**
- **Kimi CLI 1.45.0+** (`npm install -g kimi-cli` or see [Moonshot](https://www.moonshot.cn/))
- One or more of the supported host CLIs:
  - [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
  - [Codex CLI](https://github.com/openai/codex)
  - [Antigravity CLI](https://antigravity.ai/)

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/luhfilho/kimi-plugin-cross-platform.git
cd kimi-plugin-cross-platform
npm install        # if you want to run tests
node scripts/install.mjs --all
```

### 2. Claude Code

```
/reload-plugins
/kimi:setup
```

### 3. Codex CLI

```bash
codex --agent kimi-delegate
```

### 4. Antigravity CLI

```bash
ag run kimi-setup
```

---

## Commands Reference

### `setup`
Checks whether Kimi CLI is installed, authenticated, and ready to use.

### `review`
Runs a read-only code review on uncommitted changes or a specific branch.

```
/kimi:review              # review uncommitted changes
/kimi:review --base=main  # review current branch vs main
```

### `adversarial-review`
Same as `review`, but Kimi is instructed to challenge assumptions, look for edge cases, and question design decisions.

### `task` (rescue)
Delegates an open-ended task to Kimi in the background.

```
/kimi:task "Refactor the auth module to use JWT tokens"
```

### `status`
Lists all jobs: running, finished, failed, or cancelled.

### `result --id=<job-id>`
Shows the full output of a completed job.

### `cancel --id=<job-id>`
Cancels a running or queued job.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Host CLI Layer                            │
│  ┌──────────────┐ ┌────────────┐ ┌──────────────────────┐   │
│  │ Claude Code  │ │ Codex CLI  │ │ Antigravity CLI      │   │
│  │  (plugins)   │ │  (skills)  │ │ (rules/skills/flows) │   │
│  └──────┬───────┘ └─────┬──────┘ └──────────┬───────────┘   │
└─────────┼───────────────┼───────────────────┼───────────────┘
          │               │                   │
          └───────────────┴───────────────────┘
                          │
              ┌───────────▼────────────┐
              │   kimi-companion.mjs   │
              │   (CLI entry point)    │
              └───────────┬────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
   ┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼─────┐
   │ WireClient  │ │ JobControl  │ │ GitContext│
   │(Kimi Wire)  │ │  (state)    │ │  (diffs)  │
   └─────────────┘ └─────────────┘ └───────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for protocol details.

---

## Testing

```bash
npm test                  # all tests
npm run test:unit         # unit tests only
npm run test:integration  # integration tests only
```

34 tests, 0 failures. See [TESTING.md](TESTING.md) for details.

---

## Project Structure

```
.
├── core/src/               # Core runtime (WireClient, JobControl, GitContext, Render)
├── adapters/
│   ├── claude-code/        # Claude Code plugin
│   ├── codex-cli/          # Codex CLI skills & agents
│   └── antigravity-cli/    # Antigravity CLI rules, skills, workflows
├── scripts/
│   ├── install.mjs         # Automated installer
│   └── test-e2e.mjs        # End-to-end test suite
├── tests/                  # Unit & integration tests
└── docs/                   # Additional documentation
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## Contributing

See [CONTRIBUTORS.md](CONTRIBUTORS.md).

---

## License

MIT © Luciano Filho

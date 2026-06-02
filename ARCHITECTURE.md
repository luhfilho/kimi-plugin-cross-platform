# Architecture

## Overview

The Kimi Plugin Cross-Platform Kit consists of:

1. **Core Runtime** (`core/src/`) — shared logic for communicating with Kimi CLI,
   storing jobs, parsing model output, and rendering Markdown.
2. **Host Adapters** (`adapters/`) — platform-native packaging for each host
   CLI. Adapters stay thin; behavior lives in core modules.

## Core Modules

### `wire-client.mjs`

Manages the lifecycle of a `kimi --wire` subprocess. Handles JSON-RPC 2.0 handshake, prompt/steer/cancel methods, and event parsing.

### `job-control.mjs`

Persists job metadata to JSON files. Provides CRUD operations, listing, and status snapshots.

### `git-context.mjs`

Collects git diff, untracked files, and branch info for review prompts.

### `render.mjs`

Markdown formatters for setup reports, review findings, task results, and status tables.

### `code-result.mjs`

Builds the Kimi Code prompt contract and parses Kimi implementation reports.
It accepts direct JSON, fenced JSON, embedded contract-shaped JSON, and plain
text fallback output. The normalized result includes summary, changed files,
verification entries, follow-up items, raw output, and error state.

## Protocol Mapping

| Concept | Codex ASP | Kimi Wire |
|---------|-----------|-----------|
| Initialize | `initialize` | `initialize` |
| Start turn | `turn/start` | `prompt` |
| Steer | `turn/steer` | `steer` |
| Cancel | `turn/interrupt` | `cancel` |
| Review | `review/start` | `prompt` + review template |
| Events | `item/started`, `turn/completed` | `TurnBegin`, `TurnEnd`, `ContentPart` |

## Planner/executor code flow

For implementation work, the host CLI remains the planner and reviewer. Kimi is
the programmer.

1. The host model inspects the repository and writes a self-contained plan.
2. The host invokes `kimi-companion.mjs code "<plan>"` or `implement "<plan>"`.
3. The companion wraps the plan in the Kimi Code result contract.
4. `WireClient` runs Kimi in `KIMI_WORK_DIR` and passes optional executor
   settings such as `KIMI_COMMAND`, `KIMI_ARGS`, and `KIMI_MODEL`.
5. The companion persists a `kind: "code"` job, parses the final Kimi report,
   and renders summary, changed files, verification, follow-up, and raw output.
6. The host model reviews the diff and verification before final response.

This split lets Claude Code, Codex CLI, and Antigravity CLI use their native
models for planning while delegating code edits to Kimi Code.

## Host Differences

- **Claude Code**: Plugin installed at `~/.claude/skills/kimi` using the current
  Claude Code plugin schema. Components are auto-discovered from `commands/`,
  `agents/`, `skills/`, and `hooks/`. The companion and copied core runtime are
  plugin-local.
- **Codex CLI**: Skills and TOML agents installed under `~/.codex`. Codex uses
  `kimi-code` and `kimi-programmer` to plan natively, then invokes the shared
  runtime at `~/.kimi-plugin/kimi-companion.mjs`.
- **Antigravity CLI**: Real `agy` plugin with `plugin.json` and `commands/`
  entries. The installer registers it through `agy plugin install`, keeps
  compatibility copies under `~/.antigravity`, and uses the shared runtime at
  `~/.kimi-plugin/kimi-companion.mjs`.

## Installed Runtime Layout

| Host | Runtime path | Notes |
|---|---|---|
| Claude Code | `~/.claude/skills/kimi/scripts/kimi-companion.mjs` | Bundles `core/src` as `core/` and rewrites imports during install. |
| Codex CLI | `~/.kimi-plugin/kimi-companion.mjs` | Shared runtime for Codex skills and agents. |
| Antigravity CLI | `~/.kimi-plugin/kimi-companion.mjs` | Shared runtime for `agy` commands converted to skills. |

## Functional Validation Notes

The v0.2.0 release was validated with real local CLIs:

- Kimi CLI `1.45.0` through `kimi-companion code`.
- Codex CLI `0.136.0` through `codex exec` delegating to Kimi.
- Claude Code `2.1.160` through `/kimi:code`.
- Antigravity CLI `agy 1.0.0` through `agy plugin validate` and plugin
  registration. Full `/kimi-code` execution requires the user's Antigravity
  OAuth session; unauthenticated runs stop at the provider login prompt.

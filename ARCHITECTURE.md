# Architecture

## Overview

The Kimi Plugin Cross-Platform Kit consists of:

1. **Core Runtime** (`core/src/`) — Shared logic for communicating with Kimi CLI
2. **Host Adapters** (`adapters/`) — Platform-native packaging for each host

## Core Modules

### `wire-client.mjs`

Manages the lifecycle of a `kimi --wire` subprocess. Handles JSON-RPC 2.0 handshake, prompt/steer/cancel methods, and event parsing.

### `job-control.mjs`

Persists job metadata to JSON files. Provides CRUD operations, listing, and status snapshots.

### `git-context.mjs`

Collects git diff, untracked files, and branch info for review prompts.

### `render.mjs`

Markdown formatters for setup reports, review findings, task results, and status tables.

## Protocol Mapping

| Concept | Codex ASP | Kimi Wire |
|---------|-----------|-----------|
| Initialize | `initialize` | `initialize` |
| Start turn | `turn/start` | `prompt` |
| Steer | `turn/steer` | `steer` |
| Cancel | `turn/interrupt` | `cancel` |
| Review | `review/start` | `prompt` + review template |
| Events | `item/started`, `turn/completed` | `TurnBegin`, `TurnEnd`, `ContentPart` |

## Host Differences

- **Claude Code**: Full feature set with native commands, agents, skills, and hooks
- **Codex CLI**: Skills-only (no hooks, no native slash commands)
- **Antigravity CLI**: Workflows + skills + rules (no documented hooks)

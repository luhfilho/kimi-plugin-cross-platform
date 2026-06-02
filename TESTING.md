# Testing

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Adapter tests
npm run test:adapters

# Code executor integration scenario
FAKE_KIMI_BEHAVIOR=code-json node --test tests/integration/companion.test.mjs
```

## Test Structure

- `tests/unit/` — Unit tests for core modules and scripts (wire-client, job-control, git-context, render, installer)
- `tests/integration/` — Integration tests for the companion script
- `tests/adapters/` — Adapter packaging tests for Claude Code, Codex CLI, and Antigravity CLI
- `tests/fixtures/` — Fake Kimi CLI server for testing

## Fake Kimi Fixture

The `tests/fixtures/fake-kimi.mjs` script mimics `kimi --wire` behavior:

- Responds to `initialize` with server info
- Emits `TurnBegin`, `ContentPart`, `TurnEnd` events
- Supports `prompt`, `steer`, `cancel` methods
- Behaviors configurable via `FAKE_KIMI_BEHAVIOR` env var:
  - `review-ok` — clean review
  - `review-findings` — structured findings
  - `task-complete` — task output
  - `code-json` - structured implementation report
  - `code-text` - plain text implementation report
  - `approval-required` - emits an approval request before completing
  - `network-error` - simulated transport failure
  - `slow` - delayed response for cancellation and timeout checks
  - `auth-required` — auth error
  - `cancel-mid` — requires cancel to finish

## Kimi Code Coverage

The code executor is covered at three layers:

- Unit tests for `buildCodePrompt`, `parseCodeResult`, and
  `renderCodeResult`.
- Integration tests for `kimi-companion.mjs code`, persisted `kind: "code"`
  jobs, and `result` rendering.
- Adapter tests that confirm each supported host exposes a planner/executor
  entrypoint:
  - Claude Code: `/kimi:code`, `/kimi:implement`, and `kimi-code` agent.
  - Codex CLI: `kimi-code` skill and `kimi-programmer` agent.
  - Antigravity CLI: `plugin.json`, `/kimi-code` command, skill, and workflow.

Installer tests cover:

- `agy` binary detection.
- Claude Code installation into `~/.claude/skills/kimi`.
- shared runtime installation at `~/.kimi-plugin`.
- Antigravity plugin registration via `agy plugin install`.
- host-specific uninstall targets.

## Real Functional Smoke Tests

The v0.2.0 release was smoke-tested against installed local CLIs using temporary
git fixtures with a failing `math.mjs` test:

- Direct Kimi path: `kimi-companion.mjs code` fixed the file and `npm test`
  passed.
- Codex CLI: `codex exec` planned natively, invoked the shared Kimi runtime,
  and verified the diff.
- Claude Code: `/kimi:code` loaded from `~/.claude/skills/kimi`, delegated to
  Kimi, and verified the diff.
- Antigravity CLI: `agy plugin validate` passed and `agy plugin list` showed the
  `kimi` plugin installed. Full `/kimi-code` execution requires an active
  Antigravity OAuth session; unauthenticated runs stop at `authentication timed
  out`.

## TDD Approach

We follow RED/GREEN TDD:
1. Write a failing test
2. Implement the minimal code to make it pass
3. Refactor while keeping tests green

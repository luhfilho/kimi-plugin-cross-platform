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
  - `auth-required` — auth error
  - `cancel-mid` — requires cancel to finish

## TDD Approach

We follow RED/GREEN TDD:
1. Write a failing test
2. Implement the minimal code to make it pass
3. Refactor while keeping tests green

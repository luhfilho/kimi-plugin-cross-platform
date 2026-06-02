# Kimi Plugin Cross-Platform Kit - Testing Report

**Branch:** `bugfix/codex-startup-warnings`
**Current focus:** Codex adapter startup hardening, test runner reliability, and
self-contained e2e validation.

This report describes the current automated test surface. Older references to a
fixed `/tmp/boletim-escolar` project are obsolete: the e2e script now creates an
isolated temporary git fixture on each run.

---

## 1. Test Commands

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:adapters
node scripts/test-e2e.mjs
```

Single-file examples:

```bash
node --test tests/unit/wire-client.test.mjs
node --test --test-name-pattern="classifyExit" tests/unit/test-e2e.test.mjs
```

---

## 2. Suite Coverage

| Suite | Command | Scope |
|---|---|---|
| Full local suite | `npm test` | Unit, integration, and adapter tests discovered by the custom runner |
| Unit | `npm run test:unit` | Core runtime, runner behavior, and e2e helper behavior |
| Integration | `npm run test:integration` | `kimi-companion.mjs` command-level integration checks |
| Adapters | `npm run test:adapters` | Codex skill frontmatter and agent role metadata |
| E2E | `node scripts/test-e2e.mjs` | Full companion flow with fake Kimi and temporary git fixture |

The custom runner in `scripts/run-tests.mjs` is intentionally kept. It walks
directories and passes explicit `.test.` files to `node --test`, avoiding shell
glob differences and preventing helper fixtures from being executed as tests.

---

## 3. Fake Kimi Fixture

`tests/fixtures/fake-kimi.mjs` simulates `kimi --wire` without a network call or
real Kimi authentication.

Supported scenarios:

- `review-ok`
- `review-findings`
- `task-complete`
- `auth-required`
- `network-error`
- `slow`
- `cancel-mid`

Tests can tune behavior with:

```bash
FAKE_KIMI_BEHAVIOR=review-findings
FAKE_KIMI_DELAY_MS=5
```

---

## 4. E2E Script

`scripts/test-e2e.mjs` now:

1. creates a temporary project directory with `mkdtempSync`;
2. initializes a local git repository;
3. configures a local git identity;
4. commits a baseline fixture;
5. runs companion commands with `KIMI_COMMAND=node` and
   `KIMI_ARGS=tests/fixtures/fake-kimi.mjs`;
6. classifies each command against an expected exit status;
7. removes the temporary project and state directory.

Covered e2e commands:

- `setup`
- `review` with no changes
- `review` with changes
- `adversarial-review`
- `task`
- `status`
- `result`
- `cancel --id=nonexistent` with expected exit `1`

The e2e suite treats an unexpected non-zero exit as a failure. Expected failures,
such as cancelling a nonexistent job, must declare `expectStatus`.

---

## 5. Codex Adapter Regression Coverage

`tests/adapters/codex-adapter.test.mjs` guards the two Codex startup regressions
that motivated this branch:

- Kimi Codex skills must start with YAML frontmatter containing `name` and
  `description`.
- `kimi-delegate.toml` must use top-level `name`, `description`, and
  `developer_instructions`; old `[agent]`, `[capabilities]`, and `[behavior]`
  tables are rejected.

These tests prevent the installer from reintroducing files that current Codex
would skip or reject during startup.

---

## 6. CI Coverage

`.github/workflows/ci.yml` runs on Node 20 and Node 22:

```bash
npm run test:unit
npm run test:integration
npm run test:adapters
```

The e2e script is not part of CI in this branch. Run it locally before claiming
end-to-end behavior is healthy.

---

## 7. Latest Local Verification

Fresh verification during the documentation update:

```text
npm test
# tests 47
# pass 47
# fail 0

node scripts/test-e2e.mjs
# Passed: 9
# Failed: 0
```

Earlier verification for the Codex startup fix also showed:

```text
codex doctor
13 ok · 1 idle · 2 notes · 0 warn · 0 fail
```

---

## 8. Known Boundaries

- Real Kimi network/auth integration is not exercised by automated tests.
- E2E coverage uses fake Kimi, so it verifies host/runtime wiring and protocol
  handling, not model quality.
- Codex, Claude Code, and Antigravity host UIs are not driven directly in CI.
- Optional local MCP server health is outside this repository; only the Codex
  adapter metadata is covered here.

---

## 9. Maintenance Rules

- Keep `scripts/run-tests.mjs`; do not replace it with shell globs.
- Add new process-spawning tests with explicit cleanup.
- Keep e2e fixture setup self-contained; do not depend on fixed directories
  under `/tmp`.
- Add adapter tests whenever host metadata formats change.

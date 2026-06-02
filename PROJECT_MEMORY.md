# Kimi Plugin Cross-Platform Kit — Neural Memory Consolidation

**Project**: `kimi-plugin-cross-platform`
**Date**: 2026-06-02
**Status**: v0.2.0 Released
**Repo**: https://github.com/luhfilho/kimi-plugin-cross-platform

---

## 1. TODOs — Completed

- [x] Create core runtime (wire-client, job-control, git-context, render)
- [x] Create Claude Code adapter (7 commands, 1 agent, 3 skills)
- [x] Create Codex CLI adapter (4 skills, 1 agent TOML)
- [x] Create Antigravity CLI adapter (1 rule, 3 skills, 6 workflows)
- [x] Write 34 unit + integration tests with fake-kimi fixture
- [x] Create automated installer (`scripts/install.mjs`)
- [x] Create E2E test suite (`scripts/test-e2e.mjs`)
- [x] Write documentation (README, CHANGELOG, CONTRIBUTORS, ARCHITECTURE, TESTING)
- [x] Set up GitHub Actions CI
- [x] Create GitHub repo, push, tag v0.1.0, release
- [x] Fix CI glob expansion issue with custom test runner
- [x] Add Kimi Code planner/executor flow for Claude Code, Codex CLI, and Antigravity CLI
- [x] Validate real Kimi execution through direct companion, Codex CLI, and Claude Code
- [x] Register Antigravity adapter as a real `agy` plugin

## 2. Pending Tasks

| Task | Priority | Description |
|------|----------|-------------|
| Broker lifecycle | Medium | Warm-start shared `kimi --wire` process via Unix socket |
| Review gate hook | Medium | Claude Code `Stop` hook for blocking commits with findings |
| E2E with real Kimi | Medium | Real `kimi --wire` integration tests (not fake) |
| Partial ID support | Low | Allow `cancel`/`result` with partial job IDs |
| Configurable timeouts | Low | Per-command timeout configuration |
| Status pagination | Low | Paginate large job histories |
| Codex/Antigravity E2E | Low | E2E tests for remaining adapters |

---

## 3. Challenges Faced

### Challenge 1: Node.js test runner hangs with child process pipes
- **Impact**: Tests froze after completion
- **Root cause**: stdio pipes from fake-kimi kept handles active in event loop
- **Solution**: Added SIGTERM/SIGINT handlers in fake-kimi + `process.exit(0)` in `after()` hooks

### Challenge 2: Race condition in fake-kimi cancel-mid
- **Impact**: Cancel test hung indefinitely
- **Root cause**: Cancel arrived before `handlePrompt` created the resolution Promise
- **Solution**: Used `cancelledFlag` boolean + check inside Promise constructor

### Challenge 3: Deadlock in fake-kimi readline loop
- **Impact**: Messages not processed concurrently
- **Root cause**: `await handlePrompt(msg)` blocked the readline loop
- **Solution**: Fire-and-forget handlers with `.catch(() => {})`

### Challenge 4: No native `review/start` in Kimi Wire Protocol
- **Impact**: Cannot use native review like Codex ASP
- **Root cause**: Kimi Wire only has `prompt`/`steer`/`cancel`
- **Solution**: Implemented reviews as `prompt` with structured JSON template

### Challenge 5: EventTarget lacks `.on()` method
- **Impact**: Tests failed with "client.on is not a function"
- **Root cause**: Node.js EventTarget doesn't implement EventEmitter pattern
- **Solution**: Added convenience wrapper `on(type, listener)` in WireClient

### Challenge 6: Process hang on dispose
- **Impact**: Child process kept event loop alive after SIGKILL
- **Root cause**: stdin pipe prevents process exit
- **Solution**: Call `proc.stdin.destroy()` in `dispose()`

### Challenge 7: CI glob expansion failure
- **Impact**: GitHub Actions failed on both Node 20 and 22
- **Root cause**: Shell in CI runner doesn't expand `**` globs; Node 20 doesn't support globs in `--test`
- **Solution**: Created `scripts/run-tests.mjs` — custom recursive scanner that passes explicit file list to `node --test`

### Challenge 8: Companion core module path after install
- **Impact**: Companion broke when installed outside repo
- **Root cause**: Relative path `../../../../../core/src` invalid after copy
- **Solution**: Install script copies `core/src/` into plugin dir + rewrites import path to `../core`

---

## 4. Errors / Gotchas

| Error | Trigger | Resolution |
|-------|---------|------------|
| `client.on is not a function` | Using EventTarget like EventEmitter | Add `on(type, listener)` wrapper |
| `Module not found` after install | Companion path resolution broken | Copy core modules + rewrite path |
| Test runner hangs | Child process stdio pipes active | Destroy stdin, exit in after hooks |
| Cancel race condition | Cancel before prompt Promise created | `cancelledFlag` + constructor check |
| `Could not find 'tests/**/*.test.mjs'` | CI shell glob expansion | Custom `run-tests.mjs` scanner |
| `eval is not defined` in ESM | Using `require` in ESM module | Use `await import()` instead |
| `No agent turn is in progress` | Cancel after turn already ended | Check streaming state before cancel |
| `ENOENT: state.json not found` | JobControl uses individual files | List `.json` files, not `state.json` |
| `Permission denied` on install script | Missing shebang execution bit | `chmodSync(companion, 0o755)` |

---

## 5. Decisions

### Decision 1: Node.js instead of Python
- **Chosen**: Node.js 20+ with ESM, zero runtime deps
- **Rejected**: Python (Kimi CLI is Python, but hosts are JS-based)
- **Reason**: Host CLIs (Claude, Codex) are JS-native; easier integration

### Decision 2: Kimi Wire Protocol over Codex ASP
- **Chosen**: Implement prompt/steer/cancel via JSON-RPC stdio
- **Rejected**: Codex Agent Service Protocol (HTTP/SSE)
- **Reason**: Kimi only supports Wire Protocol; no native review endpoint

### Decision 3: Independent state per host
- **Chosen**: Each host maintains its own state directory
- **Rejected**: Shared state with cross-host sync
- **Reason**: Simplicity, no conflict resolution needed

### Decision 4: Fake-kimi fixture for tests
- **Chosen**: Pure Node.js fake server simulating Kimi Wire
- **Rejected**: Mocking at unit level only
- **Reason**: Integration tests need realistic protocol behavior

### Decision 5: Custom test runner for CI
- **Chosen**: `scripts/run-tests.mjs` recursive scanner
- **Rejected**: `glob` npm package, shell expansion tricks
- **Reason**: Zero dependencies, works across all shells and Node versions

---

## 6. Insights

### Insight 1: Kimi Wire Protocol Mapping
```
Kimi Wire Protocol v1.10
├── initialize → server_info
├── prompt(user_input) → TurnBegin, ContentPart*, TurnEnd
├── steer(user_input) → status: "steered"
├── cancel() → status: "cancelled"
└── Events: ApprovalRequest, ToolCallRequest, QuestionRequest, HookRequest

Auto-approval policy:
- ApprovalRequest → auto-approve
- ToolCallRequest → reject with error
- QuestionRequest → empty answer
- HookRequest → allow
```

### Insight 2: Cross-Shell Glob Compatibility
- Bash: `**` requires `shopt -s globstar`
- CI runners: Often disable globstar or use different shells
- Node.js `--test`: Glob support added in 20.11+ but behavior varies
- **Robust solution**: Always scan directories programmatically in JS

### Insight 3: Child Process Lifecycle
- `proc.kill()` doesn't immediately release handles
- `proc.stdin.destroy()` is required to break the event loop
- SIGTERM → wait → SIGKILL pattern for graceful shutdown

### Insight 4: JSON-RPC over stdio
- Each line is a complete JSON-RPC message
- `ContentPart` events stream during a turn
- Must auto-respond to server requests to prevent blocking

---

## 7. Evidence

### Evidence 1: CI Passing
- **URL**: https://github.com/luhfilho/kimi-plugin-cross-platform/actions/runs/26593068732
- **Result**: Both Node 20 and Node 22 jobs pass
- **Duration**: ~20s per job

### Evidence 2: E2E Test Results (Fake Kimi)
- **Script**: `scripts/test-e2e.mjs`
- **Result**: 9/9 tests passed
- **Coverage**: setup, review, adversarial-review, task, status, result, cancel

### Evidence 3: Real Kimi Test Results
- **Command**: `kimi-companion.mjs review`
- **Finding**: 5 vulnerabilities in auth-middleware.js
- **Severity**: 3 errors, 2 warnings
- **Details**: Timing attack, insecure fallback, hardcoded secret, loose equality, malformed header parsing

### Evidence 4: Real Kimi Task
- **Command**: `kimi-companion.mjs task "List 3 security issues..."`
- **Result**: Identified SQL injection, RCE via eval(), hardcoded password
- **Accuracy**: 100% match with intentionally planted vulnerabilities

### Evidence 5: Install Script
- **Detects**: Claude Code ✅, Codex CLI ✅, Antigravity CLI (`agy`) ✅
- **Installs**: `~/.claude/skills/kimi`, `~/.codex/`, `~/.antigravity/`, `~/.kimi-plugin/`
- **Features**: `--dry-run`, `--uninstall`, `--claude`, `--codex`, `--antigravity`, `agy plugin install`

---

## 8. Solutions Summary

### Solution: Automated Installer
```javascript
// scripts/install.mjs
// Detects CLIs, copies adapters, fixes paths, sets permissions
node scripts/install.mjs --all
```

### Solution: Custom Test Runner
```javascript
// scripts/run-tests.mjs
// Recursively scans directories, passes explicit file list to node --test
node scripts/run-tests.mjs tests/unit/
```

### Solution: Fake-Kimi Fixture
```javascript
// tests/fixtures/fake-kimi.mjs
// Simulates full Kimi Wire Protocol for testing without real CLI
// Handles initialize, prompt, steer, cancel with realistic timing
```

### Solution: WireClient with Auto-Approval
```javascript
// core/src/wire-client.mjs
// Auto-approves ApprovalRequest, rejects ToolCallRequest
// Destroys stdin on dispose to prevent event loop hang
```

---

## 9. Knowledge Index

| Topic | Location |
|-------|----------|
| Protocol spec | `ARCHITECTURE.md` |
| Test guide | `TESTING.md` |
| E2E results | `PROJECT_TESTING_REPORT.md` |
| Install guide | `README.md` |
| Changes | `CHANGELOG.md` |
| Contributing | `CONTRIBUTORS.md` |
| Core runtime | `core/src/*.mjs` |
| Adapters | `adapters/*/` |
| Tests | `tests/**/*.test.mjs` |
| Installer | `scripts/install.mjs` |
| Test runner | `scripts/run-tests.mjs` |
| E2E suite | `scripts/test-e2e.mjs` |

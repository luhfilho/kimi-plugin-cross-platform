# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Broker lifecycle for warm-start shared `kimi --wire` process via Unix socket
- Review gate hook (Stop) for blocking commits with findings in Claude Code
- Real `kimi --wire` end-to-end integration tests
- Support for partial job IDs in `cancel` and `result` commands
- Configurable timeouts per command
- Status pagination for large job histories

## [0.1.1] - 2026-06-02

### Added
- Codex adapter regression tests for skill frontmatter and agent role metadata
- E2E helper classification tests for expected non-zero exits
- Project guidance and session-consolidation documentation

### Changed
- Test runner now scans only `.test.` files in directories, avoiding helper fixture execution
- E2E script now creates an isolated temporary git fixture and validates expected exit statuses
- CI now includes adapter tests on Node 20 and 22
- README and testing report were refreshed for the current adapter and test workflow

### Fixed
- Codex CLI adapter startup warnings by adding required skill frontmatter and valid agent role metadata
- Full test suite hangs caused by executing `tests/fixtures/fake-kimi.mjs` as a test file
- False-green E2E results for commands that exited with unexpected status

## [0.1.0] - 2026-05-28

### Added
- Core runtime modules (`wire-client`, `job-control`, `git-context`, `render`)
- Wire Client for Kimi CLI JSON-RPC 2.0 protocol over stdio
- Job persistence with JSON state files and automatic pruning (max 50 jobs)
- Git context collection for diffs, untracked files, and branch comparison
- Markdown renderers for setup, review, task, and status output
- Claude Code adapter with 7 commands (`setup`, `review`, `adversarial-review`, `rescue`, `status`, `result`, `cancel`)
- Claude Code agent (`kimi-rescue`) for delegated task execution
- Claude Code skills (`kimi-cli-runtime`, `kimi-prompting`, `kimi-result-handling`)
- Codex CLI adapter with 4 skills (`kimi-review`, `kimi-rescue`, `kimi-status`, `kimi-prompting`) and 1 agent (`kimi-delegate`)
- Antigravity CLI adapter with 1 rule, 3 skills, and 6 workflows
- Automated installer script (`scripts/install.mjs`) supporting `--dry-run`, `--uninstall`, and selective installs
- End-to-end test suite (`scripts/test-e2e.mjs`) with fake-kimi fixture
- 34 unit and integration tests covering wire protocol, job control, git context, and rendering
- GitHub Actions CI workflow for automated testing
- Comprehensive documentation: README, ARCHITECTURE, TESTING, and PROJECT_TESTING_REPORT

### Fixed
- Process hang on dispose: stdin pipe destroyed after SIGTERM/SIGKILL
- Cancel race condition in fake-kimi fixture
- EventTarget missing `.on()` method: added convenience wrapper
- Install script core module path resolution for out-of-repo execution

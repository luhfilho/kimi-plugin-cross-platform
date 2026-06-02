# Kimi Code Executor Design

Status: Approved for implementation planning
Date: 2026-06-02

## Goal

Evolve the project from a mostly review/rescue delegation kit into a cross-platform coding delegation kit where the host CLI's native model remains the planner/orchestrator and Kimi Code acts as the implementation worker.

This must work across every currently supported host:

- Claude Code
- Codex CLI
- Antigravity CLI

## Background

The current project already has the right high-level split:

- `core/src/` owns host-agnostic runtime behavior.
- `adapters/<host>/` owns thin host-specific commands, skills, agents, rules, and workflows.
- `adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs` is the shared CLI dispatcher used by all adapters.

Today, review uses Kimi through a structured prompt, while generic task delegation uses the `task` subcommand. That is enough for textual review/rescue work, but too loose for a reliable "Kimi as programmer" workflow. Implementation delegation needs a stronger contract: explicit plan input, workspace selection, permission handling, job lifecycle, test/report expectations, and consistent adapter behavior.

## External Patterns

The design follows patterns observed in current coding agents:

- OpenCode separates restricted planning from full-access building through primary agents and per-agent permissions.
- Claude Code supports subagents with separate context, model, tools, and permission behavior.
- Codex supports skills and subagent workflows to keep the main agent focused while delegated agents do noisy exploration or implementation.
- Crush emphasizes model/provider flexibility while preserving session and workspace state.
- Kimi Code exposes `kimi-for-coding` as the stable coding model ID, supports OpenAI-compatible and Anthropic-compatible API use, and exposes Wire mode for embedding agent behavior programmatically.

Sources:

- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/config/
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/model-config
- https://developers.openai.com/codex/codex-manual.md
- https://www.kimi.com/code/docs/en/
- https://moonshotai.github.io/kimi-cli/en/customization/wire-mode.html
- https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html
- https://github.com/charmbracelet/crush

## Requirements

1. The host CLI model does planning and final judgment.
2. Kimi Code performs implementation work from a self-contained plan.
3. The feature is implemented once in shared runtime/companion code and exposed by all adapters.
4. Existing `review`, `adversarial-review`, `task`, `status`, `result`, and `cancel` behavior remains compatible.
5. Users can still run with the existing `kimi --wire` path.
6. Users can opt into `kimi-agent` or a specific Kimi command/args without code changes.
7. Job records must preserve enough information for status/result/cancel to remain useful.
8. The implementation flow must report changed files, verification attempted, failures, and remaining follow-up.

## Non-Goals

- Do not replace the host CLI's primary model with Kimi globally.
- Do not make Claude Code-only subagents the core implementation.
- Do not remove review workflows.
- Do not implement host-specific business logic in adapters.
- Do not spoof tool identity or User-Agent values for Kimi Code API access.

## Proposed User Flow

1. User asks the host CLI to implement a feature.
2. Host native model explores the repository and writes a concrete implementation plan.
3. Host invokes the Kimi implementation adapter with that plan.
4. The adapter calls the shared companion command.
5. Companion starts a Kimi-backed job in the current repository.
6. Kimi executes the plan, edits files, runs relevant verification, and returns a concise implementation report.
7. Host native model reviews Kimi's changes, decides whether to ask Kimi for another pass, make small corrections itself, or stop and report to the user.

## New Companion Command

Add a new subcommand:

```bash
node kimi-companion.mjs code "<self-contained implementation plan>"
```

Alias:

```bash
node kimi-companion.mjs implement "<self-contained implementation plan>"
```

The command creates a job with:

- `kind: "code"`
- `status: "running" | "finished" | "failed" | "cancelled"`
- `prompt`
- `worktreeRoot`
- `executor`
- `model`
- `permissionMode`
- `startedAt`
- `finishedAt`
- `output.raw`
- `output.summary`
- `output.changedFiles`
- `output.verification`
- `output.followUp`

The existing `task` command remains a generic delegation path. The new `code` command is specifically for implementation from a host-authored plan.

## Executor Selection

Use environment-driven executor selection:

- `KIMI_COMMAND`: executable, default `kimi`
- `KIMI_ARGS`: comma-separated args, default `--wire`
- `KIMI_MODEL`: default empty; when using Kimi Code, recommended `kimi-for-coding`
- `KIMI_WORK_DIR`: default current working directory
- `KIMI_PERMISSION_MODE`: `default | auto | yolo`, default `default`
- `KIMI_EXECUTOR`: optional label for status output, such as `kimi-wire` or `kimi-agent`

Recommended Kimi Code executor:

```bash
KIMI_COMMAND=kimi-agent
KIMI_ARGS=--work-dir,/path/to/repo,--model,kimi-for-coding
```

Fallback remains:

```bash
KIMI_COMMAND=kimi
KIMI_ARGS=--wire
```

The installer should not force a Kimi Code subscription or API key setup. It should document the env vars and let users choose the executor.

## Core Runtime Changes

### `WireClient`

Extend `WireClient` without breaking current callers:

- accept `cwd` or `workDir` and pass it to the spawned process when supported by the executor path;
- accept configurable `initialize` capabilities;
- accept optional `external_tools`;
- expose a controlled request handler hook instead of only auto-responding;
- keep safe defaults for unsupported request types;
- normalize Kimi request/response envelopes into stable internal shapes.

The current auto-responder is acceptable for reviews but too weak for code execution because it approves everything and returns an error for external tools. The new code executor should make approval behavior explicit and visible.

### Request Handling

Handle these Wire request types deliberately:

- `ApprovalRequest`: respect `KIMI_PERMISSION_MODE`; record approval events; default to approve only when the configured mode permits it.
- `QuestionRequest`: if unsupported in the host adapter path, answer with a structured "cannot ask user during background execution" response and instruct Kimi to proceed conservatively.
- `ToolCallRequest`: support registered external tools only; otherwise return a standards-shaped tool error.
- `HookRequest`: allow by default unless a future policy blocks it.

## Prompt Contract

The host must send Kimi a self-contained implementation brief containing:

- repository root and relevant constraints;
- exact task;
- implementation plan;
- files likely to touch;
- tests or verification commands to run;
- output format expected from Kimi;
- instruction not to broaden scope;
- instruction to report blockers instead of guessing.

The companion should wrap the host plan with a stable executor prompt that asks Kimi to return:

```json
{
  "summary": "short implementation summary",
  "changed_files": ["path"],
  "verification": [
    {"command": "npm test", "status": "passed|failed|not_run", "notes": "..."}
  ],
  "follow_up": ["remaining item"]
}
```

If Kimi returns plain text, the companion should preserve `output.raw` and best-effort extract summary fields.

## Adapter Design

### Claude Code

Add:

- command: `/kimi:code`
- optional alias command: `/kimi:implement`
- plugin agent: `kimi-code`
- skill/instructions that tell Claude to plan first, then delegate implementation to Kimi, then review the diff.

The plugin agent should not be the source of core behavior. It should only formulate the self-contained prompt and invoke the shared companion.

### Codex CLI

Add:

- skill: `kimi-code`
- optional agent role update or new `kimi-programmer` agent TOML

Codex instructions should say:

- use Codex native reasoning for planning;
- call Kimi only after a concrete plan exists;
- keep Kimi prompts self-contained;
- inspect the resulting diff and verification output before final response.

### Antigravity CLI

Add:

- workflow: `kimi-code`
- rule updates explaining planner/executor split.

The workflow mirrors the same contract:

1. capture host-authored plan;
2. invoke `kimi-companion.mjs code`;
3. report job ID/status/result;
4. host reviews Kimi output before user-facing completion.

## Status and Results

`status` should display `kind: code` jobs alongside existing jobs.

`result` should render implementation reports with:

- job metadata;
- status;
- summary;
- changed files;
- verification;
- follow-up;
- raw output fallback.

Existing render functions can be extended or a new `renderCodeResult` can be added if that keeps `render.mjs` clearer.

## Testing Strategy

Unit tests:

- `WireClient` request handling with approval modes.
- `JobControl` preserves new `code` fields.
- render output for code jobs.
- prompt wrapper builds a stable implementation contract.

Integration tests:

- `kimi-companion.mjs code` with `fake-kimi`.
- plain-text Kimi output fallback.
- structured JSON Kimi output parsing.
- failed executor behavior.

Adapter tests:

- Claude plugin contains command/agent files.
- Codex contains skill and agent metadata.
- Antigravity contains workflow/rule updates.
- installer copies all new adapter artifacts.

E2E:

- fake Kimi scenario that simulates file changes and verification report.
- real Kimi test remains optional and manually gated.

## Rollout Plan

1. Add core command and tests behind existing companion entry point.
2. Add render/status support for `code` jobs.
3. Add all adapter surfaces.
4. Update README and architecture docs.
5. Keep `task` behavior unchanged for backwards compatibility.
6. Add docs explaining `kimi-agent` and `kimi-for-coding` configuration.

## Risks

- Kimi Code approvals may not map perfectly across `kimi --wire` and `kimi-agent`.
- Background jobs cannot easily ask the user follow-up questions.
- Some hosts can expose richer native agents than others.
- Real Kimi behavior may differ from `fake-kimi` in tool-call details.

Mitigations:

- keep runtime behavior host-agnostic;
- make permission mode explicit;
- store raw output;
- use fake tests for protocol coverage and optional real tests for compatibility;
- document executor setup instead of forcing one provider path.

## Acceptance Criteria

- A user can ask any supported host to plan implementation and delegate coding to Kimi.
- All three adapters expose the new coding path.
- `node kimi-companion.mjs code "<plan>"` works with `fake-kimi`.
- Existing review and task commands still pass current tests.
- Status/result/cancel continue to work for old and new job kinds.
- Documentation explains how to use Kimi Code via `kimi-agent` or the existing `kimi --wire` fallback.

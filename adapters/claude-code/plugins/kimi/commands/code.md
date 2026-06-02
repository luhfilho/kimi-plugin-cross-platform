---
name: code
command: /kimi:code
description: Plan with Claude Code and delegate implementation to Kimi Code
---

Use this command when the user wants Kimi to act as the implementation worker.

Workflow:

1. Use Claude Code's native model to understand the request and inspect the repository.
2. Write a concrete implementation plan with files, changes, and verification commands.
3. Invoke `node "$HOME/.claude/skills/kimi/scripts/kimi-companion.mjs" code "<self-contained implementation plan>"`.
4. Inspect the resulting diff and Kimi report before telling the user the work is complete.

Do not send vague requests to Kimi. The plan must be self-contained.

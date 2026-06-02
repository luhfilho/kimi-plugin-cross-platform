---
name: implement
command: /kimi:implement
description: Alias for /kimi:code
---

Use this command as an alias for `/kimi:code`.

Workflow:

1. Plan with Claude Code's native model.
2. Invoke `node "$HOME/.claude/skills/kimi/scripts/kimi-companion.mjs" implement "<self-contained implementation plan>"`.
3. Review the diff and verification output before final response.

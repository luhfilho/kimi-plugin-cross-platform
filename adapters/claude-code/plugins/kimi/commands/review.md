---
name: review
command: /kimi:review
description: Run a read-only code review with Kimi CLI
---

Run a code review using Kimi CLI. By default reviews uncommitted changes.

**Flags:**
- `--background` — run in background and print job ID
- `--base <branch>` — review changes against a base branch
- `--scope <glob>` — limit review to files matching glob

**Example:**
```
/kimi:review --base main
```

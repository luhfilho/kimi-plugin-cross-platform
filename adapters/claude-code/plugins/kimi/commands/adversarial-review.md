---
name: adversarial-review
command: /kimi:adversarial-review
description: Run an adversarial code review with Kimi CLI
---

Run an adversarial code review using Kimi CLI. The review will challenge assumptions, look for edge cases, and question design decisions.

**Flags:**
- `--background` — run in background and print job ID
- `--base <branch>` — review changes against a base branch

**Example:**
```
/kimi:adversarial-review --base main
```

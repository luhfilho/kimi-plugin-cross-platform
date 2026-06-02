---
name: kimi-review
trigger: /kimi-review
---

# Kimi Review Workflow

Run a read-only code review with Kimi CLI.

## Steps

1. Collect git diff context.
2. Invoke `node "$HOME/.kimi-plugin/kimi-companion.mjs" review`.
3. Present findings to the user.

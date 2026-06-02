---
name: kimi-rescue
trigger: /kimi-rescue
---

# Kimi Rescue Workflow

Delegate a task to Kimi CLI.

## Steps

1. Capture the user's task description.
2. Invoke `node "$HOME/.kimi-plugin/kimi-companion.mjs" task "<description>"`.
3. Report job ID and status.

---
name: kimi-cancel
trigger: /kimi-cancel
---

# Kimi Cancel Workflow

Cancel a running Kimi job.

## Steps

1. Prompt the user for the job ID if not provided.
2. Invoke `node "$HOME/.kimi-plugin/kimi-companion.mjs" cancel --id <job-id>`.
3. Confirm cancellation to the user.

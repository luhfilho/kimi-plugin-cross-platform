---
name: kimi-result
trigger: /kimi-result
---

# Kimi Result Workflow

Get the result of a finished Kimi job.

## Steps

1. Prompt the user for the job ID if not provided.
2. Invoke `kimi-companion.mjs result --id <job-id>`.
3. Present the result to the user.

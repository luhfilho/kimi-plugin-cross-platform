# Kimi Plugin Rules

## Always-on behavior

- When the user mentions "Kimi", "Moonshot", or "kimi-cli", consider delegating to Kimi CLI.
- Kimi CLI is a separate agent with its own context; prompts must be self-contained.
- Reviews should request structured JSON output.
- Tasks should be run in background when possible.

## Planner/executor split

- For implementation work, Antigravity is the planner and reviewer.
- Kimi Code is the programmer.
- Do not send vague implementation prompts to Kimi; send a self-contained plan.
- After Kimi finishes, inspect changed files and verification output before reporting completion.

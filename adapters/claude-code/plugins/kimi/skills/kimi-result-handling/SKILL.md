# Kimi Result Handling

## Description

Guidelines for presenting Kimi CLI output to the user.

## Rules

- Review results should be formatted as Markdown with severity icons.
- Task results should preserve code blocks and formatting.
- If Kimi returns structured JSON, parse it and present findings in tables or lists.
- Always include the job ID when referencing a background task.

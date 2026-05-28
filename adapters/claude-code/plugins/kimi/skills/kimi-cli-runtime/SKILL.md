# Kimi CLI Runtime

## Description

Internal skill for forwarding commands to the Kimi CLI companion script.

## Rules

- When the user invokes a `/kimi:*` command, run the companion script via Bash.
- Pass all flags and arguments through verbatim.
- Capture stdout and present it to the user as Markdown.
- If the companion exits with non-zero, surface the error clearly.

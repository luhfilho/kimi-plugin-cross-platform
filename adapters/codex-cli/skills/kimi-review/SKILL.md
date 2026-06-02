---
name: kimi-review
description: Run Kimi CLI code reviews from Codex and handle structured review output.
---

# Kimi Review

## Description

Run a code review using Kimi CLI (Moonshot AI).

## Usage

When the user asks for a Kimi review or you detect review intent, run:

```bash
kimi --wire < <(echo '{"jsonrpc":"2.0","id":"1","method":"prompt","params":{"user_input":"Please review the following code changes..."}}')
```

Or use the companion script if installed:

```bash
node "$HOME/.kimi-plugin/kimi-companion.mjs" review
```

## Rules

- Collect git diff context before prompting Kimi.
- Request structured JSON output with findings.
- Present results in Markdown with severity icons.

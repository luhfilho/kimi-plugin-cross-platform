# Kimi Prompting

## Description

Guidelines for composing effective prompts for Kimi CLI.

## Rules

- Be specific and self-contained. Kimi CLI does not share the Claude Code session context.
- Include relevant file paths, code snippets, and diff context when applicable.
- For reviews, request structured JSON output with severity, file, line, message, and recommendation.
- For tasks, break complex requests into sequential steps when possible.

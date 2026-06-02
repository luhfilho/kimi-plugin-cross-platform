---
name: kimi-code
description: Plan with Codex, then delegate implementation to Kimi Code as the programmer.
---

# Kimi Code

Use this when the user wants Kimi to implement code from Codex.

## Required Workflow

1. Plan first with Codex's native model.
2. Inspect the repository enough to make the plan concrete.
3. Write a self-contained implementation plan with:
   - exact task;
   - relevant constraints;
   - files likely to change;
   - verification commands;
   - expected final report.
4. Run:

```bash
node path/to/kimi-companion.mjs code "<self-contained implementation plan>"
```

5. Inspect Kimi's output and resulting diff.
6. Report completion only after Codex has reviewed the result.

Kimi is the programmer. Codex remains the planner and reviewer.

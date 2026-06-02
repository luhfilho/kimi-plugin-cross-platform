export const VALID_VERIFICATION_STATUSES = ["passed", "failed", "not_run"];

const VALID_VERIFICATION_STATUS_SET = new Set(VALID_VERIFICATION_STATUSES);

export function buildCodePrompt({ plan, worktreeRoot }) {
  const outputContract = {
    summary: "Brief summary of the implementation result.",
    changed_files: ["relative/path.ext"],
    verification: [
      {
        command: "command that was run",
        status: "passed | failed | not_run",
        notes: "short result or reason",
      },
    ],
    follow_up: ["optional follow-up work"],
  };

  return [
    "You are Kimi Code acting as the implementation worker.",
    "",
    "Work only inside this worktree:",
    String(worktreeRoot ?? ""),
    "",
    "Host-authored implementation plan:",
    String(plan ?? ""),
    "",
    "Implementation constraints:",
    "- Follow the plan exactly unless it is impossible.",
    "- Keep changes scoped to the requested files and behavior.",
    "- Run the requested verification commands when possible.",
    "- Report any skipped verification with status not_run.",
    "- Report blockers instead of guessing.",
    "",
    "Return your final answer as JSON matching this contract:",
    JSON.stringify(outputContract, null, 2),
  ].join("\n");
}

export function parseCodeResult(rawOutput) {
  const text = String(rawOutput ?? "");
  const parsed = parseStructuredOutput(text);

  if (parsed) {
    return normalizeCodeResult(parsed);
  }

  return {
    summary: text,
    changedFiles: [],
    verification: [],
    followUp: [],
    raw: text,
  };
}

function parseStructuredOutput(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const direct = tryParseJsonObject(trimmed);
  if (direct) {
    return direct;
  }

  for (const fenced of extractFencedBlocks(trimmed)) {
    const parsed = tryParseJsonObject(fenced.trim());
    if (parsed) {
      return parsed;
    }
  }

  return parseFirstObjectSubstring(trimmed);
}

function tryParseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractFencedBlocks(text) {
  const blocks = [];
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;

  while ((match = fencePattern.exec(text)) !== null) {
    blocks.push(match[1] ?? "");
  }

  return blocks;
}

function parseFirstObjectSubstring(text) {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") {
      continue;
    }

    const end = findBalancedObjectEnd(text, start);
    if (end === -1) {
      continue;
    }

    const parsed = tryParseJsonObject(text.slice(start, end + 1));
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function findBalancedObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function normalizeCodeResult(value) {
  return {
    summary: typeof value.summary === "string" ? value.summary : "",
    changedFiles: normalizeStringArray(value.changed_files ?? value.changedFiles),
    verification: normalizeVerification(value.verification),
    followUp: normalizeStringArray(value.follow_up ?? value.followUp),
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string");
}

function normalizeVerification(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { command: "", status: "not_run", notes: "" };
    }

    const status = VALID_VERIFICATION_STATUS_SET.has(entry.status) ? entry.status : "not_run";

    return {
      command: typeof entry.command === "string" ? entry.command : "",
      status,
      notes: typeof entry.notes === "string" ? entry.notes : "",
    };
  });
}

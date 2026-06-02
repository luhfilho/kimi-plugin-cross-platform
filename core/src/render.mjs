/**
 * Markdown formatters for Kimi plugin output.
 */

export function renderSetupReport({ kimiAvailable, kimiVersion, authenticated, serverInfo }) {
  const lines = ["## Kimi Plugin Setup"];
  lines.push("");
  lines.push(`- **Kimi CLI**: ${kimiAvailable ? `✅ ${kimiVersion}` : "❌ Not found"}`);
  lines.push(`- **Authentication**: ${authenticated ? "✅ OK" : "❌ Required (run \`kimi login\`)"}`);
  if (serverInfo) {
    lines.push(`- **Server**: ${serverInfo.server?.name} ${serverInfo.server?.version}`);
    lines.push(`- **Protocol**: ${serverInfo.protocol_version}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderReviewResult({ findings, clean, raw }) {
  if (clean) {
    return "## ✅ Review Complete\n\nNo issues found.";
  }

  if (raw) {
    return `## Review Result\n\n${raw}`;
  }

  if (!findings || findings.length === 0) {
    return "## ✅ Review Complete\n\nNo issues found.";
  }

  const lines = ["## Review Findings", ""];
  for (const f of findings) {
    const icon = f.severity === "error" ? "❌" : f.severity === "warning" ? "⚠️" : "ℹ️";
    lines.push(`${icon} **${f.severity.toUpperCase()}** — \`${f.file}:${f.line}\``);
    lines.push(`> ${f.message}`);
    if (f.recommendation) {
      lines.push(`\n💡 ${f.recommendation}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderTaskResult({ status, output, error }) {
  if (error) {
    return `## ❌ Task Failed\n\n\`\`\`\n${error}\n\`\`\``;
  }
  const lines = [`## Task Result (${status})`, ""];
  if (output) {
    lines.push("```");
    lines.push(output);
    lines.push("```");
  }
  return lines.join("\n");
}

export function renderCodeResult({ status, summary, changedFiles = [], verification = [], followUp = [], raw, error }) {
  if (error) {
    return `## Code Result (failed)\n\n\`\`\`\n${error}\n\`\`\``;
  }

  const lines = [`## Code Result (${status})`, ""];
  if (summary) {
    lines.push(summary, "");
  }

  if (changedFiles.length > 0) {
    lines.push("### Changed Files");
    for (const file of changedFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  if (verification.length > 0) {
    lines.push("### Verification");
    lines.push("| Command | Status | Notes |");
    lines.push("|---|---|---|");
    for (const item of verification) {
      lines.push(`| \`${item.command || ""}\` | ${item.status || "not_run"} | ${item.notes || ""} |`);
    }
    lines.push("");
  }

  if (followUp.length > 0) {
    lines.push("### Follow Up");
    for (const item of followUp) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (raw) {
    lines.push("### Raw Output", "", "```", raw, "```");
  }

  return lines.join("\n");
}

export function renderStatusSnapshot({ running, latestFinished, recent, total }) {
  const lines = ["## Kimi Plugin Status", ""];
  lines.push(`**Total jobs**: ${total}`);
  lines.push("");

  if (running.length > 0) {
    lines.push("### Running");
    lines.push("| ID | Kind | Phase | Elapsed |");
    lines.push("|---|---|---|---|");
    for (const j of running) {
      const elapsed = j.startedAt ? formatElapsed(Date.now() - j.startedAt) : "—";
      lines.push(`| \`${j.id.slice(0, 8)}\` | ${j.kind} | ${j.phase || "—"} | ${elapsed} |`);
    }
    lines.push("");
  }

  if (latestFinished) {
    lines.push("### Latest Finished");
    lines.push(`- **ID**: \`${latestFinished.id.slice(0, 8)}\``);
    lines.push(`- **Kind**: ${latestFinished.kind}`);
    lines.push(`- **Status**: ${latestFinished.status}`);
    lines.push("");
  }

  if (recent.length > 0) {
    lines.push("### Recent Jobs");
    lines.push("| ID | Kind | Status | Created |");
    lines.push("|---|---|---|---|");
    for (const j of recent) {
      lines.push(`| \`${j.id.slice(0, 8)}\` | ${j.kind} | ${j.status} | ${formatDate(j.createdAt)} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatElapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

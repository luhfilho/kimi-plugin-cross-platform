import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import {
  renderSetupReport,
  renderReviewResult,
  renderTaskResult,
  renderStatusSnapshot,
  renderCodeResult,
} from "../../core/src/render.mjs";

describe("render", () => {
  it("renders setup report when available", () => {
    const md = renderSetupReport({
      kimiAvailable: true,
      kimiVersion: "1.45.0",
      authenticated: true,
      serverInfo: {
        protocol_version: "1.10",
        server: { name: "kimi", version: "1.45.0" },
      },
    });
    assert.ok(md.includes("Kimi CLI"));
    assert.ok(md.includes("1.45.0"));
    assert.ok(md.includes("✅"));
  });

  it("renders setup report when missing", () => {
    const md = renderSetupReport({
      kimiAvailable: false,
      authenticated: false,
    });
    assert.ok(md.includes("Not found"));
    assert.ok(md.includes("❌"));
  });

  it("renders clean review", () => {
    const md = renderReviewResult({ clean: true });
    assert.ok(md.includes("No issues found"));
  });

  it("renders review findings", () => {
    const md = renderReviewResult({
      findings: [
        { severity: "error", file: "a.mjs", line: 1, message: "Bad", recommendation: "Fix it" },
        { severity: "warning", file: "b.mjs", line: 2, message: "Meh" },
      ],
    });
    assert.ok(md.includes("❌"));
    assert.ok(md.includes("⚠️"));
    assert.ok(md.includes("a.mjs:1"));
    assert.ok(md.includes("Fix it"));
  });

  it("renders task result", () => {
    const md = renderTaskResult({ status: "finished", output: "Done" });
    assert.ok(md.includes("finished"));
    assert.ok(md.includes("Done"));
  });

  it("renders task error", () => {
    const md = renderTaskResult({ status: "failed", error: "Oops" });
    assert.ok(md.includes("❌"));
    assert.ok(md.includes("Oops"));
  });

  test("renderCodeResult renders structured implementation output", () => {
    const md = renderCodeResult({
      status: "finished",
      summary: "Added code command.",
      changedFiles: ["adapters/claude-code/plugins/kimi/scripts/kimi-companion.mjs"],
      verification: [
        { command: "node --test tests/integration/companion.test.mjs", status: "passed", notes: "ok" },
      ],
      followUp: ["Run npm test"],
    });

    assert.match(md, /## Code Result \(finished\)/);
    assert.match(md, /Added code command/);
    assert.match(md, /Changed Files/);
    assert.match(md, /kimi-companion\.mjs/);
    assert.match(md, /node --test tests\/integration\/companion\.test\.mjs/);
    assert.match(md, /Run npm test/);
  });

  test("renderCodeResult renders raw output fallback", () => {
    const md = renderCodeResult({
      status: "finished",
      summary: "Plain result",
      changedFiles: [],
      verification: [],
      followUp: [],
      raw: "Plain result",
    });

    assert.match(md, /Plain result/);
    assert.match(md, /Raw Output/);
  });

  test("renderCodeResult escapes verification table cells", () => {
    const md = renderCodeResult({
      status: "finished",
      verification: [
        {
          command: "node -e `console.log('a|b')`",
          status: "passed|ok",
          notes: "line one\nline|two\tok",
        },
      ],
    });

    assert.ok(md.includes("| node -e \\`console.log('a\\|b')\\` | passed\\|ok | line one line\\|two ok |"));
  });

  it("renders status snapshot", () => {
    const md = renderStatusSnapshot({
      running: [{ id: "abc-123", kind: "review", phase: "thinking", startedAt: Date.now() - 5000 }],
      latestFinished: { id: "def-456", kind: "task", status: "finished" },
      recent: [
        { id: "def-456", kind: "task", status: "finished", createdAt: Date.now() },
      ],
      total: 2,
    });
    assert.ok(md.includes("Total jobs"));
    assert.ok(md.includes("Running"));
    assert.ok(md.includes("def-456"));
  });
});

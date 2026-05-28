import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderSetupReport,
  renderReviewResult,
  renderTaskResult,
  renderStatusSnapshot,
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

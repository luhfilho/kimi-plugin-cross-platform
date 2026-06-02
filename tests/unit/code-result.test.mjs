import test from "node:test";
import assert from "node:assert/strict";
import { buildCodePrompt, parseCodeResult } from "../../core/src/code-result.mjs";

test("buildCodePrompt wraps a host-authored plan with implementation constraints", () => {
  const prompt = buildCodePrompt({
    plan: "Change render.mjs and run node --test tests/unit/render.test.mjs",
    worktreeRoot: "/repo",
  });

  assert.match(prompt, /You are Kimi Code acting as the implementation worker/);
  assert.match(prompt, /Host-authored implementation plan/);
  assert.match(prompt, /Change render\.mjs/);
  assert.match(prompt, /\/repo/);
  assert.match(prompt, /Return your final answer as JSON/);
  assert.match(prompt, /changed_files/);
  assert.match(prompt, /verification/);
  assert.match(prompt, /Report blockers instead of guessing/);
});

test("parseCodeResult accepts structured JSON output", () => {
  const parsed = parseCodeResult(JSON.stringify({
    summary: "Added code result renderer.",
    changed_files: ["core/src/render.mjs"],
    verification: [
      { command: "node --test tests/unit/render.test.mjs", status: "passed", notes: "all good" },
    ],
    follow_up: ["Run full suite"],
  }));

  assert.equal(parsed.summary, "Added code result renderer.");
  assert.deepEqual(parsed.changedFiles, ["core/src/render.mjs"]);
  assert.deepEqual(parsed.verification, [
    { command: "node --test tests/unit/render.test.mjs", status: "passed", notes: "all good" },
  ]);
  assert.deepEqual(parsed.followUp, ["Run full suite"]);
  assert.equal(parsed.raw, undefined);
});

test("parseCodeResult extracts JSON from fenced output", () => {
  const parsed = parseCodeResult([
    "Here is the report:",
    "```json",
    "{\"summary\":\"Done\",\"changed_files\":[\"README.md\"],\"verification\":[],\"follow_up\":[]}",
    "```",
  ].join("\n"));

  assert.equal(parsed.summary, "Done");
  assert.deepEqual(parsed.changedFiles, ["README.md"]);
  assert.deepEqual(parsed.verification, []);
  assert.deepEqual(parsed.followUp, []);
});

test("parseCodeResult prefers result JSON over earlier unrelated objects", () => {
  const parsed = parseCodeResult([
    "Metadata:",
    "{\"example\":{\"kind\":\"metadata\"}}",
    "Final report:",
    "{\"summary\":\"Done\",\"changed_files\":[\"core/src/code-result.mjs\"],\"verification\":[],\"follow_up\":[]}",
  ].join("\n"));

  assert.equal(parsed.summary, "Done");
  assert.deepEqual(parsed.changedFiles, ["core/src/code-result.mjs"]);
  assert.deepEqual(parsed.verification, []);
  assert.deepEqual(parsed.followUp, []);
});

test("parseCodeResult preserves unrelated JSON as raw fallback", () => {
  for (const raw of ["{\"exitCode\":0}", "noise {\"exitCode\":0}"]) {
    const parsed = parseCodeResult(raw);

    assert.equal(parsed.summary, raw);
    assert.deepEqual(parsed.changedFiles, []);
    assert.deepEqual(parsed.verification, []);
    assert.deepEqual(parsed.followUp, []);
    assert.equal(parsed.raw, raw);
  }
});

test("parseCodeResult preserves plain text as raw fallback", () => {
  const parsed = parseCodeResult("Implemented the change and tests passed.");

  assert.equal(parsed.summary, "Implemented the change and tests passed.");
  assert.deepEqual(parsed.changedFiles, []);
  assert.deepEqual(parsed.verification, []);
  assert.deepEqual(parsed.followUp, []);
  assert.equal(parsed.raw, "Implemented the change and tests passed.");
});

test("parseCodeResult normalizes invalid verification statuses", () => {
  const parsed = parseCodeResult(JSON.stringify({
    summary: "Done",
    changed_files: ["a.js"],
    verification: [{ command: "npm test", status: "green", notes: "ok" }],
    follow_up: [],
  }));

  assert.deepEqual(parsed.verification, [
    { command: "npm test", status: "not_run", notes: "ok" },
  ]);
});

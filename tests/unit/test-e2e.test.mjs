import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyExit } from "../../scripts/test-e2e.mjs";

test("classifyExit approves a command that exits with the expected status", () => {
  assert.equal(classifyExit({ status: 0, signal: null }, 0).success, true);
});

test("classifyExit allows a non-zero expected status (cancel of a missing job)", () => {
  // `cancel --id=nonexistent` legitimately exits 1 ("Job not found").
  assert.equal(classifyExit({ status: 1, signal: null }, 1).success, true);
});

test("classifyExit fails when the actual status differs from the expected one", () => {
  // exit 1 is the companion's generic error code. A command expected to
  // succeed (exit 0) that instead exits 1 is a real regression, not a pass.
  assert.equal(classifyExit({ status: 1, signal: null }, 0).success, false);
});

test("classifyExit fails when the process is killed by a signal", () => {
  assert.equal(classifyExit({ status: null, signal: "SIGTERM" }, 0).success, false);
});

test("classifyExit fails when the process cannot be spawned", () => {
  assert.equal(
    classifyExit({ status: null, signal: null, error: new Error("spawn ENOENT") }, 0).success,
    false,
  );
});

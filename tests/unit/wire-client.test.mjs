import { describe, it, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { WireClient } from "../../core/src/wire-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FAKE_KIMI = join(__dirname, "../fixtures/fake-kimi.mjs");

function makeClient(behavior = "task-complete", opts = {}) {
  const env = { ...process.env, FAKE_KIMI_BEHAVIOR: behavior };
  if (opts.delayMs) env.FAKE_KIMI_DELAY_MS = String(opts.delayMs);
  return new WireClient({
    command: "node",
    args: [FAKE_KIMI],
    env,
    ...opts,
  });
}

describe("WireClient", () => {
  /** @type {WireClient | null} */
  let client = null;

  afterEach(async () => {
    if (client) {
      await client.dispose();
      client = null;
    }
  });

  describe("connection lifecycle", () => {
    it("should connect and initialize successfully", async () => {
      client = makeClient();
      const info = await client.connect();
      assert.equal(info.protocol_version, "1.10");
      assert.equal(info.server.name, "fake-kimi");
    });

    it("should throw on double connect", async () => {
      client = makeClient();
      await client.connect();
      await assert.rejects(() => client.connect(), /already connected/);
    });

    it("should disconnect gracefully", async () => {
      client = makeClient();
      await client.connect();
      await client.dispose();
      assert.equal(client.connected, false);
      client = null;
    });
  });

  describe("prompt", () => {
    it("should start a turn and receive events", async () => {
      client = makeClient("task-complete", { delayMs: 5 });
      await client.connect();
      const events = [];
      client.on("event", (evt) => events.push(evt.detail));
      const result = await client.prompt("Hello");
      assert.equal(result.status, "finished");
      assert.ok(events.some((e) => e.type === "TurnBegin"));
      assert.ok(events.some((e) => e.type === "TurnEnd"));
    });

    it("should collect content parts", async () => {
      client = makeClient("review-ok", { delayMs: 5 });
      await client.connect();
      const texts = [];
      client.on("event", (evt) => {
        const e = evt.detail;
        if (e.type === "ContentPart" && e.payload.type === "text") {
          texts.push(e.payload.text);
        }
      });
      await client.prompt("Review this");
      assert.ok(texts.some((t) => t.includes("No issues found")));
    });

    it("should reject prompt when not initialized", async () => {
      client = makeClient();
      await assert.rejects(() => client.prompt("Hello"), /not connected/);
    });

    it("should reject second prompt while streaming", async () => {
      client = makeClient("task-complete", { delayMs: 5 });
      await client.connect();
      // Manually set streaming to simulate an in-progress turn
      client._streaming = true;
      await assert.rejects(() => client.prompt("Another"), /already in progress/);
      client._streaming = false;
    });
  });

  describe("cancel", () => {
    it("should cancel an in-progress turn", async () => {
      client = makeClient("cancel-mid", { delayMs: 50 });
      await client.connect();
      const p = client.prompt("Slow task");
      await new Promise((r) => setTimeout(r, 20));
      await client.cancel();
      const result = await p;
      assert.equal(result.status, "cancelled");
    });

    it("should reject cancel when not streaming", async () => {
      client = makeClient();
      await client.connect();
      await assert.rejects(() => client.cancel(), /No agent turn is in progress/);
    });
  });

  describe("steer", () => {
    it("should steer an in-progress turn", async () => {
      client = makeClient("cancel-mid", { delayMs: 50 });
      await client.connect();
      const p = client.prompt("Slow task");
      await new Promise((r) => setTimeout(r, 20));
      const result = await client.steer("Keep going");
      assert.equal(result.status, "steered");
      await client.cancel();
      await p;
    });

    it("should reject steer when not streaming", async () => {
      client = makeClient();
      await client.connect();
      await assert.rejects(() => client.steer("Hello"), /No agent turn is in progress/);
    });
  });

  describe("error handling", () => {
    it("should handle auth-expired error", async () => {
      client = makeClient("auth-required");
      await client.connect();
      await assert.rejects(
        () => client.prompt("Hello"),
        /Authentication failed/
      );
    });

    it("should emit error on process exit unexpectedly", async () => {
      client = makeClient("network-error");
      // network-error behavior doesn't exist in fake-kimi, so process exits immediately
      // Actually fake-kimi doesn't have network-error, let's simulate by using a bad command
      client = new WireClient({ command: "node", args: ["-e", "process.exit(1)"] });
      await assert.rejects(() => client.connect(), /exited/);
    });
  });

  describe("event emission", () => {
    it("should emit structured events", async () => {
      client = makeClient("review-findings", { delayMs: 5 });
      await client.connect();
      const events = [];
      client.on("event", (evt) => events.push(evt.detail));
      await client.prompt("Review");
      const turnBegin = events.find((e) => e.type === "TurnBegin");
      assert.ok(turnBegin);
      assert.equal(turnBegin.payload.user_input, "Review");
    });
  });
});

after(() => {
  // Force exit so lingering child-process pipes don't keep the test runner alive.
  process.exit(0);
});

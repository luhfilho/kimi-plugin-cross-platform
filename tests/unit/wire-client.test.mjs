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
  const { delayMs, env: envOverrides, ...clientOpts } = opts;
  const env = { ...process.env, FAKE_KIMI_BEHAVIOR: behavior, ...envOverrides };
  if (delayMs) env.FAKE_KIMI_DELAY_MS = String(delayMs);
  return new WireClient({
    command: "node",
    args: [FAKE_KIMI],
    env,
    ...clientOpts,
  });
}

function findJsonContent(events, key) {
  for (const event of events) {
    if (event.type !== "ContentPart" || typeof event.payload?.text !== "string") {
      continue;
    }
    try {
      const parsed = JSON.parse(event.payload.text);
      if (parsed && Object.hasOwn(parsed, key)) {
        return parsed[key];
      }
    } catch {
      // Ignore non-JSON content parts.
    }
  }
  return null;
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

    it("WireClient passes cwd and custom initialize params", async () => {
      const testsDir = join(__dirname, "..");
      const capabilities = { supports_question: true, supports_plan_mode: false };
      const externalTools = [
        { name: "open_in_ide", description: "Open a file in the editor" },
      ];
      const initializeEvents = [];

      client = new WireClient({
        command: "node",
        args: ["fixtures/fake-kimi.mjs"],
        cwd: testsDir,
        env: {
          ...process.env,
          FAKE_KIMI_BEHAVIOR: "task-complete",
          FAKE_KIMI_ECHO_INITIALIZE: "1",
        },
        capabilities,
        externalTools,
        requestHandler: () => undefined,
      });
      client.on("event", (evt) => initializeEvents.push(evt.detail));

      await client.connect();

      assert.equal(client.cwd, testsDir);
      assert.equal(client.initializeParams.capabilities.supports_question, true);
      assert.equal(client.initializeParams.external_tools[0].name, "open_in_ide");

      const echoedInitialize = initializeEvents.find(
        (evt) => evt.type === "ContentPart" && evt.payload?.text?.includes("\"initialize\"")
      );
      assert.ok(echoedInitialize);
      const echoed = JSON.parse(echoedInitialize.payload.text);
      assert.equal(echoed.initialize.capabilities.supports_question, true);
      assert.equal(echoed.initialize.external_tools[0].name, "open_in_ide");
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

    it("WireClient custom request handler can reject approvals", async () => {
      const requests = [];
      const sentMessages = [];
      const events = [];
      client = makeClient("approval-required", {
        delayMs: 5,
        env: { FAKE_KIMI_ECHO_REQUEST_RESPONSES: "1" },
        requestHandler: async (envelope) => {
          requests.push(envelope);
          if (envelope.type === "ApprovalRequest") {
            return {
              request_id: envelope.payload.id,
              response: "reject",
              feedback: "Rejected by test handler",
            };
          }
          return undefined;
        },
      });
      client.on("event", (evt) => events.push(evt.detail));
      const sendRaw = client._sendRaw.bind(client);
      client._sendRaw = (msg) => {
        sentMessages.push(msg);
        sendRaw(msg);
      };

      await client.connect();
      const result = await client.prompt("Write a file");

      assert.equal(result.status, "finished");
      assert.equal(requests.length, 1);
      assert.equal(requests[0].type, "ApprovalRequest");
      assert.equal(requests[0].payload.id, "approval-1");
      assert.ok(
        sentMessages.some(
          (msg) => msg.result?.request_id === "approval-1" && msg.result?.response === "reject"
        )
      );
      const echoedResponse = findJsonContent(events, "wire_request_response");
      assert.equal(echoedResponse.result.request_id, "approval-1");
      assert.equal(echoedResponse.result.response, "reject");
    });

    it("WireClient request handler null falls back to auto approval", async () => {
      const requests = [];
      const sentMessages = [];
      const events = [];
      client = makeClient("approval-required", {
        delayMs: 5,
        env: { FAKE_KIMI_ECHO_REQUEST_RESPONSES: "1" },
        requestHandler: async (envelope) => {
          requests.push(envelope);
          return null;
        },
      });
      client.on("event", (evt) => events.push(evt.detail));
      const sendRaw = client._sendRaw.bind(client);
      client._sendRaw = (msg) => {
        sentMessages.push(msg);
        sendRaw(msg);
      };

      await client.connect();
      const result = await client.prompt("Write a file");

      assert.equal(result.status, "finished");
      assert.equal(requests.length, 1);
      assert.equal(requests[0].type, "ApprovalRequest");
      assert.ok(
        sentMessages.some(
          (msg) => msg.result?.request_id === "approval-1" && msg.result?.response === "approve"
        )
      );
      const echoedResponse = findJsonContent(events, "wire_request_response");
      assert.equal(echoedResponse.result.request_id, "approval-1");
      assert.equal(echoedResponse.result.response, "approve");
    });

    it("WireClient auto tool fallback returns Kimi tool result shape", async () => {
      const sentMessages = [];
      const events = [];
      client = makeClient("tool-call-required", {
        delayMs: 5,
        env: { FAKE_KIMI_ECHO_REQUEST_RESPONSES: "1" },
      });
      client.on("event", (evt) => events.push(evt.detail));
      const sendRaw = client._sendRaw.bind(client);
      client._sendRaw = (msg) => {
        sentMessages.push(msg);
        sendRaw(msg);
      };

      await client.connect();
      const result = await client.prompt("Read a file");

      assert.equal(result.status, "finished");
      assert.ok(
        sentMessages.some((msg) => {
          const returnValue = msg.result?.return_value;
          return (
            msg.result?.tool_call_id === "tool-call-1" &&
            returnValue?.is_error === true &&
            returnValue?.output === "" &&
            returnValue?.message === "Tool execution not implemented in WireClient auto-responder" &&
            Array.isArray(returnValue?.display) &&
            returnValue.display.length === 0
          );
        })
      );
      const echoedResponse = findJsonContent(events, "wire_request_response");
      assert.equal(echoedResponse.result.tool_call_id, "tool-call-1");
      assert.deepEqual(echoedResponse.result.return_value, {
        is_error: true,
        output: "",
        message: "Tool execution not implemented in WireClient auto-responder",
        display: [],
      });
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

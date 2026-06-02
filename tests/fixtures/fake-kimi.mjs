#!/usr/bin/env node
/**
 * Fake Kimi CLI Wire Protocol server for testing.
 * Simulates `kimi --wire` behavior without network or real Kimi CLI.
 *
 * Usage: FAKE_KIMI_BEHAVIOR=<behavior> node fake-kimi.mjs
 *
 * Behaviors:
 *   - "review-ok"        : Returns clean review (no findings)
 *   - "review-findings"  : Returns review with structured findings
 *   - "task-complete"    : Returns task output
 *   - "approval-required": Sends an approval request before task output
 *   - "auth-required"    : Returns AUTH_EXPIRED on prompt
 *   - "network-error"    : Exits immediately
 *   - "slow"             : Emits events slowly
 *   - "cancel-mid"       : Needs cancel to finish
 */

import { createInterface } from "node:readline";

const BEHAVIOR = process.env.FAKE_KIMI_BEHAVIOR || "task-complete";
const DELAY_MS = parseInt(process.env.FAKE_KIMI_DELAY_MS || "10", 10);

let initialized = false;
let streaming = false;
let cancelResolve = null;
let cancelledFlag = false;
let msgIdCounter = 0;
const pendingRequestResponses = new Map();

function makeId() {
  return `fake-${++msgIdCounter}`;
}

function send(obj) {
  const line = JSON.stringify(obj);
  process.stdout.write(line + "\n");
}

function sendEvent(eventType, payload) {
  send({
    jsonrpc: "2.0",
    method: "event",
    params: { type: eventType, payload },
  });
}

function sendRequest(requestType, payload) {
  const id = makeId();
  let resolveResponse;
  const response = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  pendingRequestResponses.set(id, { response, resolve: resolveResponse });
  send({
    jsonrpc: "2.0",
    method: "request",
    id,
    params: { type: requestType, payload },
  });
  return id;
}

function sendSuccess(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForRequestResponse(id) {
  const pending = pendingRequestResponses.get(id);
  if (!pending) return null;
  const timeoutMs = Math.max(DELAY_MS * 10, 50);
  return Promise.race([pending.response, delay(timeoutMs).then(() => null)]);
}

function acceptRequestResponse(msg) {
  if (msg.method !== undefined || msg.id == null || !pendingRequestResponses.has(msg.id)) {
    return false;
  }

  const pending = pendingRequestResponses.get(msg.id);
  pendingRequestResponses.delete(msg.id);
  const response = { id: msg.id };
  if (Object.hasOwn(msg, "result")) response.result = msg.result;
  if (Object.hasOwn(msg, "error")) response.error = msg.error;
  pending.resolve(response);
  return true;
}

async function handleInitialize(msg) {
  if (initialized) {
    sendError(msg.id, -32000, "Already initialized");
    return;
  }
  initialized = true;
  if (process.env.FAKE_KIMI_ECHO_INITIALIZE === "1") {
    sendEvent("ContentPart", { type: "text", text: JSON.stringify({ initialize: msg.params }) });
  }
  sendSuccess(msg.id, {
    protocol_version: "1.10",
    server: { name: "fake-kimi", version: "0.0.1" },
    slash_commands: [],
    capabilities: { supports_question: false, supports_plan_mode: false },
  });
}

async function handlePrompt(msg) {
  if (!initialized) {
    sendError(msg.id, -32000, "Not initialized");
    return;
  }
  if (streaming) {
    sendError(msg.id, -32000, "An agent turn is already in progress");
    return;
  }

  if (BEHAVIOR === "auth-required") {
    sendError(msg.id, -32004, "Authentication failed. Your login session may have expired.");
    return;
  }

  streaming = true;
  cancelResolve = null;
  cancelledFlag = false;
  const userInput = msg.params.user_input || "";

  sendEvent("TurnBegin", { user_input: userInput });
  await delay(DELAY_MS);

  if (BEHAVIOR === "approval-required") {
    const requestId = sendRequest("ApprovalRequest", {
      id: "approval-1",
      tool_call_id: "tc-1",
      sender: "Write",
      action: "write file",
      description: "Write file README.md",
      display: [],
    });
    const response = await waitForRequestResponse(requestId);
    if (process.env.FAKE_KIMI_ECHO_REQUEST_RESPONSES === "1") {
      sendEvent("ContentPart", { type: "text", text: JSON.stringify({ wire_request_response: response }) });
    }
    await delay(DELAY_MS);
    sendEvent("ContentPart", { type: "text", text: "Approval request handled." });
  } else if (BEHAVIOR === "review-ok") {
    sendEvent("ContentPart", { type: "text", text: "No issues found. Code looks clean!" });
  } else if (BEHAVIOR === "review-findings") {
    sendEvent("ContentPart", {
      type: "text",
      text: JSON.stringify({
        findings: [
          {
            severity: "error",
            file: "src/index.mjs",
            line: 42,
            message: "Missing null check",
            recommendation: "Add defensive check before dereferencing",
          },
          {
            severity: "warning",
            file: "src/util.mjs",
            line: 7,
            message: "Deprecated API usage",
            recommendation: "Migrate to new API",
          },
        ],
      }),
    });
  } else if (BEHAVIOR === "task-complete") {
    sendEvent("ContentPart", { type: "text", text: "Task completed successfully." });
  } else if (BEHAVIOR === "cancel-mid") {
    // Wait indefinitely until cancelled
    const cancelled = await new Promise((resolve) => {
      cancelResolve = resolve;
      if (cancelledFlag) resolve(true);
    });
    cancelResolve = null;
    if (!cancelled) {
      sendEvent("ContentPart", { type: "text", text: "Timed out waiting for cancel." });
    }
  }

  if (streaming) {
    await delay(DELAY_MS);
    sendEvent("TurnEnd", {});
    streaming = false;
    sendSuccess(msg.id, { status: "finished" });
  } else {
    // Was cancelled
    sendSuccess(msg.id, { status: "cancelled" });
  }
}

async function handleSteer(msg) {
  if (!initialized || !streaming) {
    sendError(msg.id, -32000, "No agent turn is in progress");
    return;
  }
  sendSuccess(msg.id, { status: "steered" });
}

async function handleCancel(msg) {
  if (!initialized || !streaming) {
    sendError(msg.id, -32000, "No agent turn is in progress");
    return;
  }
  streaming = false;
  cancelledFlag = true;
  if (cancelResolve) {
    cancelResolve(true);
  }
  sendSuccess(msg.id, {});
}

async function handleReplay(msg) {
  if (!initialized) {
    sendError(msg.id, -32000, "Not initialized");
    return;
  }
  if (streaming) {
    sendError(msg.id, -32000, "An agent turn is already in progress");
    return;
  }
  sendSuccess(msg.id, { status: "finished", events: 0, requests: 0 });
}

async function handleSetPlanMode(msg) {
  if (!initialized) {
    sendError(msg.id, -32000, "Not initialized");
    return;
  }
  sendSuccess(msg.id, { status: "ok", plan_mode: msg.params.enabled });
}

process.on("SIGTERM", () => {
  process.exit(0);
});
process.on("SIGINT", () => {
  process.exit(0);
});

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    sendError(null, -32700, "Invalid JSON format");
    return;
  }

  if (acceptRequestResponse(msg)) {
    return;
  }

  // Fire-and-forget handlers so that cancel/steer can be processed
  // while a long-running prompt is active.
  switch (msg.method) {
    case "initialize":
      handleInitialize(msg).catch(() => {});
      break;
    case "prompt":
      handlePrompt(msg).catch(() => {});
      break;
    case "steer":
      handleSteer(msg).catch(() => {});
      break;
    case "cancel":
      handleCancel(msg).catch(() => {});
      break;
    case "replay":
      handleReplay(msg).catch(() => {});
      break;
    case "set_plan_mode":
      handleSetPlanMode(msg).catch(() => {});
      break;
    default:
      if (msg.id != null) {
        sendError(msg.id, -32601, `Unexpected method received: ${msg.method}`);
      }
  }
});

rl.on("close", () => {
  process.exit(0);
});

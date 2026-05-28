import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Client for the Kimi Wire Protocol (JSON-RPC 2.0 over stdio).
 *
 * Spawns `kimi --wire` (or a compatible subprocess) and manages the
 * request/response lifecycle:
 *   - `initialize` handshake
 *   - `prompt` to start an agent turn
 *   - `steer` to inject follow-up input
 *   - `cancel` to abort the current turn
 *
 * Events are emitted via the standard EventTarget interface:
 *   - "event"   → server-sent event (TurnBegin, ContentPart, TurnEnd, …)
 *   - "request" → server-sent request (ApprovalRequest, ToolCallRequest, …)
 *   - "error"   → fatal or protocol error
 */
export class WireClient extends EventTarget {
  /**
   * @param {object} opts
   * @param {string} opts.command — executable to spawn (e.g. "kimi")
   * @param {string[]} [opts.args] — arguments (e.g. ["--wire"])
   * @param {NodeJS.ProcessEnv} [opts.env] — environment overrides
   * @param {number} [opts.initTimeoutMs=30000] — initialize timeout
   * @param {number} [opts.promptTimeoutMs=0] — 0 = no timeout
   */
  constructor(opts) {
    super();
    this._command = opts.command;
    this._args = opts.args || [];
    this._env = opts.env || process.env;
    this._initTimeoutMs = opts.initTimeoutMs ?? 30000;
    this._promptTimeoutMs = opts.promptTimeoutMs ?? 0;

    /** @type {import("node:child_process").ChildProcess | null} */
    this._proc = null;
    /** @type {string} */
    this._stdoutBuffer = "";

    /** @type {boolean} */
    this._connected = false;
    /** @type {boolean} */
    this._streaming = false;

    /** @type {Map<string, {resolve: Function, reject: Function}>} */
    this._pending = new Map();

    /** @type {object | null} */
    this._serverInfo = null;
  }

  get connected() {
    return this._connected;
  }

  get streaming() {
    return this._streaming;
  }

  /**
   * Convenience alias for addEventListener, matching EventEmitter style.
   * @param {string} type
   * @param {EventListenerOrEventListenerObject} listener
   */
  on(type, listener) {
    this.addEventListener(type, listener);
    return this;
  }

  /**
   * Spawn the subprocess and perform the `initialize` handshake.
   * @returns {Promise<object>} server info from initialize response
   */
  async connect() {
    if (this._connected) {
      throw new Error("WireClient is already connected");
    }

    this._proc = spawn(this._command, this._args, {
      env: this._env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const proc = this._proc;
    proc.on("error", (err) => this._onProcessError(err));
    proc.on("exit", (code, signal) => this._onProcessExit(code, signal));

    // Forward stderr for debugging (non-blocking)
    proc.stderr?.on("data", (chunk) => {
      // In production we might want to log this; for now ignore
      // eslint-disable-next-line no-console
      // console.error("[wire stderr]", chunk.toString());
    });

    // Buffer partial lines from stdout
    this._stdoutBuffer = "";
    proc.stdout.on("data", (chunk) => {
      this._stdoutBuffer += chunk.toString("utf-8");
      let idx;
      while ((idx = this._stdoutBuffer.indexOf("\n")) !== -1) {
        const line = this._stdoutBuffer.slice(0, idx);
        this._stdoutBuffer = this._stdoutBuffer.slice(idx + 1);
        if (line.trim()) this._onLine(line);
      }
    });
    proc.stdout.on("end", () => this._onReaderClose());
    proc.stdout.on("close", () => this._onReaderClose());

    // Wait for process to be ready (a brief pause or until first line)
    await this._waitForProcessReady();

    // Send initialize
    const initId = this._makeId();
    const initPromise = this._request(initId, {
      jsonrpc: "2.0",
      id: initId,
      method: "initialize",
      params: {
        protocol_version: "1.10",
        client: { name: "kimi-plugin-cross-platform", version: "0.1.0" },
        capabilities: { supports_question: false, supports_plan_mode: false },
      },
    });

    const result = await this._withTimeout(initPromise, this._initTimeoutMs, "initialize timeout");
    this._serverInfo = result;
    this._connected = true;
    return result;
  }

  /**
   * Start an agent turn.
   * @param {string} userInput
   * @returns {Promise<object>} prompt response (e.g. { status: "finished" })
   */
  async prompt(userInput) {
    if (!this._connected) {
      throw new Error("WireClient is not connected");
    }
    if (this._streaming) {
      throw new Error("An agent turn is already in progress");
    }
    // DEBUG
    // console.error("[wire-client] prompt starting, streaming was false");
    this._streaming = true;

    const id = this._makeId();
    const promise = this._request(id, {
      jsonrpc: "2.0",
      id,
      method: "prompt",
      params: { user_input: userInput },
    });

    try {
      const result = this._promptTimeoutMs
        ? await this._withTimeout(promise, this._promptTimeoutMs, "prompt timeout")
        : await promise;
      return result;
    } catch (err) {
      // If the error is from the server (e.g. auth expired), propagate it
      this._streaming = false;
      throw err;
    }
  }

  /**
   * Inject follow-up input into the current turn.
   * @param {string} userInput
   * @returns {Promise<object>}
   */
  async steer(userInput) {
    if (!this._connected) {
      throw new Error("WireClient is not connected");
    }
    if (!this._streaming) {
      throw new Error("No agent turn is in progress");
    }

    const id = this._makeId();
    return this._request(id, {
      jsonrpc: "2.0",
      id,
      method: "steer",
      params: { user_input: userInput },
    });
  }

  /**
   * Cancel the current turn.
   * @returns {Promise<object>}
   */
  async cancel() {
    if (!this._connected) {
      throw new Error("WireClient is not connected");
    }
    if (!this._streaming) {
      throw new Error("No agent turn is in progress");
    }

    const id = this._makeId();
    try {
      const result = await this._request(id, {
        jsonrpc: "2.0",
        id,
        method: "cancel",
        params: null,
      });
      this._streaming = false;
      return result;
    } catch (err) {
      this._streaming = false;
      throw err;
    }
  }

  /**
   * Gracefully shut down the connection.
   */
  async dispose() {
    if (this._proc) {
      // Unref stdio handles so they don't keep the event loop alive
      // @ts-ignore — internal libuv handle
      this._proc.stdout?._handle?.unref?.();
      // @ts-ignore
      this._proc.stdin?._handle?.unref?.();
      // @ts-ignore
      this._proc.stderr?._handle?.unref?.();

      // End stdin so child sees EOF
      this._proc.stdin?.end();
      // Destroy streams
      this._proc.stdin?.destroy();
      this._proc.stdout?.destroy();
      this._proc.stderr?.destroy();
      // Remove all listeners to free event-loop references
      this._proc.stdout?.removeAllListeners();
      this._proc.stderr?.removeAllListeners();
      this._proc.stdin?.removeAllListeners();
      this._proc.removeAllListeners();
      if (!this._proc.killed) {
        this._proc.kill("SIGTERM");
        // Give it a moment to exit cleanly
        await new Promise((r) => setTimeout(r, 100));
        if (!this._proc.killed) {
          this._proc.kill("SIGKILL");
        }
      }
      this._proc = null;
    }
    this._connected = false;
    this._streaming = false;
    // Reject any pending requests
    for (const [id, { reject }] of this._pending) {
      reject(new Error(`Connection closed while waiting for response to ${id}`));
    }
    this._pending.clear();
  }

  // ─── Internal helpers ───

  _makeId() {
    return randomUUID();
  }

  _waitForProcessReady() {
    return new Promise((resolve, reject) => {
      if (!this._proc) {
        reject(new Error("Process not spawned"));
        return;
      }
      const onError = (err) => {
        cleanup();
        reject(new Error(`Process spawn error: ${err.message}`));
      };
      const onExit = (code) => {
        cleanup();
        reject(new Error(`Process exited unexpectedly with code ${code}`));
      };
      const onLine = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this._proc?.off("error", onError);
        this._proc?.off("exit", onExit);
        this._proc?.stdout?.off("data", onLine);
        clearTimeout(timer);
      };
      this._proc.once("error", onError);
      this._proc.once("exit", onExit);
      this._proc?.stdout?.once("data", onLine);
      const timer = setTimeout(() => {
        cleanup();
        resolve(); // proceed anyway; some processes may not emit immediately
      }, 500);
    });
  }

  _request(id, msg) {
    return new Promise((resolve, reject) => {
      if (!this._proc || this._proc.killed) {
        reject(new Error("Process is not running"));
        return;
      }
      this._pending.set(id, { resolve, reject });
      const line = JSON.stringify(msg) + "\n";
      this._proc.stdin.write(line, (err) => {
        if (err) {
          this._pending.delete(id);
          reject(err);
        }
      });
    });
  }

  _withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(message)), ms)
      ),
    ]);
  }

  _onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      this.dispatchEvent(new CustomEvent("error", { detail: new Error(`Invalid JSON: ${line}`) }));
      return;
    }

    // Server -> Client response (result of our request)
    if (msg.id !== undefined && msg.id !== null && msg.method === undefined) {
      const pending = this._pending.get(msg.id);
      if (!pending) {
        // Response to unknown request — ignore or log
        return;
      }
      this._pending.delete(msg.id);
      if (msg.error) {
        const err = new Error(msg.error.message);
        err.code = msg.error.code;
        err.data = msg.error.data;
        pending.reject(err);
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Server -> Client notification (event or request)
    if (msg.method === "event") {
      const envelope = msg.params;
      if (envelope.type === "TurnEnd") {
        this._streaming = false;
      }
      this.dispatchEvent(new CustomEvent("event", { detail: envelope }));
      return;
    }

    if (msg.method === "request") {
      const envelope = msg.params;
      this.dispatchEvent(new CustomEvent("request", { detail: envelope }));
      // Auto-respond to simple requests to avoid hanging
      this._autoRespond(msg.id, envelope);
      return;
    }

    // Unknown message type
    this.dispatchEvent(
      new CustomEvent("error", {
        detail: new Error(`Unexpected message: ${line}`),
      })
    );
  }

  _autoRespond(requestId, envelope) {
    // For now, auto-approve all approval requests and respond to tool calls
    // with an error. Host adapters can override by listening to "request"
    // events and sending their own responses.
    const type = envelope.type;
    if (type === "ApprovalRequest") {
      this._sendRaw({
        jsonrpc: "2.0",
        id: requestId,
        result: {
          request_id: envelope.payload.id,
          response: "approve",
          feedback: "",
        },
      });
    } else if (type === "ToolCallRequest") {
      this._sendRaw({
        jsonrpc: "2.0",
        id: requestId,
        result: {
          tool_call_id: envelope.payload.id,
          return_value: {
            error: "Tool execution not implemented in WireClient auto-responder",
          },
        },
      });
    } else if (type === "QuestionRequest") {
      this._sendRaw({
        jsonrpc: "2.0",
        id: requestId,
        result: { request_id: envelope.payload.id, answers: {} },
      });
    } else if (type === "HookRequest") {
      this._sendRaw({
        jsonrpc: "2.0",
        id: requestId,
        result: { request_id: envelope.payload.id, action: "allow", reason: "" },
      });
    }
  }

  _sendRaw(msg) {
    if (!this._proc || this._proc.killed) return;
    this._proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  _onProcessError(err) {
    this.dispatchEvent(new CustomEvent("error", { detail: err }));
  }

  _onProcessExit(code, signal) {
    this._connected = false;
    this._streaming = false;
    for (const [id, { reject }] of this._pending) {
      reject(new Error(`Process exited (code=${code}, signal=${signal}) while waiting for ${id}`));
    }
    this._pending.clear();
  }

  _onReaderClose() {
    this._connected = false;
    this._streaming = false;
  }
}

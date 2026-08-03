// mcp-client.mjs — a minimal MCP (Model Context Protocol) client over stdio.
// Speaks newline-delimited JSON-RPC 2.0 to an MCP server process (e.g.
// npx -y @anthropic/mcp-server-*). Exposes discoverTools, callTool.
// Graceful failure when the server can't start or the protocol isn't available.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export class McpClient {
  /**
   * @param {object} opts
   * @param {string} opts.command    e.g. "npx"
   * @param {string[]} opts.args     e.g. ["-y", "@anthropic/mcp-server-filesystem", "/path"]
   * @param {object} opts.env        extra env vars
   * @param {number} opts.timeoutMs  request timeout
   */
  constructor({ command, args = [], env = {}, timeoutMs = 20_000 }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.proc = null;
    this.readline = null;
    this.pending = new Map(); // id -> {resolve, reject}
    this.reqId = 0;
    this.initialized = false;
    this.clientInfo = { name: "arena-code", version: "0.1.0" };
    this._closed = false;
  }

  async start() {
    if (this.proc) return this;
    return new Promise((resolve, reject) => {
      const proc = spawn(this.command, this.args, {
        env: { ...process.env, ...this.env },
        stdio: ["pipe", "pipe", "inherit"],
      });
      this.proc = proc;

      proc.on("error", (err) => {
        if (!this.initialized) reject(new Error(`MCP server failed to start (${this.command}): ${err.message}`));
        this._closed = true;
      });
      proc.on("exit", () => {
        this._closed = true;
        for (const [, p] of this.pending) p.reject(new Error("MCP server exited"));
        this.pending.clear();
      });

      this.readline = createInterface({ input: proc.stdout });
      this.readline.on("line", (line) => {
        if (!line.trim()) return;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || "MCP error"));
          else resolve(msg.result);
        }
      });

      // initialize handshake
      this._request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: this.clientInfo,
      })
        .then(() => {
          this.initialized = true;
          // send notifications/initialized
          this._notify("notifications/initialized", {});
          resolve(this);
        })
        .catch((err) => {
          this.close();
          reject(new Error(`MCP initialize failed: ${err.message}`));
        });
    });
  }

  _request(method, params) {
    const id = ++this.reqId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, this.timeoutMs);
      const origResolve = resolve;
      this.pending.get(id).resolve = (v) => { clearTimeout(timer); origResolve(v); };
      this._write({ jsonrpc: "2.0", id, method, params });
    });
  }

  _notify(method, params) {
    this._write({ jsonrpc: "2.0", method, params });
  }

  _write(obj) {
    if (this.proc && this.proc.stdin?.writable) this.proc.stdin.write(JSON.stringify(obj) + "\n");
  }

  async discoverTools() {
    await this.start();
    const result = await this._request("tools/list", {});
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name, args = {}) {
    await this.start();
    const result = await this._request("tools/call", { name, arguments: args });
    return result;
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    try {
      this._notify("notifications/cancelled", {});
      this.proc?.stdin?.end();
      this.proc?.kill?.();
    } catch {
      /* ignore */
    }
    this.proc = null;
  }

  get isRunning() {
    return this.proc && !this._closed;
  }
}

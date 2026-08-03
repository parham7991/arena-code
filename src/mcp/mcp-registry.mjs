// mcp-registry.mjs — manage MCP server connections from .arena-code/mcp.json,
// merge their tools with built-in tools, and manage lifecycle.
import fs from "node:fs";
import path from "node:path";
import { McpClient } from "./mcp-client.mjs";
import { mcpToolToOpenAI, mcpResultToString } from "./mcp-adapter.mjs";

export function mcpConfigPath(projectRoot) {
  return path.join(projectRoot, ".arena-code", "mcp.json");
}

export function loadMcpConfig(projectRoot) {
  const file = mcpConfigPath(projectRoot);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"))?.servers || {};
  } catch {
    /* ignore */
  }
  return {};
}

export class McpRegistry {
  constructor({ projectRoot, autoStart = false } = {}) {
    this.projectRoot = projectRoot;
    this.autoStart = autoStart;
    this.servers = new Map(); // name -> McpClient
    this.tools = new Map(); // toolName -> {openaiTool, serverName, call}
  }

  /** Register a server from config but don't connect yet. */
  addServerConfig(name, spec) {
    this.servers.set(name, null);
    this._specs = this._specs || new Map();
    this._specs.set(name, spec);
  }

  async connect(name) {
    const spec = this._specs?.get(name);
    if (!spec) throw new Error(`No MCP config for server: ${name}`);
    const client = new McpClient({
      command: spec.command,
      args: spec.args || [],
      env: spec.env || {},
    });
    await client.start();
    this.servers.set(name, client);
    // discover and register tools
    const mcpTools = await client.discoverTools();
    for (const t of mcpTools) {
      const openai = mcpToolToOpenAI(t);
      openai.function._mcp = { serverName: name, mcpToolName: t.name };
      this.tools.set(t.name, {
        schema: openai.function,
        serverName: name,
        call: (args) => client.callTool(t.name, args),
      });
    }
    return client;
  }

  /** Connect all configured servers (best-effort; failures are recorded). */
  async connectAll() {
    const errors = [];
    for (const [name] of this._specs || []) {
      try {
        await this.connect(name);
      } catch (e) {
        errors.push({ server: name, error: e.message });
      }
    }
    return errors;
  }

  /** Return OpenAI tool schemas for all connected MCP tools. */
  getToolSchemas() {
    return [...this.tools.values()].map((t) => ({ type: "function", function: t.schema }));
  }

  /** Invoke an MCP tool by name. */
  async callTool(name, args) {
    const entry = this.tools.get(name);
    if (!entry) throw new Error(`MCP tool not found: ${name}`);
    const result = await entry.call(args);
    return { content: mcpResultToString(result), _raw: result };
  }

  async closeAll() {
    for (const client of this.servers.values()) {
      if (client) await client.close().catch(() => {});
    }
    this.servers.clear();
    this.tools.clear();
  }
}

/** Convenience: create a registry and load all configured MCP servers. */
export async function initMcp(projectRoot, { autoStart = false } = {}) {
  const registry = new McpRegistry({ projectRoot, autoStart });
  const config = loadMcpConfig(projectRoot);
  for (const [name, spec] of Object.entries(config)) {
    registry.addServerConfig(name, spec);
  }
  if (autoStart) {
    await registry.connectAll();
  }
  return registry;
}

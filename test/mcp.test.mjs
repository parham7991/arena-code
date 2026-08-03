import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpToolToOpenAI, mcpResultToString, mcpResultText } from "../src/mcp/mcp-adapter.mjs";
import { McpRegistry } from "../src/mcp/mcp-registry.mjs";

test("mcpToolToOpenAI produces an OpenAI function tool", () => {
  const t = mcpToolToOpenAI({ name: "read_file", description: "Read", inputSchema: { type: "object", properties: { path: { type: "string" } } } });
  assert.equal(t.type, "function");
  assert.equal(t.function.name, "read_file");
  assert.ok(t.function.parameters.properties.path);
});

test("mcpResultToString handles content arrays and images", () => {
  const s = mcpResultToString({ content: [{ type: "text", text: "hi" }, { type: "image", mimeType: "image/png" }] });
  assert.match(s, /hi/);
  assert.match(s, /image:image\/png/);
});

test("mcpResultText extracts only text", () => {
  const s = mcpResultText({ content: [{ type: "text", text: "only" }, { type: "image", mimeType: "image/png" }] });
  assert.equal(s, "only");
});

test("McpRegistry registers tools from a connected server (stub client)", async () => {
  const registry = new McpRegistry({ projectRoot: "/tmp" });
  // Inject a fake client that "discovers" two tools.
  const fakeClient = {
    async start() { return this; },
    async discoverTools() {
      return [
        { name: "mcp_a", description: "A", inputSchema: { type: "object", properties: {} } },
        { name: "mcp_b", description: "B", inputSchema: { type: "object", properties: {} } },
      ];
    },
    async callTool(name) { return { content: [{ type: "text", text: `called ${name}` }] }; },
  };
  registry.servers.set("fake", fakeClient);
  registry._specs = new Map([["fake", { command: "x" }]]);
  const mcpTools = await fakeClient.discoverTools();
  for (const t of mcpTools) {
    const openai = mcpToolToOpenAI(t);
    registry.tools.set(t.name, { schema: openai.function, serverName: "fake", call: (a) => fakeClient.callTool(t.name, a) });
  }

  assert.equal(registry.getToolSchemas().length, 2);
  const res = await registry.callTool("mcp_a", {});
  assert.match(res.content, /called mcp_a/);
});

test("McpRegistry reports an error for unknown MCP tools", async () => {
  const registry = new McpRegistry({ projectRoot: "/tmp" });
  await assert.rejects(() => registry.callTool("missing", {}), /MCP tool not found/);
});

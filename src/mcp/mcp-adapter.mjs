// mcp-adapter.mjs — convert MCP tools into OpenAI function-calling schemas and
// translate MCP tool results into tool-message content.

/** Convert an MCP tool definition into an OpenAI function tool. */
export function mcpToolToOpenAI(mcpTool) {
  return {
    type: "function",
    function: {
      name: mcpTool.name,
      description: mcpTool.description || `MCP tool ${mcpTool.name}`,
      parameters: mcpTool.inputSchema || { type: "object", properties: {} },
    },
    // internal marker so the harness knows how to invoke it
    _mcp: { serverName: mcpTool._serverName || null },
  };
}

/** Serialize an MCP tool result into a string for a role:"tool" message. */
export function mcpResultToString(result) {
  if (!result) return "(no result)";
  if (Array.isArray(result.content)) {
    return result.content
      .map((c) => (c.type === "text" ? c.text : c.type === "image" ? `[image:${c.mimeType}]` : JSON.stringify(c)))
      .join("\n");
  }
  return JSON.stringify(result);
}

/** Extract a text summary from an MCP tool result. */
export function mcpResultText(result) {
  if (Array.isArray(result?.content)) {
    return result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  }
  return JSON.stringify(result ?? null);
}

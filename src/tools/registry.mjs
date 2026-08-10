// registry.mjs — central tool registry: Map of name -> {schema, execute},
// plus helpers to expose OpenAI-style tool definitions and to run tools.
import { readTool } from "./read.mjs";
import { writeTool } from "./write.mjs";
import { editTool } from "./edit.mjs";
import { bashTool } from "./bash.mjs";
import { globTool } from "./glob.mjs";
import { grepTool } from "./grep.mjs";
import { askTool } from "./ask.mjs";
import { processTool } from "./process.mjs";
import { testTool } from "./test.mjs";
import { diagnosticsTool } from "./diagnostics.mjs";

export const toolRegistry = new Map();

export function registerTool(tool) {
  if (!tool || typeof tool.schema?.name !== "string" || typeof tool.execute !== "function") {
    throw new Error("registerTool requires a tool with a string schema.name and an execute() function");
  }
  toolRegistry.set(tool.schema.name, tool);
  return tool;
}

[readTool, writeTool, editTool, bashTool, globTool, grepTool, askTool, processTool, testTool, diagnosticsTool].forEach(registerTool);

/** Return the array of OpenAI-style tool definitions ({type:"function", function}). */
export function getToolSchemas() {
  return [...toolRegistry.values()].map((t) => ({
    type: "function",
    function: t.schema,
  }));
}

/**
 * Run a tool by name. Returns a result object:
 *   on success: the tool's own result (which may contain {error: ...})
 *   on unknown tool: { error: "Unknown tool: <name>" }
 * Errors are captured as {error:"..."} rather than thrown (per M1 contract).
 */
export async function runTool(name, args, ctx) {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return { error: `Unknown tool: ${name}. Available tools: ${[...toolRegistry.keys()].join(", ")}` };
  }
  try {
    return await tool.execute(args || {}, ctx || {});
  } catch (error) {
    return { error: `${name} failed: ${error.message}` };
  }
}

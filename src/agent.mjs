// agent.mjs — the core agent loop: send messages, execute tool calls the model
// requests, feed results back, repeat until the model finishes or maxTurns is hit.
// Supports both non-streaming and streaming (SSE) bridge clients (M2).
import { runTool } from "./tools/registry.mjs";
import { SYSTEM_PROMPT } from "./prompts/sys.mjs";
import { hookBus } from "./hooks.mjs";

/**
 * Accumulate a streamed SSE chunk into a running assistant-message accumulator.
 * Handles content deltas, reasoning deltas and partial tool_calls.
 */
export function accumulateStream(acc, chunk) {
  const choice = chunk?.choices?.[0];
  if (!choice) return acc;
  if (choice.delta) {
    if (typeof choice.delta.content === "string") acc.content += choice.delta.content;
    if (typeof choice.delta.reasoning === "string") acc.reasoning += choice.delta.reasoning;
    if (Array.isArray(choice.delta.tool_calls)) {
      for (const tc of choice.delta.tool_calls) {
        const idx = tc.index ?? 0;
        acc.toolCalls[idx] ??= {
          id: "",
          type: "function",
          function: { name: "", arguments: "" },
        };
        if (tc.id) acc.toolCalls[idx].id = tc.id;
        if (tc.type) acc.toolCalls[idx].type = tc.type;
        if (tc.function?.name) acc.toolCalls[idx].function.name += tc.function.name;
        if (tc.function?.arguments) acc.toolCalls[idx].function.arguments += tc.function.arguments;
      }
    }
  }
  if (choice.finish_reason) acc.finishReason = choice.finish_reason;
  return acc;
}

/**
 * Run the agent loop.
 *
 * @param {object} opts
 * @param {Array}  opts.messages        - working message array (mutable)
 * @param {Array}  opts.tools           - OpenAI-format tool definitions
 * @param {object} opts.bridgeClient    - a BridgeClient (or anything with .chat()/.chatStream())
 * @param {number} opts.maxTurns        - hard cap on chat turns (default 60)
 * @param {object} opts.ctx             - {cwd, projectRoot, ...} passed to tools
 * @param {boolean} opts.stream         - stream chunks via onChunk (default false)
 * @param {string}  opts.sessionId      - optional x-codex-session-id
 * @param {Function} opts.onChunk       - called with each content delta when streaming
 * @param {Function} opts.onContent     - called with final assistant content
 * @param {Function} opts.onToolCall    - called before executing a tool
 * @param {Function} opts.onToolResult  - called after a tool executes
 * @param {Function} opts.onTurn        - called each turn (for progress)
 * @param {Function} opts.onSave        - called after each turn with the current messages (for auto-persist)
 * @param {string}  opts.systemPrompt   - override the default system prompt
 */
export async function runAgent({
  messages,
  tools,
  bridgeClient,
  maxTurns = 60,
  ctx = {},
  stream = false,
  sessionId,
  onChunk,
  onContent,
  onToolCall,
  onToolResult,
  onTurn,
  onSave,
  systemPrompt = SYSTEM_PROMPT,
}) {
  if (!bridgeClient || (typeof bridgeClient.chat !== "function" && typeof bridgeClient.chatStream !== "function")) {
    throw new Error("runAgent requires a bridgeClient with a chat() or chatStream() method");
  }
  const msgs = Array.isArray(messages) ? messages : [];
  const toolDefs = Array.isArray(tools) ? tools : [];

  // 1. Ensure a system prompt is present.
  const hasSystem = msgs.some((m) => m.role === "system" || m.role === "developer");
  if (!hasSystem) {
    msgs.unshift({ role: "system", content: systemPrompt });
  }

  for (let turn = 0; turn < maxTurns; turn++) {
    onTurn?.(turn + 1, msgs.length);
    hookBus.notify("onTurnStart", { turn: turn + 1, messages: msgs, ctx }).catch(() => {});

    // a. Ask the model.
    let finishReason;
    let assistant;
    if (stream && typeof bridgeClient.chatStream === "function") {
      ({ finishReason, assistant } = await streamTurn({ bridgeClient, messages: msgs, tools: toolDefs, sessionId, onChunk }));
    } else {
      const resp = await bridgeClient.chat({ messages: msgs, tools: toolDefs, sessionId });
      const choice = resp?.choices?.[0];
      if (!choice) {
        throw new Error(resp?.error?.message || "Bridge returned no choices.");
      }
      finishReason = choice.finish_reason || "stop";
      assistant = choice.message || { role: "assistant", content: "" };
    }

    const toolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];

    // b. Final answer.
    if (finishReason === "stop" || toolCalls.length === 0) {
      const content = typeof assistant.content === "string" ? assistant.content : "";
      onContent?.(content, finishReason);
      msgs.push({ role: "assistant", content });
      onSave?.(msgs);
      hookBus.notify("onTurnEnd", { turn: turn + 1, result: { status: "done", content }, ctx }).catch(() => {});
      return { status: "done", content, turns: turn + 1, messages: msgs };
    }

    // c. The model wants tools: record its message, then execute each call.
    msgs.push(assistant);

    for (const call of toolCalls) {
      const name = call?.function?.name;
      let args = {};
      try {
        args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = { _unparsed: call?.function?.arguments };
      }
      const callId = call?.id || `tc_${turn}_${Math.random().toString(36).slice(2, 8)}`;

      onToolCall?.({ id: callId, name, args });
      let toolCtx = { tool: name, args, ctx, callId };
      toolCtx = (await hookBus.emit("onToolBefore", toolCtx)) || toolCtx;
      const result = await runTool(toolCtx.tool || name, toolCtx.args || args, ctx);
      const afterData = await hookBus.emit("onToolAfter", { tool: name, args, result, ctx, callId });
      const effectiveResult = afterData?.result !== undefined ? afterData.result : result;
      onToolResult?.({ id: callId, name, result: effectiveResult });

      msgs.push({
        role: "tool",
        tool_call_id: callId,
        name: name || "",
        content: typeof effectiveResult === "string" ? effectiveResult : JSON.stringify(effectiveResult),
      });
    }
    onSave?.(msgs);
    hookBus.notify("onTurnEnd", { turn: turn + 1, result: { status: "tools", messages: msgs }, ctx }).catch(() => {});
  }

  // d. Max turns reached without the model stopping.
  const warning = `Stopped after reaching the maxTurns limit (${maxTurns}). The task may be incomplete.`;
  onContent?.(warning, "max_turns");
  onSave?.(msgs);
  return { status: "max_turns", content: warning, turns: maxTurns, messages: msgs };
}

/** Stream one turn, accumulating deltas and invoking onChunk per content piece. */
async function streamTurn({ bridgeClient, messages, tools, sessionId, onChunk }) {
  const acc = { content: "", reasoning: "", toolCalls: [], finishReason: "stop" };
  for await (const chunk of bridgeClient.chatStream({ messages, tools, sessionId })) {
    if (chunk === "[DONE]") break;
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) onChunk?.(delta);
    accumulateStream(acc, chunk);
  }
  const assistant = {
    role: "assistant",
    content: acc.content || null,
  };
  if (acc.toolCalls.length) {
    assistant.tool_calls = acc.toolCalls;
  }
  return { finishReason: acc.finishReason, assistant };
}

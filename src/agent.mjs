// agent.mjs — the core agent loop: send messages, execute tool calls the model
// requests, feed results back, repeat until the model finishes or maxTurns is hit.
// Supports both non-streaming and streaming (SSE) bridge clients (M2).
import { runTool } from "./tools/registry.mjs";
import { SYSTEM_PROMPT } from "./prompts/sys.mjs";
import { hookBus } from "./hooks.mjs";
import { prepareForArena, reassembleInstruction } from "./chunker.mjs";
import { LIMITS } from "./limits.mjs";
import { healIfNeeded } from "./healing.mjs";

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

    // a. Ask the model — auto-chunk if any message exceeds MESSAGE_SAFE (20k)
    // This prevents format.mjs compact truncation (24k hard) and 5MB body limit.
    const safeMsgs = chunkMessagesIfNeeded(msgs);
    let finishReason;
    let assistant;
    if (stream && typeof bridgeClient.chatStream === "function") {
      ({ finishReason, assistant } = await streamTurn({ bridgeClient, messages: safeMsgs, tools: toolDefs, sessionId, onChunk }));
    } else {
      const resp = await bridgeClient.chat({ messages: safeMsgs, tools: toolDefs, sessionId });
      const choice = resp?.choices?.[0];
      if (!choice) {
        throw new Error(resp?.error?.message || "Bridge returned no choices.");
      }
      finishReason = choice.finish_reason || "stop";
      assistant = choice.message || { role: "assistant", content: "" };
    }

    const toolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];

    // FLAWLESS FIX: If model printed <tool> blocks as plain text (common with 5 tasks in 1 prompt),
    // but tool_calls is empty, parse them ourselves — never error, never ignore.
    let effectiveToolCalls = toolCalls;
    if (effectiveToolCalls.length === 0 && typeof assistant.content === "string" && assistant.content.includes("<tool>")) {
      const parsed = parseToolBlocks(assistant.content);
      if (parsed.length > 0) {
        effectiveToolCalls = parsed;
        // Clean content to keep only text outside tool blocks
        assistant.content = assistant.content.replace(/<tool>[\s\S]*?<\/tool>/g, "").trim();
      }
    }

    // b. Final answer.
    if (finishReason === "stop" || effectiveToolCalls.length === 0) {
      const content = typeof assistant.content === "string" ? assistant.content : "";
      onContent?.(content, finishReason);
      msgs.push({ role: "assistant", content });
      onSave?.(msgs);
      hookBus.notify("onTurnEnd", { turn: turn + 1, result: { status: "done", content }, ctx }).catch(() => {});
      return { status: "done", content, turns: turn + 1, messages: msgs };
    }

    // c. The model wants tools: record its message, then execute each call.
    msgs.push(assistant);

    for (const call of effectiveToolCalls) {
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

      let toolContent = typeof effectiveResult === "string" ? effectiveResult : JSON.stringify(effectiveResult);
      // Auto-handle truncated outputs (Bash 50k, etc.) — precise, no guessing
      if (toolContent.includes("[truncated]") || toolContent.includes("…[truncated]")) {
        toolContent += `\n\n[SYSTEM HINT: Output was truncated at ${LIMITS.BASH_OUTPUT_MAX} chars (precise limit from bash.mjs). To get remaining output: use Read with offset/limit or Bash with " | tail -n 200" or " | head -c 40000".]`;
      }
      // Auto-handle oversized tool result for next turn (will be chunked on next iteration)
      if (toolContent.length > LIMITS.MESSAGE_SAFE) {
        toolContent += `\n\n[SYSTEM HINT: This tool result is ${toolContent.length} chars > ${LIMITS.MESSAGE_SAFE} safe limit. Next turn will auto-chunk into ${Math.ceil(toolContent.length / LIMITS.MESSAGE_SAFE)} parts with [[PART]] headers — reassemble before using.]`;
      }

      msgs.push({
        role: "tool",
        tool_call_id: callId,
        name: name || "",
        content: toolContent,
      });

      // Stage 3: Self-Healing — after Write/Edit, auto-run Diagnostics + Test
      // If failed, append healing hint as extra tool message so model fixes in next turn
      if (["Write", "Edit"].includes(name)) {
        try {
          const heal = await healIfNeeded(name, args, ctx);
          if (heal && !heal.passed) {
            msgs.push({
              role: "tool",
              tool_call_id: `${callId}_heal`,
              name: "Diagnostics",
              content: heal.hint,
            });
            onToolResult?.({ id: `${callId}_heal`, name: "Diagnostics", result: heal });
          }
        } catch (e) {
          // healing failure should not break loop
        }
      }
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

/**
 * Parse <tool>{"name":...,"arguments":...}</tool> blocks from plain text content.
 * Fallback for when bridge didn't convert them to tool_calls (e.g., 5 tasks in 1 prompt).
 */
export function parseToolBlocks(content) {
  const out = [];
  const re = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && typeof obj.name === "string") {
        const args = obj.arguments ?? obj.args ?? {};
        out.push({
          id: `tc_fallback_${out.length}_${Math.random().toString(36).slice(2, 6)}`,
          type: "function",
          function: { name: obj.name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
        });
      }
    } catch {}
  }
  return out;
}

/**
 * Chunk oversized messages for Arena web limits (precise: 20k safe, 24k hard).
 * If a message content > MESSAGE_SAFE, split into PART-wrapped chunks.
 * Tool messages keep tool_call_id, assistant messages keep tool_calls.
 */
export function chunkMessagesIfNeeded(messages) {
  const out = [];
  for (const m of messages) {
    const content = typeof m.content === "string" ? m.content : (m.content == null ? "" : JSON.stringify(m.content));
    if (content.length <= LIMITS.MESSAGE_SAFE) {
      out.push(m);
      continue;
    }
    // Oversized — chunk it
    const parts = prepareForArena(content, LIMITS.MESSAGE_SAFE);
    if (m.role === "tool") {
      // Tool result: split into multiple tool messages with same id + part suffix
      for (const p of parts) {
        out.push({
          role: "tool",
          tool_call_id: `${m.tool_call_id}_part${p.index}/${p.total}`,
          name: m.name || "tool",
          content: p.wrapped,
        });
      }
      // Final reassemble instruction as tool message
      out.push({
        role: "tool",
        tool_call_id: `${m.tool_call_id}_reassemble`,
        name: m.name || "tool",
        content: reassembleInstruction(parts.length),
      });
    } else {
      // User/assistant/system: split into sequential messages
      for (const p of parts) {
        out.push({ ...m, content: p.wrapped });
      }
      out.push({ role: "user", content: reassembleInstruction(parts.length) });
    }
  }
  return out;
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

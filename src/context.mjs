// context.mjs — context-window management for the agent loop.
//
//   - estimateTokens: rough token estimate (chars / 4)
//   - pruneToolMessages: when near the limit, drop/trim large, old tool results
//   - compactMessages / compactMessagesWithLLM: fold the middle of history into
//     a summary (deterministic, or via a summarization request to the bridge)
//
// No external dependencies.
export const DEFAULT_LIMIT_TOKENS = 128_000;
export const DEFAULT_TARGET_TOKENS = 90_000;
const PRUNED_MARKER = "<tool result pruned by Arena Code to free context — re-read the file if needed>";

/** Rough token estimate for a string (~4 chars per token). */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

/** Token estimate for a single message (content + any tool_calls). */
export function messageTokens(msg) {
  if (!msg) return 0;
  let t = estimateTokens(msg.content);
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      t += estimateTokens(tc?.function?.arguments || "");
    }
  }
  return t;
}

/** Token estimate for a whole message list. */
export function messagesTokens(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((sum, m) => sum + messageTokens(m), 0);
}

/** Split a token budget into a per-token-ish char budget. */
function tokenBudget(limit) {
  return limit * 4;
}

/**
 * Prune large/old tool messages when the history exceeds the token limit.
 * Keeps the last `keepRecent` tool messages untouched; trims older tool results
 * (largest first) down to `PRUNED_MARKER`. Returns { messages, pruned, tokensBefore, tokensAfter }.
 */
export function pruneToolMessages(messages, { limitTokens = DEFAULT_LIMIT_TOKENS, keepRecent = 6 } = {}) {
  const msgs = [...(messages || [])];
  const tokensBefore = messagesTokens(msgs);
  if (tokensBefore <= limitTokens) {
    return { messages: msgs, pruned: 0, tokensBefore, tokensAfter: tokensBefore };
  }

  const charBudget = tokenBudget(limitTokens);
  // Collect indices of prunable tool messages, excluding the last `keepRecent`.
  const prunable = [];
  let toolSeen = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "tool") {
      toolSeen += 1;
      if (toolSeen > keepRecent) prunable.push(i);
    }
  }
  // Prune the largest first.
  prunable.sort((a, b) => messageTokens(msgs[b]) - messageTokens(msgs[a]));

  let pruned = 0;
  let total = messagesTokens(msgs);
  for (const i of prunable) {
    if (total <= charBudget) break;
    const oldContent = msgs[i].content;
    const oldTokens = messageTokens(msgs[i]);
    if (typeof oldContent === "string") {
      total -= oldTokens - estimateTokens(PRUNED_MARKER);
      msgs[i] = { ...msgs[i], content: PRUNED_MARKER, _pruned: true };
      pruned += 1;
    }
  }
  return { messages: msgs, pruned, tokensBefore, tokensAfter: messagesTokens(msgs) };
}

/** Compact the history into a short deterministic summary of the middle. */
export function summarizeMessages(messages, maxChars = 4000) {
  const parts = [];
  let budget = maxChars;
  for (const m of messages || []) {
    const role = m?.role || "unknown";
    const content = typeof m?.content === "string" ? m.content : JSON.stringify(m?.tool_calls || "");
    const head = String(content).replace(/\s+/g, " ").trim().slice(0, 400);
    const line = `[${role}] ${head}`;
    if (line.length > budget) break;
    parts.push(line);
    budget -= line.length + 1;
  }
  return parts.join("\n");
}

/**
 * Compress history for /compact: keep the leading system message and the most
 * recent turns, and fold everything in between into a single "compacted summary"
 * user message. Returns { messages, summary, tokensBefore, tokensAfter }.
 */
export function compactMessages(messages, { keepRecent = 8, summaryMaxChars = 5000 } = {}) {
  const msgs = [...(messages || [])];
  const tokensBefore = messagesTokens(msgs);

  const systemIdx = msgs.findIndex((m) => m.role === "system" || m.role === "developer");
  const system = systemIdx >= 0 ? msgs[systemIdx] : null;
  let rest = systemIdx >= 0 ? msgs.slice(systemIdx + 1) : msgs;

  const keepCount = Math.min(keepRecent, rest.length);
  const recent = rest.slice(rest.length - keepCount);
  const middle = rest.slice(0, rest.length - keepCount);

  let summary = "";
  if (middle.length) {
    summary = summarizeMessages(middle, summaryMaxChars);
  }

  const out = [];
  if (system) out.push(system);
  if (summary) {
    out.push({
      role: "user",
      content:
        "[Context compaction] The following is a summarized transcript of the earlier conversation. " +
        "Treat it as background memory and continue the task.\n\n" +
        summary,
      _compacted: true,
    });
  }
  out.push(...recent);

  return { messages: out, summary, tokensBefore, tokensAfter: messagesTokens(out) };
}

/** Convenience: prune first, then compact if still over budget (deterministic). */
export function manageContext(messages, { limitTokens = DEFAULT_LIMIT_TOKENS, targetTokens = DEFAULT_TARGET_TOKENS, keepRecent = 6 } = {}) {
  const pruned = pruneToolMessages(messages, { limitTokens, keepRecent });
  let { messages: next } = pruned;
  let compacted = null;
  if (messagesTokens(next) > targetTokens) {
    compacted = compactMessages(next, { keepRecent });
    next = compacted.messages;
  }
  return { messages: next, pruned: pruned.pruned, compacted };
}

// ---- LLM-based compaction -------------------------------------------------

/**
 * Render the middle portion of a conversation as a compact transcript suitable
 * for sending to the bridge for summarization.
 */
export function transcriptForSummarization(messages, { maxChars = 60_000 } = {}) {
  const parts = [];
  let budget = maxChars;
  for (const m of messages || []) {
    if (budget <= 0) break;
    const role = m?.role || "unknown";
    let text = "";
    if (m?.role === "tool") {
      text = "<tool result>";
    } else if (typeof m?.content === "string") {
      text = m.content;
    } else if (m?.role === "assistant" && Array.isArray(m?.tool_calls)) {
      text = m.tool_calls.map((tc) => `call ${tc?.function?.name}`).join(", ");
    }
    const head = String(text).replace(/\s+/g, " ").trim().slice(0, 500);
    const line = `[${role}] ${head}`;
    if (line.length > budget) break;
    parts.push(line);
    budget -= line.length + 1;
  }
  return parts.join("\n");
}

const SUMMARY_SYSTEM_PROMPT =
  "You are a context-compaction assistant. Summarize the conversation transcript below into a concise " +
  "set of notes that preserves the user's goal, all decisions made, files touched, commands run, and any " +
  "important constraints. Write in the same language as the conversation. Do not omit anything needed to " +
  "continue the task. Keep it under ~600 words.";

/**
 * Compress history using an LLM summary request to the bridge.
 * The middle of the conversation (everything before the most recent turns) is
 * sent to the bridge for a summary; recent turns are kept verbatim.
 * Falls back to the deterministic summarizeMessages if the bridge call fails.
 *
 * @param {Array} messages
 * @param {object} opts
 * @param {object} opts.bridgeClient   - a BridgeClient with .chat()
 * @param {number} opts.keepRecent     - messages to keep verbatim (default 8)
 * @param {string} opts.sessionId      - optional session header
 * @returns {Promise<{messages, summary, tokensBefore, tokensAfter, mode}>}
 */
export async function compactMessagesWithLLM(messages, { bridgeClient, keepRecent = 8, sessionId } = {}) {
  const msgs = [...(messages || [])];
  const tokensBefore = messagesTokens(msgs);

  const systemIdx = msgs.findIndex((m) => m.role === "system" || m.role === "developer");
  const system = systemIdx >= 0 ? msgs[systemIdx] : null;
  let rest = systemIdx >= 0 ? msgs.slice(systemIdx + 1) : msgs;

  const keepCount = Math.min(keepRecent, rest.length);
  const recent = rest.slice(rest.length - keepCount);
  const middle = rest.slice(0, rest.length - keepCount);

  let summary = "";
  let mode = "none";
  if (middle.length) {
    const transcript = transcriptForSummarization(middle);
    if (bridgeClient && typeof bridgeClient.chat === "function" && transcript) {
      try {
        const resp = await bridgeClient.chat({
          model: "agent",
          messages: [
            { role: "system", content: SUMMARY_SYSTEM_PROMPT },
            { role: "user", content: transcript },
          ],
          sessionId,
        });
        summary = resp?.choices?.[0]?.message?.content?.trim() || "";
        if (summary) mode = "llm";
      } catch {
        // fall through to deterministic fallback
      }
    }
    if (!summary) {
      summary = summarizeMessages(middle, 5000);
      mode = "deterministic";
    }
  }

  const out = [];
  if (system) out.push(system);
  if (summary) {
    out.push({
      role: "user",
      content:
        "[Context compaction] The following is an AI-generated summary of the earlier conversation. " +
        "Treat it as background memory and continue the task.\n\n" +
        summary,
      _compacted: true,
      _compactionMode: mode,
    });
  }
  out.push(...recent);

  return { messages: out, summary, tokensBefore, tokensAfter: messagesTokens(out), mode };
}

/**
 * Async pipeline: prune large/old tool results first, then LLM-compact if still
 * over budget. Falls back to deterministic compaction if the bridge is unavailable.
 */
export async function manageContextAsync(messages, {
  limitTokens = DEFAULT_LIMIT_TOKENS,
  targetTokens = DEFAULT_TARGET_TOKENS,
  keepRecent = 6,
  bridgeClient,
  sessionId,
} = {}) {
  const pruned = pruneToolMessages(messages, { limitTokens, keepRecent });
  let { messages: next } = pruned;
  let compacted = null;
  if (messagesTokens(next) > targetTokens) {
    compacted = await compactMessagesWithLLM(next, { bridgeClient, keepRecent, sessionId });
    next = compacted.messages;
  }
  return { messages: next, pruned: pruned.pruned, compacted };
}

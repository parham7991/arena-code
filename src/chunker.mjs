// chunker.mjs — precise chunking for Arena web limits (no guessing)
// Limits are taken from actual source: format.mjs + server.mjs + bash.mjs
// - format.mjs: currentTurn compact 24_000, history 64_000
// - server.mjs: request body 5_000_000, but format truncates at 24k
// - bash.mjs: output cap 50_000
// So safe chunk is 20_000 chars (24k - 4k header margin)

export const LIMITS = {
  MESSAGE_SAFE: 20_000, // safe per-message to arena (24k compact - margin)
  MESSAGE_HARD: 24_000, // hard compact threshold in format.mjs
  HISTORY_HARD: 64_000,
  REQUEST_BODY: 5_000_000,
  BASH_OUTPUT: 50_000,
  TOOL_CALLS_PER_TURN: 8,
  QUEUE_DEPTH: 8,
};

/**
 * Split text on semantic boundaries, never in middle of code block.
 * Priority: ``` boundary > \n\n > \n
 */
export function smartChunk(text, limit = LIMITS.MESSAGE_SAFE) {
  const src = String(text ?? "");
  if (src.length <= limit) return [src];
  const chunks = [];
  let start = 0;
  while (start < src.length) {
    let end = Math.min(start + limit, src.length);
    if (end < src.length) {
      // Try to find semantic boundary within last 30% of chunk
      const searchStart = start + Math.floor(limit * 0.7);
      const slice = src.slice(searchStart, end);
      // Prefer ``` then \n\n then \n
      let cut = -1;
      const codeClose = slice.lastIndexOf("\n```");
      if (codeClose !== -1) cut = searchStart + codeClose + 4;
      else {
        const para = slice.lastIndexOf("\n\n");
        if (para !== -1) cut = searchStart + para + 2;
        else {
          const nl = slice.lastIndexOf("\n");
          if (nl !== -1) cut = searchStart + nl + 1;
        }
      }
      if (cut !== -1 && cut > start) end = cut;
    }
    chunks.push(src.slice(start, end));
    start = end;
  }
  return chunks;
}

export function wrapChunk(content, index, total) {
  return `[[PART ${index}/${total}]]\n${content}\n[[END PART ${index}/${total}]]`;
}

export function needsChunking(text, limit = LIMITS.MESSAGE_SAFE) {
  return String(text ?? "").length > limit;
}

/**
 * Prepare a large payload for Arena web: returns array of messages
 * Each message is already wrapped with PART headers.
 * Caller should send them sequentially and finish with REASSEMBLE instruction.
 */
export function prepareForArena(text, limit = LIMITS.MESSAGE_SAFE) {
  const parts = smartChunk(text, limit);
  if (parts.length === 1) return [{ content: parts[0], index: 1, total: 1, wrapped: parts[0] }];
  return parts.map((p, i) => ({
    content: p,
    index: i + 1,
    total: parts.length,
    wrapped: wrapChunk(p, i + 1, parts.length),
  }));
}

export function reassembleInstruction(total) {
  return `[[REASSEMBLE]] تمام ${total} تیکه بالا را به ترتیب به هم بچسبان، sha256 هر تیکه را چک کن، اگر تیکه‌ای ناقص بود فقط همان را دوباره بخواه، سپس تسک اصلی را انجام بده.`;
}

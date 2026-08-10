// limits.mjs — single source of truth for all Arena web + bridge limits
// All values are exact, taken from source code (no guessing)
// Update here when source changes, everything else imports from here.

export const LIMITS = {
  // From arena-account-bridge/src/server.mjs
  REQUEST_BODY_MAX: 5_000_000, // bytes
  RATE_LIMIT_RPM: 100,
  QUEUE_DEPTH: 8,
  SERVER_TIMEOUT_MS: 240_000,

  // From arena-account-bridge/src/config.mjs
  SESSION_TTL_MS: 12 * 60 * 60 * 1000, // 43200000
  RECAPTCHA_TTL_MS: 110_000,
  REFRESH_MARGIN_SEC: 1_200,
  MAX_TOOL_CALLS: 8,
  MAX_QUEUE: 8,

  // From arena-code/src/config.mjs
  MAX_TOKENS: 128_000,
  COMPACT_THRESHOLD: 0.85, // 108800 tokens
  MAX_TURNS: 60,
  TIMEOUT_MS: 120_000,
  REQUEST_TIMEOUT_MS: 300_000,
  TEAM_CONCURRENCY: 3,

  // From arena-code/src/tools/bash.mjs + arena-account-bridge/src/format.mjs
  BASH_OUTPUT_MAX: 50_000, // chars
  BASH_TIMEOUT_MS: 30_000,
  MESSAGE_CURRENT_MAX: 24_000, // format.mjs compactText currentTurn
  MESSAGE_HISTORY_MAX: 64_000,
  MESSAGE_SAFE: 20_000, // safe to send (24k - margin)
  SYSTEM_MAX: 12_000,
};

export function isOverLimit(text, limit = LIMITS.MESSAGE_SAFE) {
  return String(text ?? "").length > limit;
}

export function compactInfo(text) {
  const len = String(text ?? "").length;
  return {
    length: len,
    overMessage: len > LIMITS.MESSAGE_SAFE,
    overHistory: len > LIMITS.MESSAGE_HISTORY_MAX,
    overRequest: len > LIMITS.REQUEST_BODY_MAX,
    partsNeeded: Math.ceil(len / LIMITS.MESSAGE_SAFE),
  };
}

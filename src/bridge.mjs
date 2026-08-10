// bridge.mjs — HTTP client for the local arena-account-bridge's
// OpenAI-compatible endpoint. Uses Node's global fetch (Node >= 18).
//
// Features (M2):
//   - streaming: POST with stream:true, parses SSE, yields each data chunk
//   - backoff: retries 429/503 using Retry-After + exponential backoff
//   - session header: x-codex-session-id support
//   - timeout: 120s default per request

import { LIMITS } from "./limits.mjs";

const DEFAULT_TIMEOUT_MS = 120_000;
const RETRY_STATUSES = [429, 503];
const DEFAULT_MAX_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry-After header may be seconds (int) or an HTTP-date. */
function parseRetryAfter(header) {
  if (!header) return undefined;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
  const t = Date.parse(header);
  if (Number.isFinite(t)) return Math.max(0, t - Date.now());
  return undefined;
}

/** Exponential backoff delay in ms for a given attempt (1-based). */
function backoffDelay(attempt, baseMs = 1000) {
  const jitter = Math.random() * 0.25 + 0.875; // ±~12%
  return Math.round(baseMs * Math.pow(2, attempt - 1) * jitter);
}

/**
 * Split an SSE event block (lines separated by \n) into parsed data payloads.
 * Handles multi-line `data:` and the `[DONE]` sentinel.
 */
export function parseSSEBlock(block) {
  const events = [];
  let dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    } else if (line.trim() === "") {
      if (dataLines.length) events.push(finishSSE(dataLines));
      dataLines = [];
    }
  }
  if (dataLines.length) events.push(finishSSE(dataLines));
  return events;
}

function finishSSE(dataLines) {
  const raw = dataLines.join("\n");
  if (raw === "[DONE]") return "[DONE]";
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

/** Async-iterate an SSE response body, yielding parsed data payloads. */
export async function* readSSEStream(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const evt of parseSSEBlock(block)) yield evt;
    }
  }
  if (buffer.trim()) {
    for (const evt of parseSSEBlock(buffer)) yield evt;
  }
}

export class BridgeClient {
  constructor({ url, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = DEFAULT_MAX_RETRIES, fetchImpl = globalThis.fetch }) {
    this.url = (url || "http://127.0.0.1:20140").replace(/\/+$/, "");
    this.apiKey = apiKey || "";
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.fetch = fetchImpl;
  }

  headers(sessionId) {
    const h = { "Content-Type": "application/json" };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    if (sessionId) h["x-codex-session-id"] = sessionId;
    return h;
  }

  async healthcheck() {
    try {
      const res = await this.fetch(`${this.url}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const body = await res.json().catch(() => ({}));
      return { ok: true, status: res.status, ...body };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  /**
   * Perform a POST to /v1/chat/completions with backoff on 429/503.
   * Returns the fetch Response, or throws a descriptive Error.
   */
  async _requestWithRetry(body, sessionId) {
    let lastErr;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      let res;
      try {
        res = await this.fetch(`${this.url}/v1/chat/completions`, {
          method: "POST",
          headers: this.headers(sessionId),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        lastErr = error;
        if (attempt < this.maxRetries) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        break;
      }

      if (res.ok) return res;

      if (RETRY_STATUSES.includes(res.status) && attempt < this.maxRetries) {
        const ra = parseRetryAfter(res.headers?.get?.("retry-after"));
        await sleep(ra ?? backoffDelay(attempt));
        continue;
      }

      const text = await res.text().catch(() => "");
      const err = new Error(`Bridge returned ${res.status}: ${text.slice(0, 500) || res.statusText}`);
      err.status = res.status;
      const ra = parseRetryAfter(res.headers?.get?.("retry-after"));
      if (ra !== undefined) err.retryAfter = ra;
      throw err;
    }
    throw new Error(`Bridge request failed after ${this.maxRetries} attempts: ${lastErr?.message}`);
  }

  /**
   * Non-streaming chat completion. Returns the full OpenAI-style payload.
   */
  async chat({ messages, tools = [], model = "agent", max_tokens, temperature, sessionId, stream = false }) {
    const body = { model, messages, tools, stream };
    if (max_tokens !== undefined) body.max_tokens = max_tokens;
    if (temperature !== undefined) body.temperature = temperature;

    // Precise pre-check: 5MB body limit (from arena-account-bridge server.mjs)
    const bodyStr = JSON.stringify(body);
    if (Buffer.byteLength(bodyStr, "utf8") > LIMITS.REQUEST_BODY_MAX) {
      const err = new Error(`Request body ${Buffer.byteLength(bodyStr, "utf8")} bytes > ${LIMITS.REQUEST_BODY_MAX} (precise limit). Chunk messages to ${LIMITS.MESSAGE_SAFE} chars per part.`);
      err.status = 413;
      throw err;
    }

    const res = await this._requestWithRetry(body, sessionId);
    return res.json();
  }

  /**
   * Streaming chat completion. Returns an async generator of parsed SSE data
   * payloads (objects, or the string "[DONE]" at the end).
   */
  async *chatStream({ messages, tools = [], model = "agent", max_tokens, temperature, sessionId }) {
    const body = { model, messages, tools, stream: true };
    if (max_tokens !== undefined) body.max_tokens = max_tokens;
    if (temperature !== undefined) body.temperature = temperature;

    const bodyStr = JSON.stringify(body);
    if (Buffer.byteLength(bodyStr, "utf8") > LIMITS.REQUEST_BODY_MAX) {
      const err = new Error(`Stream body ${Buffer.byteLength(bodyStr, "utf8")} bytes > ${LIMITS.REQUEST_BODY_MAX}. Chunk first.`);
      err.status = 413;
      throw err;
    }

    const res = await this._requestWithRetry(body, sessionId);
    yield* readSSEStream(res.body);
  }
}

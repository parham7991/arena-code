// http.mjs — HTTP tool: fetch a URL (especially localhost dev servers)
// Precise timeout 5s, no guessing
export const httpTool = {
  schema: {
    name: "HTTP_Fetch",
    description: "Fetch a URL (GET) — use to check if dev server is up (http://localhost:3000). Returns status, headers, body (capped).",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch, e.g., http://localhost:3000" },
        timeout: { type: "integer", description: "Timeout ms (default 5000)" },
        headers: { type: "object", description: "Optional headers" },
      },
      required: ["url"],
    },
  },

  async execute(args) {
    const url = args?.url;
    if (!url || typeof url !== "string") return { error: "HTTP_Fetch failed: 'url' required" };
    const timeout = Number.isFinite(Number(args.timeout)) ? Number(args.timeout) : 5000;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { headers: args.headers || {}, signal: controller.signal });
      const text = await res.text().catch(() => "");
      const body = text.length > 20_000 ? text.slice(0, 20_000) + "\n…[truncated]" : text;
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        url,
        headers: Object.fromEntries(res.headers.entries()),
        body,
        hint: res.ok ? "HTTP 200 OK" : `HTTP ${res.status} — check Process logs`,
      };
    } catch (e) {
      return { ok: false, error: `HTTP_Fetch failed: ${e.message}`, url, hint: e.name === "AbortError" ? "Timeout — is server running? Check Process list" : "ECONNREFUSED — server not listening, check Process logs" };
    } finally { clearTimeout(t); }
  },
};

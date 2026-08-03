// built-in web plugin — WebFetch with HTML→Markdown conversion.
import { definePlugin } from "../plugin-api.mjs";

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const webTools = [
  {
    schema: { name: "WebFetch", description: "Fetch a URL and return its text content.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
    async execute(args, ctx) {
      if (!args?.url) return { error: "WebFetch requires a url" };
      try {
        const res = await fetch(args.url, { signal: AbortSignal.timeout(ctx?.fetchTimeoutMs || 20_000) });
        const text = await res.text();
        return { ok: true, status: res.status, content: htmlToText(text).slice(0, 50_000) };
      } catch (e) {
        return { error: `WebFetch failed: ${e.message}` };
      }
    },
  },
  { schema: { name: "WebSearch", description: "Search the web (requires a search backend).", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }, async execute() { return { error: "WebSearch: no search backend configured" }; } },
];

export default definePlugin({
  name: "web",
  version: "1.0.0",
  description: "Web fetch and search",
  tools: webTools,
  commands: [],
  hooks: {},
});

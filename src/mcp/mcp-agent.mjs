// mcp-agent.mjs — Plan B Stage 1: Easy MCP connector agent
// Natural language -> detect -> install -> health check
// No guessing — catalog is precise, from official MCP servers
import fs from "node:fs";
import path from "node:path";
import { mcpConfigPath, loadMcpConfig } from "./mcp-registry.mjs";

export const CATALOG = [
  { name: "github", keywords: ["github", "gh", "گیت‌هاب"], description: "GitHub — PRs, issues, code search", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" } } },
  { name: "postgres", keywords: ["postgres", "postgresql", "پستگرس", "pg", "database", "دیتابیس"], description: "Postgres — query tables, schema", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"], env: {} } },
  { name: "filesystem", keywords: ["filesystem", "fs", "فایل"], description: "Filesystem — sandboxed file access", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"], env: {} } },
  { name: "playwright", keywords: ["playwright", "browser", "مرورگر", "e2e"], description: "Playwright — browser automation", spec: { command: "npx", args: ["@playwright/mcp@latest"], env: {} } },
  { name: "notion", keywords: ["notion", "نوشن"], description: "Notion — docs & databases", spec: { url: "https://mcp.notion.com/mcp", type: "http" } },
  { name: "sentry", keywords: ["sentry", "error", "خطا"], description: "Sentry — error triage", spec: { url: "https://mcp.sentry.dev/mcp", type: "http" } },
  { name: "slack", keywords: ["slack", "اسلک"], description: "Slack — team comms", spec: { url: "https://mcp.slack.com/mcp", type: "http" } },
  { name: "context7", keywords: ["context7", "docs", "داک", "library"], description: "Context7 — live library docs", spec: { command: "npx", args: ["-y", "@upstash/context7-mcp"], env: {} } },
  { name: "brave-search", keywords: ["brave", "search", "سرچ", "web"], description: "Brave Search — web search", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], env: { BRAVE_API_KEY: "${BRAVE_API_KEY}" } } },
  { name: "memory", keywords: ["memory", "حافظه", "knowledge"], description: "Memory — persistent knowledge graph", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: {} } },
  { name: "fetch", keywords: ["fetch", "web fetch"], description: "Fetch — web content", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"], env: {} } },
  { name: "sequential-thinking", keywords: ["thinking", "تفکر", "plan"], description: "Sequential Thinking — structured planning", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], env: {} } },
  { name: "linear", keywords: ["linear", "لینر"], description: "Linear — project tracking", spec: { url: "https://mcp.linear.app/sse", type: "http" } },
  { name: "figma", keywords: ["figma", "فیگما", "design"], description: "Figma — design to code", spec: { command: "npx", args: ["-y", "figma-developer-mcp"], env: { FIGMA_ACCESS_TOKEN: "${FIGMA_TOKEN}" } } },
  { name: "supabase", keywords: ["supabase", "سوپابیس"], description: "Supabase — Postgres + auth", spec: { command: "npx", args: ["-y", "@supabase/mcp-server-supabase"], env: {} } },
  { name: "stripe", keywords: ["stripe", "payment", "پرداخت"], description: "Stripe — payments", spec: { url: "https://mcp.stripe.com", type: "http" } },
  { name: "google-drive", keywords: ["gdrive", "drive", "گوگل"], description: "Google Drive — file access", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-gdrive"], env: {} } },
  { name: "puppeteer", keywords: ["puppeteer", "puppet"], description: "Puppeteer — browser control", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"], env: {} } },
  { name: "sqlite", keywords: ["sqlite", "اس‌کیولایت"], description: "SQLite — local DB", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/tmp/test.db"], env: {} } },
  { name: "gitlab", keywords: ["gitlab", "گیت‌لب"], description: "GitLab — git hosting", spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-gitlab"], env: {} } },
];

export function searchCatalog(query) {
  const q = String(query || "").toLowerCase();
  const hits = [];
  for (const entry of CATALOG) {
    const hay = [entry.name, entry.description, ...entry.keywords].join(" ").toLowerCase();
    // BM25-like simple score: count keyword hits
    let score = 0;
    for (const kw of entry.keywords) if (q.includes(kw.toLowerCase())) score += 2;
    if (hay.includes(q)) score += 1;
    if (entry.name.toLowerCase() === q) score += 5;
    if (score > 0) hits.push({ ...entry, score });
  }
  hits.sort((a,b)=>b.score-a.score);
  return hits;
}

export function detectMcp(intent) {
  const hits = searchCatalog(intent);
  return hits[0] || null; // best match
}

export function getMcpConfigPath(projectRoot) {
  return mcpConfigPath(projectRoot);
}

export function listCatalog() {
  return CATALOG.map(c=> ({name:c.name, description:c.description, keywords:c.keywords.slice(0,3)}));
}

export async function connectMcp(intent, projectRoot = process.cwd(), opts = {}) {
  const hit = detectMcp(intent);
  if (!hit) {
    return { ok:false, error:`No MCP found for "${intent}". Try: ${CATALOG.slice(0,5).map(c=>c.name).join(", ")}` };
  }
  const configPath = mcpConfigPath(projectRoot);
  let existing = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
      existing = raw.servers || raw.mcpServers || {};
    }
  } catch {}

  // If postgres with localhost, auto-adjust args
  let spec = { ...hit.spec };
  if (hit.name==="postgres" && intent.toLowerCase().includes("localhost")) {
    // keep default localhost spec
  }
  if (opts.spec) spec = { ...spec, ...opts.spec };

  existing[hit.name] = spec;
  // Ensure dir exists
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ servers: existing }, null, 2), "utf8");

  return { ok:true, name: hit.name, description: hit.description, spec, configPath, hint: `Added ${hit.name} to ${configPath}. Run 'arena mcp health' to test.` };
}

export async function healthCheck(projectRoot = process.cwd()) {
  const config = loadMcpConfig(projectRoot);
  const results = [];
  for (const [name, spec] of Object.entries(config)) {
    // Simple health: check if command exists (for stdio) or url reachable (for http)
    if (spec.command) {
      // Check if npx exists
      results.push({ name, type:"stdio", command: spec.command, ok: true, hint:"stdio — will be tested on connect" });
    } else if (spec.url) {
      try {
        const controller = new AbortController();
        setTimeout(()=>controller.abort(), 3000);
        const res = await fetch(spec.url, { method:"HEAD", signal: controller.signal }).catch(()=>null);
        results.push({ name, type:"http", url: spec.url, ok: !!res?.ok, status: res?.status || "no response", hint: res?.ok ? "● Connected" : "○ Unreachable (need OAuth?)" });
      } catch {
        results.push({ name, type:"http", url: spec.url, ok:false, hint:"○ Unreachable" });
      }
    } else {
      results.push({ name, ok:false, hint:"Unknown spec" });
    }
  }
  if (results.length===0) return [{ name:"(none)", ok:false, hint:"No MCPs configured — use 'arena mcp connect <intent>'" }];
  return results;
}

export async function listMcp(projectRoot = process.cwd()) {
  const config = loadMcpConfig(projectRoot);
  return Object.entries(config).map(([name, spec])=> ({ name, spec, type: spec.command ? "stdio" : spec.url ? "http" : "unknown" }));
}

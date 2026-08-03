// config.mjs — central configuration for Arena Code (M4+).
// Load precedence (highest first):
//   1. CLI flags (passed in via overrides)
//   2. <project>/.arena-code/config.json
//   3. ~/.arena-code/config.json
//   4. env vars (ARENA_*)
//   5. defaults
// No external dependencies.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULTS = {
  // Bridge
  bridgeUrl: "http://127.0.0.1:20140",
  bridgeKey: "",
  maxTurns: 60,
  timeoutMs: 120_000,
  requestTimeoutMs: 300_000,

  // Autonomy
  autonomy: "ask", // 'ask' | 'auto' | 'semi'
  autoApprove: ["Read", "Glob", "Grep"],

  // Context
  maxTokens: 128_000,
  compactThreshold: 0.85, // fraction of maxTokens at which to compact
  projectMemoryFile: "ARENA_CODE.md",

  // Skills
  skillDir: ".arena-code/skills",

  // Plugins
  pluginDir: ".arena-code/plugins",
  pluginConfig: ".arena-code/plugins.json",
  autoLint: false,
  autoFormat: false,
  autoTest: false,
  autoSnapshot: true,
  autoCommit: false,

  // MCP
  mcpConfig: ".arena-code/mcp.json",

  // UI
  theme: "default",
  lang: "en",
  diffInline: true,

  // Security
  blockedPaths: [".git", "node_modules", ".env"],
  maxBashOutput: 50_000,
  bashTimeout: 30_000,

  // Team
  teamConcurrency: 3,

  // Telemetry
  telemetry: true,

  // Data
  dataDir: null,
};

function readJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* ignore */
  }
  return null;
}

/** Load config with the documented precedence. `overrides` are highest priority. */
export function loadConfig(env = {}, overrides = {}) {
  const home = os.homedir();
  const dataDir = env.ARENA_CODE_DIR || path.join(home, ".arena-code");

  // 1. defaults
  const cfg = { ...DEFAULTS, dataDir };

  // Auto-discover bridge key/url from the bridge's own .env (~/.arena-bridge/.env
  // or $ARENA_CODE_DIR/../.arena-bridge/.env). This makes `arena` connect to the
  // running bridge even if the shell wasn't sourced (no ARENA_BRIDGE_KEY env set).
  function bridgeDotEnv() {
    const candidates = [
      path.join(os.homedir(), ".arena-bridge", ".env"),
      path.join(dataDir, "..", ".arena-bridge", ".env"),
      path.join(os.homedir(), ".arena-code", "arena-account-bridge", ".env"),
    ];
    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
      } catch { /* ignore */ }
    }
    return "";
  }
  const dotEnv = bridgeDotEnv();
  const parseDot = (key) => {
    const m = dotEnv.match(new RegExp(`^${key}=(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
  };

  // 2. env (ARENA_*) — with fallback to bridge .env auto-discovery
  const dotPort = parseDot("PORT");
  const autoBridgeUrl = dotPort ? `http://127.0.0.1:${dotPort}` : undefined;
  const envMap = {
    bridgeUrl: env.ARENA_BRIDGE_URL || parseDot("ARENA_AGENT_BRIDGE_URL") || autoBridgeUrl,
    bridgeKey: env.ARENA_BRIDGE_KEY || parseDot("ARENA_AGENT_BRIDGE_KEY"),
    maxTurns: env.ARENA_MAX_TURNS,
    autonomy: env.ARENA_AUTONOMY,
    teamConcurrency: env.ARENA_TEAM_CONCURRENCY,
    theme: env.ARENA_THEME,
    lang: env.ARENA_LANG,
    requestTimeoutMs: env.ARENA_REQUEST_TIMEOUT_MS,
  };
  for (const [k, v] of Object.entries(envMap)) {
    if (v !== undefined && v !== "") {
      if (typeof DEFAULTS[k] === "number") cfg[k] = Number(v);
      else cfg[k] = v;
    }
  }

  // 3. user config (~/.arena-code/config.json)
  const userCfg = readJson(path.join(dataDir, "config.json"));
  if (userCfg) Object.assign(cfg, userCfg);

  // 4. project config (<cwd>/.arena-code/config.json)
  const cwd = env.ARENA_CWD || process.cwd();
  const projectCfg = readJson(path.join(cwd, ".arena-code", "config.json"));
  if (projectCfg) Object.assign(cfg, projectCfg);

  // 5. CLI overrides (highest)
  if (overrides && typeof overrides === "object") Object.assign(cfg, overrides);

  // sanitize
  if (!Number.isInteger(cfg.maxTurns) || cfg.maxTurns < 1) cfg.maxTurns = DEFAULTS.maxTurns;
  if (!["ask", "auto", "semi"].includes(cfg.autonomy)) cfg.autonomy = "ask";
  if (!Number.isInteger(cfg.teamConcurrency) || cfg.teamConcurrency < 1) cfg.teamConcurrency = 3;

  return cfg;
}

/** True if a tool is auto-approved under the autonomy policy. */
export function needsApproval(toolName, config) {
  if (!config) return false;
  if (config.autonomy === "auto") return false;
  if (config.autonomy === "semi") {
    // auto-approve read-only + listed tools
    const readOnly = ["Read", "Glob", "Grep"];
    return ![...readOnly, ...(config.autoApprove || [])].includes(toolName);
  }
  // 'ask'
  return !(config.autoApprove || []).includes(toolName);
}

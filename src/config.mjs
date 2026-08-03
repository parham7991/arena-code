// config.mjs — environment/config parsing for Arena Code.
// Reads bridge connection settings, autonomy policy and run limits from env
// variables with sane defaults. No external dependencies.
import os from "node:os";
import path from "node:path";

export function loadConfig(env = {}) {
  const dataDir = env.ARENA_CODE_DIR || path.join(os.homedir(), ".arena-code");
  const bridgeUrl = (env.ARENA_BRIDGE_URL || "http://127.0.0.1:20140").replace(/\/+$/, "");
  const autonomy = ["ask", "auto"].includes(env.ARENA_AUTONOMY) ? env.ARENA_AUTONOMY : "ask";

  const maxTurns = Number(env.ARENA_MAX_TURNS || 60);
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new Error(`Invalid ARENA_MAX_TURNS: ${env.ARENA_MAX_TURNS}`);
  }

  const teamConcurrency = Number(env.ARENA_TEAM_CONCURRENCY || 3);
  if (!Number.isInteger(teamConcurrency) || teamConcurrency < 1) {
    throw new Error(`Invalid ARENA_TEAM_CONCURRENCY: ${env.ARENA_TEAM_CONCURRENCY}`);
  }

  const config = {
    dataDir,
    bridgeUrl,
    bridgeKey: env.ARENA_BRIDGE_KEY || "",
    maxTurns,
    autonomy,
    teamConcurrency,
    requestTimeoutMs: Number(env.ARENA_REQUEST_TIMEOUT_MS || 300_000),
    bridgeKeyRequired: env.ARENA_BRIDGE_KEY_REQUIRED === "1",
  };

  return config;
}

export const DEFAULTS = {
  bridgeUrl: "http://127.0.0.1:20140",
  maxTurns: 60,
  autonomy: "ask",
};

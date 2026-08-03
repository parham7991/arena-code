// auto-bridge.mjs — find or auto-start the arena-account-bridge so `arena` works
// without the user manually running the bridge. Uses the installed bridge in
// ~/.arena-code/arena-account-bridge (or the repo), picks a free port, and keeps
// it alive in the background.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";

export function findBridgeDirs() {
  const home = os.homedir();
  return [
    path.join(home, ".arena-code", "arena-account-bridge"),
    path.join(home, ".arena-code", "repo", "arena-account-bridge"),
    path.join(home, "arena-account-bridge"),
  ].filter((d) => fs.existsSync(path.join(d, "src", "index.mjs")));
}

export function bridgeEnv(dataDir) {
  // dataDir defaults to ~/.arena-bridge
  const dir = dataDir || path.join(os.homedir(), ".arena-bridge");
  const envFile = path.join(dir, ".env");
  const env = { DATA_DIR: dir };
  try {
    if (fs.existsSync(envFile)) {
      for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
        const i = line.indexOf("=");
        if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* ignore */ }
  return env;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/health", timeout: 1500 },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d.includes('"ok":true')));
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/**
 * Find the running bridge on the configured/default port, or scan common ports.
 * Returns the base URL if a healthy bridge is found, else null.
 */
export async function findRunningBridge({ bridgeUrl, dataDir } = {}) {
  // 1. If an explicit healthy bridge is given, use it.
  if (bridgeUrl) {
    if (await portOpen(new URL(bridgeUrl).port)) return bridgeUrl;
  }
  // 2. Scan ports from the bridge .env (PORT) + common ports.
  const env = bridgeEnv(dataDir);
  const candidates = new Set([20140, 20999, 20141, 20142, 20143]);
  if (env.PORT) candidates.add(Number(env.PORT));
  if (env.ARENA_AGENT_BRIDGE_URL) candidates.add(Number(new URL(env.ARENA_AGENT_BRIDGE_URL).port));
  for (const p of candidates) {
    if (await portOpen(p)) return `http://127.0.0.1:${p}`;
  }
  return null;
}

/**
 * Auto-start the bridge in the background. Returns the base URL once healthy.
 * Uses ~/.arena-bridge as the data dir (where credentials.json lives).
 */
export async function autoStartBridge({ dataDir, port = 20999 } = {}) {
  const dirs = findBridgeDirs();
  if (dirs.length === 0) return null;
  const dir = dirs[0];
  // The bridge data dir is ~/.arena-bridge (holds credentials.json + .env).
  const realDataDir = dataDir || path.join(os.homedir(), ".arena-bridge");
  const env = bridgeEnv(realDataDir);
  const key = env.ARENA_AGENT_BRIDGE_KEY;
  const myEnv = { ...process.env, DATA_DIR: realDataDir, PORT: String(port) };
  if (key) myEnv.ARENA_AGENT_BRIDGE_KEY = key;
  // Use WARP proxy if present.
  if (await portOpen(40000)) myEnv.ARENA_AGENT_PROXY = "socks5://127.0.0.1:40000";

  const proc = spawn("node", ["src/index.mjs"], {
    cwd: dir,
    env: myEnv,
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  proc.unref();

  // Wait up to ~12s for it to become healthy.
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await portOpen(port)) return url;
  }
  return null;
}

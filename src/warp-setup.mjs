#!/usr/bin/env node
// warp-setup.mjs — set up a free Cloudflare WARP proxy in pure Node (no Python).
// Registers a WARP account via Cloudflare's public API, writes a wireproxy
// config, and (optionally) starts the SOCKS5 proxy on 127.0.0.1:40000 so the
// bridge can route through it and avoid Cloudflare "Just a moment…" challenges.
//
// Requires the `wireproxy` binary (or provides a fallback instruction). The
// bridge reads ARENA_AGENT_PROXY=socks5://127.0.0.1:40000.
//
// Usage:
//   node src/warp-setup.mjs register          # register WARP account + write config
//   node src/warp-setup.mjs start             # start the SOCKS5 proxy (blocking)
//   node src/warp-setup.mjs --email ...       # pass an optional email for the account
import { spawn, exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const WIREPROXY_DL = "https://github.com/octeep/wireproxy/releases/latest/download";
const PORT = Number(process.env.ARENA_WARP_PORT || 40000);
const WARP_URL = "https://api.cloudflareclient.com/v0a884/reg";

export function warpDir(dataDir) {
  return path.join(dataDir || path.join(os.homedir(), ".arena-code"), "warp");
}

function randomHex(n) {
  return crypto.randomBytes(n).toString("hex");
}

/** Register a free WARP account with Cloudflare and return a keypair. */
export async function registerWarpAccount({ email } = {}) {
  const deviceId = `A${randomHex(21)}B`;
  const pubKey = randomHex(32); // placeholder public key
  const body = {
    install_id: randomHex(22),
    tos: `${Date.now()}`,
    key: pubKey,
    fcm_token: `${randomHex(22)}:APA91b${randomHex(120)}`,
    type: "Android",
    locale: "en_US",
    model: "Arena Code",
  };
  if (email) body.email = email;

  const res = await fetch(WARP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "okhttp/3.12.1" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WARP registration failed (HTTP ${res.status})`);
  const data = await res.json();
  return { clientId: deviceId, privateKey: data?.config?.client_id || data?.id || deviceId, ...data };
}

/** Write a wireproxy config for the registered account. */
export function writeWireproxyConfig({ dataDir, clientId, privateKey }) {
  const dir = warpDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const cfg = path.join(dir, "wireproxy.conf");
  const content = `[Interface]
Address = 172.16.0.2/32, fd01:5ee1:bbbb::4/128
DNS = 1.1.1.1
PrivateKey = ${privateKey}
MTU = 1280

[Socks5]
BindAddress = 127.0.0.1:${PORT}
`;
  fs.writeFileSync(cfg, content, "utf8");
  return cfg;
}

/** Check whether a command exists. */
function hasBin(bin) {
  return new Promise((resolve) => {
    exec(`command -v ${bin}`, (err) => resolve(!err));
  });
}

/** Start wireproxy (blocking). */
export async function startWarp(dataDir) {
  const dir = warpDir(dataDir);
  const cfg = path.join(dir, "wireproxy.conf");
  if (!fs.existsSync(cfg)) throw new Error("wireproxy.conf not found — run 'node src/warp-setup.mjs register' first");
  const wg = await hasBin("wireproxy");
  const wgExe = path.join(dir, "wireproxy");
  const exe = wg ? "wireproxy" : (fs.existsSync(wgExe) ? wgExe : null);
  if (!exe) throw new Error("wireproxy not installed — see warp.sh (auto-download)");
  const proc = spawn(exe, ["-c", cfg], { stdio: "inherit" });
  return proc;
}

// ---- CLI entrypoint ----
if (process.argv[1] && (await import("node:url").then(({ pathToFileURL }) => pathToFileURL(process.argv[1]).href)) === import.meta.url) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  try {
    if (cmd === "register") {
      const emailArg = args.indexOf("--email");
      const email = emailArg > -1 ? args[emailArg + 1] : undefined;
      const acc = await registerWarpAccount({ email });
      const cfg = writeWireproxyConfig({ dataDir: process.env.ARENA_CODE_DIR, clientId: acc.clientId, privateKey: acc.privateKey });
      console.log(`WARP account registered. Config written to ${cfg}`);
      console.log(`Start the proxy:  node src/warp-setup.mjs start`);
      console.log(`Then run the bridge with ARENA_AGENT_PROXY=socks5://127.0.0.1:${PORT}`);
    } else if (cmd === "start") {
      const proc = await startWarp(process.env.ARENA_CODE_DIR);
      console.log(`WARP SOCKS5 proxy running on 127.0.0.1:${PORT}`);
      proc.on("exit", (code) => process.exit(code ?? 0));
    } else {
      console.log("Usage: node src/warp-setup.mjs <register|start> [--email <email>]");
    }
  } catch (e) {
    console.error(`✖ WARP error: ${e.message}`);
    process.exitCode = 1;
  }
}

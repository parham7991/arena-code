#!/usr/bin/env node
// warp-setup.mjs — register a FREE Cloudflare WARP account (pure Node) and
// write a wireproxy config exposing a SOCKS5 proxy on 127.0.0.1:40000.
// Same technique as the reference arena-account-bridge warp-setup (and the
// official 1.1.1.1 clients): generate a real X25519 keypair and POST to the
// current Cloudflare registration endpoint.
//
//   node src/warp-setup.mjs register [--email x] [--port 40000] [--out conf]
//   node src/warp-setup.mjs start
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, exec } from "node:child_process";

const REG_URL = "https://api.cloudflareclient.com/v0a2159/reg";
const DEFAULT_PORT = Number(process.env.ARENA_WARP_PORT || 40000);

function b64(buf) {
  return Buffer.from(buf).toString("base64");
}

/** Generate an X25519 keypair and return WireGuard-style base64 keys. */
export function generateWgKeys() {
  const kp = crypto.generateKeyPairSync("x25519");
  const pubRaw = kp.publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const privRaw = kp.privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32);
  return { privateKey: b64(privRaw), publicKey: b64(pubRaw) };
}

export function warpDir(dataDir) {
  return path.join(dataDir || path.join(os.homedir(), ".arena-code"), "warp");
}

/** Register a free WARP account. Returns account + peer config. */
export async function registerWarpAccount({ email } = {}) {
  const keys = generateWgKeys();
  const body = {
    key: keys.publicKey,
    install_id: "",
    fcm_token: "",
    referrer: "",
    warp_enabled: true,
    tos: "2020-06-12T00:00:00.000Z",
  };
  if (email) body.email = email;

  const res = await fetch(REG_URL, {
    method: "POST",
    headers: { "User-Agent": "okhttp/3.12.1", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { config: null, errors: [{ message: "non-JSON response" }] };
  }
  const cfg = data?.config;
  if (!res.ok || !cfg?.interface?.addresses?.v4) {
    const errMsg = data?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(`WARP registration failed: ${errMsg}`);
  }
  return {
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    accountId: data.account?.id || data.id,
    clientId: cfg.client_id,
    addressV4: cfg.interface.addresses.v4,
    addressV6: cfg.interface.addresses.v6,
    peerPublicKey: cfg.peers?.[0]?.public_key,
    peerEndpoint: cfg.peers?.[0]?.endpoint?.host || "engage.cloudflareclient.com:2408",
  };
}

/** Write a wireproxy config for the registered account. */
export function writeWireproxyConfig({ dataDir, reg, port = DEFAULT_PORT }) {
  const dir = warpDir(dataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const out = path.join(dir, "wireproxy.conf");
  const conf = [
    "[Interface]",
    `Address = ${reg.addressV4}/32`,
    `PrivateKey = ${reg.privateKey}`,
    "DNS = 1.1.1.1",
    "MTU = 1280",
    "",
    "[Peer]",
    `PublicKey = ${reg.peerPublicKey}`,
    `Endpoint = ${reg.peerEndpoint}`,
    "AllowedIPs = 0.0.0.0/0",
    "",
    "[Socks5]",
    `BindAddress = 127.0.0.1:${port}`,
    "",
  ].join("\n");
  fs.writeFileSync(out, conf, { mode: 0o600 });
  return out;
}

function hasBin(bin) {
  return new Promise((resolve) => exec(`command -v ${bin}`, (e) => resolve(!e)));
}

/** Start wireproxy (blocking). */
export async function startWarp(dataDir) {
  const dir = warpDir(dataDir);
  const cfg = path.join(dir, "wireproxy.conf");
  if (!fs.existsSync(cfg)) throw new Error("wireproxy.conf not found — run 'node src/warp-setup.mjs register' first");
  const wg = await hasBin("wireproxy");
  const wgExe = path.join(dir, "wireproxy");
  const exe = wg ? "wireproxy" : fs.existsSync(wgExe) ? wgExe : null;
  if (!exe) throw new Error("wireproxy not installed — see warp.sh (auto-download)");
  return spawn(exe, ["-c", cfg], { stdio: "inherit" });
}

// ---- CLI entrypoint ----
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (cmd === "register") {
    const reg = await registerWarpAccount({ email: get("--email") });
    const out = writeWireproxyConfig({ dataDir: process.env.ARENA_CODE_DIR, reg, port: Number(get("--port") || DEFAULT_PORT) });
    console.log(`WARP account registered. Config written to ${out}`);
    console.log(`Start the proxy:  node src/warp-setup.mjs start`);
    console.log(`Then run the bridge with ARENA_AGENT_PROXY=socks5://127.0.0.1:${DEFAULT_PORT}`);
  } else if (cmd === "start") {
    const proc = await startWarp(process.env.ARENA_CODE_DIR);
    console.log(`WARP SOCKS5 proxy running on 127.0.0.1:${DEFAULT_PORT}`);
    proc.on("exit", (code) => process.exit(code ?? 0));
  } else {
    console.log("Usage: node src/warp-setup.mjs <register|start> [--email <email>] [--port <port>]");
  }
}

// Detect direct execution robustly (handles relative + absolute argv[1]).
const isDirectRun =
  process.argv[1] &&
  (import.meta.url.endsWith(path.basename(process.argv[1])) ||
    import.meta.url === new URL(`file://${process.argv[1]}`).href);
if (isDirectRun) {
  main().catch((e) => { console.error(`✖ WARP error: ${e.message}`); process.exit(1); });
}

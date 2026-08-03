import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

import { findBridgeDirs, bridgeEnv, findRunningBridge } from "../src/auto-bridge.mjs";

function startMockBridge(port) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port })));
}

test("bridgeEnv parses the bridge .env file", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-be-"));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, ".env"), "PORT=20999\nARENA_AGENT_BRIDGE_KEY=abc123\n");
  const env = bridgeEnv(dataDir);
  assert.equal(env.PORT, "20999");
  assert.equal(env.ARENA_AGENT_BRIDGE_KEY, "abc123");
  assert.equal(env.DATA_DIR, dataDir);
});

test("findBridgeDirs returns an array", () => {
  assert.ok(Array.isArray(findBridgeDirs()));
});

test("findRunningBridge finds a healthy bridge when given its URL", async () => {
  const { server, port } = await startMockBridge(20156);
  try {
    const found = await findRunningBridge({ bridgeUrl: `http://127.0.0.1:${port}` });
    assert.equal(found, `http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("findRunningBridge returns the unreachable URL's port result only when nothing found", async () => {
  // A URL that is definitely not listening: it will be skipped and the function
  // scans candidates; if a leftover bridge exists it may find it, so we only
  // assert the shape (string URL or null), not a specific value.
  const found = await findRunningBridge({ bridgeUrl: "http://127.0.0.1:19999" });
  assert.ok(found === null || /^http:\/\/127\.0\.0\.1:\d+$/.test(found));
});

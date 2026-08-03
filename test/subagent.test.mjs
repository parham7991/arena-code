import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createMockBridge } from "./mock-bridge.mjs";
import { BridgeClient } from "../src/bridge.mjs";
import { spawnSubAgent, runSubAgents } from "../src/subagent.mjs";
import { getToolSchemas } from "../src/tools/registry.mjs";

const PORT = 20181;
let bridge;
let client;
let projectRoot;

before(async () => {
  bridge = createMockBridge({ port: PORT, token: "k" });
  await bridge.start();
  client = new BridgeClient({ url: `http://127.0.0.1:${PORT}`, apiKey: "k", timeoutMs: 10_000 });
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arena-subagent-"));
});

after(async () => {
  await bridge.close();
});

test("spawnSubAgent runs with its own session id and returns content", async () => {
  const r = await spawnSubAgent({
    task: "Create a file",
    bridgeClient: client,
    tools: getToolSchemas(),
    ctx: { cwd: projectRoot, projectRoot },
    name: "analyst",
    maxTurns: 10,
  });
  assert.match(r.sessionId, /^sub-analyst-/);
  assert.equal(r.status, "done");
  assert.ok(fs.existsSync(path.join(projectRoot, "output.txt")));
});

test("runSubAgents runs multiple tasks in parallel with distinct sessions", async () => {
  const tasks = [
    { name: "a", task: "task a" },
    { name: "b", task: "task b" },
    { name: "c", task: "task c" },
  ];
  const results = await runSubAgents(tasks, { bridgeClient: client, tools: getToolSchemas(), ctx: { cwd: projectRoot, projectRoot }, maxTurns: 10, maxConcurrent: 3 });
  assert.equal(results.length, 3);
  const ids = results.map((r) => r.sessionId);
  assert.equal(new Set(ids).size, 3, "each sub-agent must have a distinct session id");
});

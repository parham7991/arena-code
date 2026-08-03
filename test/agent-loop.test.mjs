import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createMockBridge } from "./mock-bridge.mjs";
import { BridgeClient } from "../src/bridge.mjs";
import { runAgent } from "../src/agent.mjs";
import { getToolSchemas } from "../src/tools/registry.mjs";

const PORT = 20151;
let bridge;
let projectRoot;
let client;

before(async () => {
  bridge = createMockBridge({ port: PORT, token: "test-key" });
  await bridge.start();
  client = new BridgeClient({ url: `http://127.0.0.1:${PORT}`, apiKey: "test-key", timeoutMs: 10_000 });
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arena-code-agent-"));
});

after(async () => {
  await bridge.close();
});

test("healthcheck returns ok", async () => {
  const h = await client.healthcheck();
  assert.equal(h.ok, true);
});

test("agent loop runs a tool then finishes", async () => {
  const messages = [{ role: "user", content: "Write a file called output.txt" }];
  const toolEvents = [];
  const contents = [];

  const result = await runAgent({
    messages,
    tools: getToolSchemas(),
    bridgeClient: client,
    maxTurns: 10,
    ctx: { cwd: projectRoot, projectRoot },
    onContent: (c) => contents.push(c),
    onToolCall: ({ name }) => toolEvents.push(`call:${name}`),
    onToolResult: ({ name, result: r }) => toolEvents.push(`result:${name}:${r.ok === true}`),
  });

  // The Write tool should have executed locally.
  const outPath = path.join(projectRoot, "output.txt");
  assert.ok(fs.existsSync(outPath), "output.txt should exist");
  assert.equal(fs.readFileSync(outPath, "utf8"), "hello from arena");

  // The final answer should have been surfaced.
  assert.equal(result.status, "done");
  assert.ok(contents.some((c) => /All done/.test(c)));
  assert.ok(toolEvents.includes("call:Write"));
  assert.ok(toolEvents.includes("result:Write:true"));
});

test("agent loop respects maxTurns when model never stops", async () => {
  // A fake bridge client that always returns tool_calls (never stops).
  const neverStops = {
    async chat() {
      return {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "x", type: "function", function: { name: "Glob", arguments: '{"pattern":"*.mjs"}' } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      };
    },
  };

  const result = await runAgent({
    messages: [{ role: "user", content: "hi" }],
    tools: getToolSchemas(),
    bridgeClient: neverStops,
    maxTurns: 3,
    ctx: { cwd: projectRoot, projectRoot },
  });
  assert.equal(result.status, "max_turns");
  assert.equal(result.turns, 3);
});

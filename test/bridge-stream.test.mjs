import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createMockBridge } from "./mock-bridge.mjs";
import { BridgeClient, parseSSEBlock } from "../src/bridge.mjs";
import { runAgent, accumulateStream } from "../src/agent.mjs";
import { getToolSchemas } from "../src/tools/registry.mjs";

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "arena-code-stream-"));
}

test("parseSSEBlock handles data lines and [DONE]", () => {
  const block = 'data: {"a":1}\n\ndata: [DONE]\n';
  const events = parseSSEBlock(block);
  assert.equal(events[0].a, 1);
  assert.equal(events[1], "[DONE]");
});

test("accumulateStream merges partial tool_calls", () => {
  const acc = { content: "", reasoning: "", toolCalls: [], finishReason: "stop" };
  accumulateStream(acc, {
    choices: [{ index: 0, delta: { content: "hi", tool_calls: [{ index: 0, id: "x", function: { name: "Write", arguments: '{"file' } }] } }],
  });
  accumulateStream(acc, {
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '_path":"a.txt"}' } }] } }],
  });
  accumulateStream(acc, { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  assert.equal(acc.content, "hi");
  assert.equal(acc.toolCalls[0].function.name, "Write");
  assert.equal(acc.toolCalls[0].function.arguments, '{"file_path":"a.txt"}');
  assert.equal(acc.finishReason, "tool_calls");
});

test("bridge retries on 429 with Retry-After then succeeds", async () => {
  const bridge = createMockBridge({ port: 20161, token: "k", failFirstStatus: 429, failFirstRetryAfter: 0, failFirstCount: 2 });
  await bridge.start();
  const client = new BridgeClient({ url: "http://127.0.0.1:20161", apiKey: "k", maxRetries: 4, timeoutMs: 5000 });
  try {
    const resp = await client.chat({ messages: [{ role: "user", content: "x" }], tools: getToolSchemas() });
    assert.ok(resp.choices);
    assert.ok(bridge.calls.total >= 3, `expected at least 3 calls, got ${bridge.calls.total}`);
  } finally {
    await bridge.close();
  }
});

test("chatStream yields content chunks and a streamed tool call", async () => {
  const bridge = createMockBridge({ port: 20162, token: "k" });
  await bridge.start();
  const client = new BridgeClient({ url: "http://127.0.0.1:20162", apiKey: "k", timeoutMs: 5000 });
  try {
    const chunks = [];
    for await (const c of client.chatStream({ messages: [{ role: "user", content: "write a file" }], tools: getToolSchemas() })) {
      chunks.push(c);
    }
    const texts = chunks.filter((c) => c !== "[DONE]").map((c) => c?.choices?.[0]?.delta?.content).filter(Boolean);
    assert.ok(texts.some((t) => t.includes("write a file")));
    assert.ok(chunks.includes("[DONE]"));
  } finally {
    await bridge.close();
  }
});

test("agent loop with stream=true runs a tool and finishes, invoking onChunk", async () => {
  const projectRoot = tempProject();
  const bridge = createMockBridge({ port: 20163, token: "k" });
  await bridge.start();
  const client = new BridgeClient({ url: "http://127.0.0.1:20163", apiKey: "k", timeoutMs: 5000 });
  try {
    const chunks = [];
    const toolEvents = [];
    const result = await runAgent({
      messages: [{ role: "user", content: "Write a file called output.txt" }],
      tools: getToolSchemas(),
      bridgeClient: client,
      maxTurns: 10,
      stream: true,
      ctx: { cwd: projectRoot, projectRoot },
      onChunk: (c) => chunks.push(c),
      onToolCall: ({ name }) => toolEvents.push(`call:${name}`),
      onToolResult: ({ name, result: r }) => toolEvents.push(`result:${name}:${r.ok === true}`),
    });

    assert.equal(fs.readFileSync(path.join(projectRoot, "output.txt"), "utf8"), "hello from arena");
    assert.equal(result.status, "done");
    assert.ok(toolEvents.includes("call:Write"));
    assert.ok(toolEvents.includes("result:Write:true"));
    assert.ok(chunks.length > 0, "onChunk should have received content deltas");
    // The streamed tool_call arguments must be reassembled correctly.
    assert.ok(fs.existsSync(path.join(projectRoot, "output.txt")));
  } finally {
    await bridge.close();
  }
});

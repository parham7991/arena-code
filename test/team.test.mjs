import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createMockBridge } from "./mock-bridge.mjs";
import { BridgeClient } from "../src/bridge.mjs";
import { TeamLeader, parsePlan, runTeam } from "../src/team.mjs";
import { getToolSchemas } from "../src/tools/registry.mjs";

const PORT = 20171;
let bridge;
let client;
let projectRoot;

before(async () => {
  bridge = createMockBridge({ port: PORT, token: "test-key" });
  await bridge.start();
  client = new BridgeClient({ url: `http://127.0.0.1:${PORT}`, apiKey: "test-key", timeoutMs: 10_000 });
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arena-team-"));
});

after(async () => {
  await bridge.close();
});

test("parsePlan extracts a JSON array from plain JSON", () => {
  const plan = parsePlan('[{"name":"a","task":"do a"},{"name":"b","task":"do b"}]');
  assert.equal(plan.length, 2);
  assert.equal(plan[0].name, "a");
  assert.equal(plan[1].task, "do b");
});

test("parsePlan strips code fences and surrounding text", () => {
  const plan = parsePlan('Here you go:\n```json\n[{"name":"x","task":"do x"}]\n```\nEnjoy!');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].task, "do x");
});

test("parsePlan returns null for invalid/empty input", () => {
  assert.equal(parsePlan(""), null);
  assert.equal(parsePlan("not json"), null);
  assert.equal(parsePlan("{}"), null);
});

test("parsePlan drops items without a task and falls back gracefully", () => {
  const plan = parsePlan('[{"name":"a","task":"ok"},{"name":"b"}]');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].name, "a");
});

test("TeamLeader breaks a task, spawns sub-agents with distinct sessions, and merges", async () => {
  const leader = new TeamLeader({ bridge: client, tools: getToolSchemas(), ctx: { cwd: projectRoot, projectRoot }, maxTurns: 10, concurrency: 2 });
  const events = { plan: null, subStarts: [], subResults: [], synthesis: "" };

  const result = await leader.run("Build a small web app", {
    onPlan: (p) => (events.plan = p),
    onSubStart: (s) => events.subStarts.push(s.name),
    onSubResult: (r) => events.subResults.push(r),
    onSynthesis: (t) => (events.synthesis = t),
  });

  // Plan had 2 sub-tasks from the mock.
  assert.equal(events.plan.length, 2);
  assert.equal(result.plan.length, 2);
  assert.equal(result.results.length, 2);

  // Each sub-agent ran its own session id (distinct, x-codex-session-id).
  const ids = result.results.map((r) => r.sessionId);
  assert.equal(new Set(ids).size, 2, "sub-agents must have distinct session ids");
  assert.ok(bridge.calls.sessionIds.length >= 2);
  for (const id of ids) assert.ok(bridge.calls.sessionIds.includes(id), `session ${id} should have been used`);

  // Each sub-agent actually ran a tool (Write wrote output.txt locally).
  assert.ok(fs.existsSync(path.join(projectRoot, "output.txt")), "sub-agent tool should have run");

  // Merged synthesis produced.
  assert.match(result.finalReport, /MOCK-MERGED/);
  assert.match(events.synthesis, /MOCK-MERGED/);
  assert.equal(result.status, "done");
});

test("runTeam convenience wrapper returns a merged result", async () => {
  const result = await runTeam({
    task: "Add a header and a footer",
    bridge: client,
    ctx: { cwd: projectRoot, projectRoot },
    maxTurns: 10,
    concurrency: 2,
  });
  assert.equal(result.plan.length, 2);
  assert.equal(result.results.length, 2);
  assert.match(result.finalReport, /MOCK-MERGED/);
});

test("plan() falls back to a single sub-task when planning fails", async () => {
  const failing = {
    async chat() {
      return { choices: [{ message: { role: "assistant", content: "I cannot plan that." }, finish_reason: "stop" }] };
    },
  };
  const leader = new TeamLeader({ bridge: failing, tools: [], ctx: {}, maxTurns: 1 });
  const plan = await leader.plan("Do something");
  assert.equal(plan.length, 1);
  assert.equal(plan[0].name, "main");
  assert.equal(plan[0].task, "Do something");
});

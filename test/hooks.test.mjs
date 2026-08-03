import { test } from "node:test";
import assert from "node:assert/strict";
import { hookBus, resetHooks, EVENTS } from "../src/hooks.mjs";

test("hookBus on/off registers and removes handlers", async () => {
  resetHooks();
  let calls = 0;
  const id = hookBus.on("onToolBefore", () => { calls += 1; });
  await hookBus.emit("onToolBefore", {});
  assert.equal(calls, 1);
  hookBus.off("onToolBefore", id);
  await hookBus.emit("onToolBefore", {});
  assert.equal(calls, 1, "handler should be removed after off");
});

test("hookBus runs handlers in priority order", async () => {
  resetHooks();
  const order = [];
  hookBus.on("onToolAfter", () => { order.push(50); }, { priority: 50 });
  hookBus.on("onToolAfter", () => { order.push(10); }, { priority: 10 });
  hookBus.on("onToolAfter", () => { order.push(100); }, { priority: 100 });
  await hookBus.emit("onToolAfter", {});
  assert.deepEqual(order, [10, 50, 100]);
});

test("hookBus transform: handler can mutate data", async () => {
  resetHooks();
  hookBus.on("onToolBefore", (data) => { data.tool = "Write"; });
  const data = await hookBus.emit("onToolBefore", { tool: "Read" });
  assert.equal(data.tool, "Write");
});

test("hookBus rejects unknown events", () => {
  assert.throws(() => hookBus.on("onNope", () => {}), /Unknown hook event/);
});

test("EVENTS contains the documented set", () => {
  for (const e of ["onSessionStart", "onSessionEnd", "onToolBefore", "onToolAfter", "onSkillStart", "onError", "onExternalChange"]) {
    assert.ok(EVENTS.includes(e), e);
  }
});

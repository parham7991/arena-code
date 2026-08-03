import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionStore, projectHash, sessionsDir } from "../src/session.mjs";

function makeStore() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-code-sess-"));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arena-code-proj-"));
  return { store: new SessionStore({ dataDir, projectRoot }), dataDir, projectRoot };
}

test("projectHash is stable and short", () => {
  const a = projectHash("/tmp/foo");
  const b = projectHash("/tmp/foo");
  assert.equal(a, b);
  assert.ok(a.length === 16);
});

test("dump then load round-trips messages", () => {
  const { store } = makeStore();
  const messages = [
    { role: "system", content: "sys" },
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello", tool_calls: [] },
  ];
  const saved = store.dump("s-123", messages);
  assert.equal(saved.count, 3);
  assert.ok(fs.existsSync(saved.file));

  const loaded = store.load("s-123");
  assert.equal(loaded.id, "s-123");
  assert.deepEqual(loaded.messages, messages);
});

test("load of a missing session returns empty messages", () => {
  const { store } = makeStore();
  const loaded = store.load("does-not-exist");
  assert.equal(loaded.id, "does-not-exist");
  assert.deepEqual(loaded.messages, []);
});

test("list and last() return the most recent session", async () => {
  const { store } = makeStore();
  store.dump("s-old", [{ role: "user", content: "old" }]);
  await new Promise((r) => setTimeout(r, 10));
  store.dump("s-new", [{ role: "user", content: "new" }]);

  const ids = store.list();
  assert.deepEqual(ids.sort(), ["s-new", "s-old"]);

  const last = store.last();
  assert.equal(last.id, "s-new");
  assert.equal(last.messages[0].content, "new");
});

test("unrelated projects are namespaced separately", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-code-sess-"));
  const p1 = fs.mkdtempSync(path.join(os.tmpdir(), "p1-"));
  const p2 = fs.mkdtempSync(path.join(os.tmpdir(), "p2-"));
  const s1 = new SessionStore({ dataDir, projectRoot: p1 });
  const s2 = new SessionStore({ dataDir, projectRoot: p2 });
  s1.dump("x", [{ role: "user", content: "a" }]);
  assert.equal(s2.list().length, 0, "other project should see no sessions");
});

test("listSessions returns metadata newest-first", async () => {
  const { store } = makeStore();
  store.dump("s-old", [{ role: "user", content: "old" }]);
  await new Promise((r) => setTimeout(r, 10));
  store.dump("s-new", [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ]);

  const sessions = store.listSessions();
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, "s-new");
  assert.equal(sessions[0].messageCount, 2);
  assert.equal(sessions[1].id, "s-old");
  assert.ok(sessions[0].updatedAt >= sessions[1].updatedAt);
  assert.ok(fs.existsSync(sessions[0].file));
});

test("continueLast loads the most recent session", async () => {
  const { store } = makeStore();
  store.dump("s-1", [{ role: "user", content: "first" }]);
  await new Promise((r) => setTimeout(r, 10));
  store.dump("s-2", [{ role: "user", content: "second" }]);

  const resumed = store.continueLast();
  assert.equal(resumed.id, "s-2");
  assert.equal(resumed.messages[0].content, "second");
});

test("continueLast returns null when there are no sessions", () => {
  const { store } = makeStore();
  assert.equal(store.continueLast(), null);
});

test("sessionsDir is namespaced per project", () => {
  const p1 = "/tmp/proj-one";
  const p2 = "/tmp/proj-two";
  const d1 = sessionsDir("/tmp/data", p1);
  const d2 = sessionsDir("/tmp/data", p2);
  assert.notEqual(d1, d2);
  assert.ok(d1.includes(projectHash(p1)));
});

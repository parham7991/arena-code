import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement as h } from "react";
import { renderToString } from "ink";

import { Spinner } from "../src/ui/spinner.mjs";
import { ToolList, toolSummary } from "../src/ui/tools.mjs";
import { MultilineInput } from "../src/ui/multiline.mjs";
import { ArenaApp } from "../src/ui/app.mjs";

const engineStub = { run: async () => ({ messages: [] }) };

test("Spinner renders its label with an initial frame", () => {
  const out = renderToString(h(Spinner, { label: "Working…" }));
  assert.match(out, /Working…/);
  assert.ok(out.trim().length > 0);
});

test("toolSummary builds a short summary from args", () => {
  assert.equal(toolSummary("Write", { file_path: "src/a.mjs" }), "src/a.mjs");
  assert.equal(toolSummary("Bash", { command: "npm test" }), "npm test");
  assert.equal(toolSummary("Grep", { pattern: "TODO" }), "TODO");
  assert.equal(toolSummary("Read", {}), "");
});

test("ToolList shows running and done states", () => {
  const tools = [
    { id: "1", name: "Write", args: { file_path: "src/a.mjs" }, status: "running" },
    { id: "2", name: "Bash", args: { command: "npm test" }, status: "done", result: { ok: true, stdout: "ok" } },
  ];
  const out = renderToString(h(ToolList, { tools }));
  assert.match(out, /▶ Write/);
  assert.match(out, /✔ Bash/);
});

test("ToolList expands the tool whose id is expandedId", () => {
  const tools = [
    { id: "1", name: "Write", args: { file_path: "a.txt" }, status: "done", result: { ok: true, bytes: 5 } },
  ];
  const out = renderToString(h(ToolList, { tools, expandedId: "1" }));
  assert.match(out, /bytes/);
});

test("ToolList shows an error state for failed tools", () => {
  const tools = [{ id: "1", name: "Edit", args: {}, status: "error", result: { error: "old_text not found" } }];
  const out = renderToString(h(ToolList, { tools }));
  assert.match(out, /✖ Edit/);
});

test("MultilineInput renders prompt and current value", () => {
  const out = renderToString(h(MultilineInput, { value: "hello world", onSubmit: () => {} }));
  assert.match(out, /❯/);
  assert.match(out, /hello world/);
});

test("MultilineInput shows slash-command suggestions when typing /", () => {
  const commands = [
    { name: "help", description: "Show help" },
    { name: "compact", description: "Compress context" },
    { name: "clear", description: "Clear" },
  ];
  const out = renderToString(h(MultilineInput, { value: "/he", onChange: () => {}, commands, onSubmit: () => {} }));
  assert.match(out, /\/help/);
});

test("ArenaApp renders the header with session/project/autonomy", () => {
  const out = renderToString(h(ArenaApp, { engine: engineStub, sessionId: "s-abc", projectRoot: "/tmp/x", autonomy: "auto" }));
  assert.match(out, /Arena Code/);
  assert.match(out, /session s-abc/);
  assert.match(out, /cwd \/tmp\/x/);
  assert.match(out, /autonomy auto/);
});

test("ArenaApp shows the context token estimate in the header", () => {
  const engineWithTokens = { ...engineStub, tokenEstimate: () => 12_345 };
  const out = renderToString(h(ArenaApp, { engine: engineWithTokens, sessionId: "s-abc", projectRoot: "/tmp/x", autonomy: "ask" }));
  assert.match(out, /ctx 12,345 tok/);
});

test("ArenaApp shows zero tokens when tokenEstimate is unavailable", () => {
  const out = renderToString(h(ArenaApp, { engine: engineStub, sessionId: "s", projectRoot: "/tmp", autonomy: "ask" }));
  assert.match(out, /ctx 0 tok/);
});

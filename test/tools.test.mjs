import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeTool } from "../src/tools/write.mjs";
import { readTool } from "../src/tools/read.mjs";
import { editTool } from "../src/tools/edit.mjs";
import { bashTool } from "../src/tools/bash.mjs";
import { globTool } from "../src/tools/glob.mjs";
import { grepTool } from "../src/tools/grep.mjs";
import { runTool, getToolSchemas } from "../src/tools/registry.mjs";

function makeCtx() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arena-code-tools-"));
  return { projectRoot, cwd: projectRoot };
}

test("registry exposes OpenAI-style tool schemas", () => {
  const schemas = getToolSchemas();
  const names = schemas.map((t) => t.function.name);
  for (const n of ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "AskUserQuestion"]) {
    assert.ok(names.includes(n), `expected schema for ${n}`);
  }
  assert.ok(schemas.every((t) => t.type === "function"));
});

test("runTool returns error for unknown tool (not throw)", async () => {
  const res = await runTool("NoSuchTool", {}, makeCtx());
  assert.ok(res.error && res.error.includes("Unknown tool"));
});

test("Write then Read round-trips content", async () => {
  const ctx = makeCtx();
  const w = await writeTool.execute({ file_path: "src/hello.txt", content: "line1\nline2\nline3\n" }, ctx);
  assert.equal(w.ok, true);
  assert.ok(w.file_path.endsWith(path.join("src", "hello.txt")));
  assert.equal(w.bytes, Buffer.byteLength("line1\nline2\nline3\n", "utf8"));

  const r = await readTool.execute({ file_path: "src/hello.txt" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.content, "line1\nline2\nline3\n");

  // offset/limit slice (1-based)
  const slice = await readTool.execute({ file_path: "src/hello.txt", offset: 2, limit: 2 }, ctx);
  assert.equal(slice.ok, true);
  assert.equal(slice.content, "line2\nline3");
  assert.equal(slice.total_lines, 3);
});

test("Read on missing file returns a clear error", async () => {
  const ctx = makeCtx();
  const r = await readTool.execute({ file_path: "does-not-exist.txt" }, ctx);
  assert.ok(r.error && r.error.includes("Read failed"), "should return an error, got " + JSON.stringify(r));
});

test("Write creates parent directories", async () => {
  const ctx = makeCtx();
  const w = await writeTool.execute({ file_path: "a/b/c/deep.txt", content: "x" }, ctx);
  assert.equal(w.ok, true);
  assert.ok(fs.existsSync(path.join(ctx.projectRoot, "a/b/c/deep.txt")));
});

test("Edit replaces the first occurrence", async () => {
  const ctx = makeCtx();
  await writeTool.execute({ file_path: "app.js", content: "const a = 1;\nconst a = 2;\n" }, ctx);
  const e = await editTool.execute({ file_path: "app.js", old_text: "const a = 1;", new_text: "const b = 9;" }, ctx);
  assert.equal(e.ok, true);
  const after = await readTool.execute({ file_path: "app.js" }, ctx);
  assert.equal(after.content, "const b = 9;\nconst a = 2;\n");
});

test("Edit on missing old_text returns a clear error", async () => {
  const ctx = makeCtx();
  await writeTool.execute({ file_path: "app.js", content: "abc" }, ctx);
  const e = await editTool.execute({ file_path: "app.js", old_text: "zzz", new_text: "yyy" }, ctx);
  assert.ok(e.error && e.error.includes("old_text not found"), "should return an error, got " + JSON.stringify(e));
});

test("Bash runs echo and returns exit code 0", async () => {
  const ctx = makeCtx();
  const r = await bashTool.execute({ command: "echo hello-arena" }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /hello-arena/);
});

test("Bash surfaces a failing command exit code", async () => {
  const ctx = makeCtx();
  const r = await bashTool.execute({ command: "exit 3" }, ctx);
  assert.equal(r.exitCode, 3);
  assert.equal(r.ok, false);
});

test("Glob finds files recursively", async () => {
  const ctx = makeCtx();
  await writeTool.execute({ file_path: "src/a.mjs", content: "" }, ctx);
  await writeTool.execute({ file_path: "src/lib/b.mjs", content: "" }, ctx);
  await writeTool.execute({ file_path: "README.md", content: "" }, ctx);

  const g = await globTool.execute({ pattern: "src/**/*.mjs" }, ctx);
  assert.equal(g.ok, true);
  assert.deepEqual(g.matches.sort(), ["src/a.mjs", "src/lib/b.mjs"]);
});

test("Grep finds matching lines with line numbers", async () => {
  const ctx = makeCtx();
  await writeTool.execute(
    { file_path: "data.txt", content: "apple\nbanana\npineapple\n" },
    ctx
  );
  const g = await grepTool.execute({ pattern: "apple" }, ctx);
  assert.equal(g.ok, true);
  assert.deepEqual(g.matches, [
    { file: "data.txt", line: 1, text: "apple" },
    { file: "data.txt", line: 3, text: "pineapple" },
  ]);
});

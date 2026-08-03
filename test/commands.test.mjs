import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandRegistry } from "../src/commands/registry.mjs";
import { builtinCommands } from "../src/commands/index.mjs";
import { resetHooks } from "../src/hooks.mjs";

test("CommandRegistry parses /cmd args", () => {
  const reg = new CommandRegistry();
  const parsed = reg.parse("/skill code-review");
  assert.deepEqual(parsed, { name: "skill", args: ["code-review"] });
  assert.equal(reg.parse("not a command"), null);
});

test("CommandRegistry run dispatches to handler", async () => {
  const reg = new CommandRegistry();
  reg.register({ name: "greet", description: "g", handler: (args) => `hello ${args[0]}` });
  const res = await reg.run("/greet world", {});
  assert.equal(res, "hello world");
});

test("CommandRegistry returns error for unknown command", async () => {
  const reg = new CommandRegistry();
  const res = await reg.run("/nope", {});
  assert.equal(res.error, "Unknown command: /nope");
});

test("builtin commands include core set", () => {
  resetHooks();
  const names = builtinCommands().map((c) => c.name);
  for (const n of ["help", "compact", "clear", "quit", "skills", "skill", "plugins", "sessions", "diff", "theme", "lang", "config", "git", "review"]) {
    assert.ok(names.includes(n), `expected builtin command ${n}`);
  }
});

test("plugins command shows loaded plugins", async () => {
  resetHooks();
  const reg = new CommandRegistry();
  for (const c of builtinCommands()) reg.register(c);
  const res = await reg.run("/plugins", { plugins: [{ name: "git" }, { name: "snapshot" }] });
  assert.match(res, /git/);
  assert.match(res, /snapshot/);
});

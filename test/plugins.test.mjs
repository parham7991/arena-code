import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validatePlugin, definePlugin, normalizePlugin } from "../src/plugins/plugin-api.mjs";
import { PluginRegistry } from "../src/plugins/plugin-registry.mjs";
import { loadBuiltinPlugins, builtinPluginsDir } from "../src/plugins/plugin-loader.mjs";
import { loadPluginConfig, savePluginConfig } from "../src/plugins/plugin-config.mjs";
import { resetHooks } from "../src/hooks.mjs";

test("validatePlugin accepts a valid plugin", () => {
  const ok = validatePlugin({ name: "x", version: "1.0.0", tools: [], commands: [], skills: [], hooks: {} });
  assert.equal(ok.ok, true);
});

test("validatePlugin rejects missing name/version", () => {
  assert.equal(validatePlugin({ tools: [] }).ok, false);
  assert.equal(validatePlugin({ name: "x" }).ok, false);
});

test("normalizePlugin returns a stable shape", () => {
  const { ok, plugin } = normalizePlugin(definePlugin({ name: "p", version: "1.0.0", tools: [] }));
  assert.equal(ok, true);
  assert.ok(Array.isArray(plugin.tools));
  assert.ok(Array.isArray(plugin.commands));
  assert.ok(typeof plugin.hooks === "object");
  assert.ok(Array.isArray(plugin.skills));
});

test("PluginRegistry registers tools, commands, skills", () => {
  resetHooks();
  const reg = new PluginRegistry();
  reg.register(definePlugin({
    name: "p1",
    version: "1.0.0",
    tools: [{ schema: { name: "ToolA", parameters: { type: "object", properties: {} } }, execute: async () => ({}) }],
    commands: [{ name: "cmdA", description: "d", handler: () => "hi" }],
    skills: [{ name: "skillA", description: "s" }],
  }));
  assert.equal(reg.getAllTools().length, 1);
  assert.equal(reg.getAllCommands().length, 1);
  assert.equal(reg.getAllSkills().length, 1);
  assert.equal(reg.has("p1"), true);
});

test("built-in plugins load", async () => {
  resetHooks();
  const reg = new PluginRegistry();
  await loadBuiltinPlugins(reg);
  for (const name of ["git", "snapshot", "linter", "testing", "telemetry", "docker", "database", "ci", "web"]) {
    assert.ok(reg.has(name), `expected built-in plugin ${name}`);
  }
  // git exposes tools + commands
  const git = reg.getPlugin("git");
  assert.ok(git.tools.length >= 7);
  assert.ok(git.commands.length >= 3);
});

test("pluginConfig load/save round-trip", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "arena-plugin-cfg-"));
  savePluginConfig(proj, { enabled: ["git"], disabled: [], config: { git: { auto_commit: true } } });
  const cfg = loadPluginConfig(proj);
  assert.deepEqual(cfg.enabled, ["git"]);
  assert.equal(cfg.config.git.auto_commit, true);
});

test("builtinPluginsDir points to the built-in dir", () => {
  assert.ok(fs.existsSync(builtinPluginsDir()));
});

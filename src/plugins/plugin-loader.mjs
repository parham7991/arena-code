// plugin-loader.mjs — load plugins from three sources:
//   1. project: <root>/.arena-code/plugins/*.mjs
//   2. user:    ~/.arena-code/plugins/*.mjs
//   3. npm:     arena-code-plugin-* installed in node_modules
// Each plugin must export default { name, ... }. Built-in plugins are always
// loaded and can be disabled via .arena-code/plugins.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizePlugin } from "./plugin-api.mjs";
import { loadPluginConfig } from "./plugin-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = path.join(__dirname, "built-in");

async function importModule(url) {
  try {
    const mod = await import(url);
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function loadFromDir(dir) {
  const loaded = [];
  if (!fs.existsSync(dir)) return loaded;
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return loaded;
  }
  for (const f of files) {
    if (!f.endsWith(".mjs")) continue;
    const plugin = await importModule(pathToFileURL(path.join(dir, f)).href);
    if (plugin) loaded.push(plugin);
  }
  return loaded;
}

async function loadNpmPlugins(rootDir) {
  const out = [];
  const nm = path.join(rootDir, "node_modules");
  if (!fs.existsSync(nm)) return out;
  let names;
  try {
    names = fs.readdirSync(nm);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.startsWith("arena-code-plugin-")) continue;
    const plugin = await importModule(pathToFileURL(path.join(nm, name, "index.mjs")).href);
    if (plugin) out.push(plugin);
  }
  return out;
}

/**
 * Load all plugins (built-in + user + project + npm), respecting the enabled /
 * disabled lists in .arena-code/plugins.json. Returns { registry, errors }.
 */
export async function loadPlugins({ projectRoot, dataDir, registry }) {
  const cfg = loadPluginConfig(projectRoot);
  const disabled = new Set(cfg.disabled);
  const enabledOnly = cfg.enabled.length ? new Set(cfg.enabled) : null;
  const errors = [];

  const sources = [
    { dir: BUILTIN_DIR, kind: "built-in" },
    { dir: path.join(dataDir || path.join(os.homedir(), ".arena-code"), "plugins"), kind: "user" },
    { dir: projectRoot ? path.join(projectRoot, ".arena-code", "plugins") : null, kind: "project" },
  ];

  for (const src of sources) {
    if (!src.dir) continue;
    const plugins = await loadFromDir(src.dir);
    for (const p of plugins) {
      const n = normalizePlugin(p);
      if (!n.ok) {
        errors.push({ source: src.kind, errors: n.errors });
        continue;
      }
      const plugin = n.plugin;
      if (disabled.has(plugin.name)) continue;
      if (enabledOnly && !enabledOnly.has(plugin.name)) continue;
      registry.register(plugin);
      if (typeof plugin.onInit === "function") {
        try {
          await plugin.onInit({ config: cfg, projectRoot });
        } catch (e) {
          errors.push({ source: src.kind, plugin: plugin.name, initError: e.message });
        }
      }
    }
  }

  // npm plugins
  const npmPlugins = await loadNpmPlugins(projectRoot);
  for (const p of npmPlugins) {
    const n = normalizePlugin(p);
    if (!n.ok) {
      errors.push({ source: "npm", errors: n.errors });
      continue;
    }
    const plugin = n.plugin;
    if (disabled.has(plugin.name)) continue;
    if (enabledOnly && !enabledOnly.has(plugin.name)) continue;
    registry.register(plugin);
  }

  return { registry, errors };
}

/** Load only the built-in plugins into a registry. */
export async function loadBuiltinPlugins(registry) {
  const plugins = await loadFromDir(BUILTIN_DIR);
  for (const p of plugins) {
    const n = normalizePlugin(p);
    if (n.ok) registry.register(n.plugin);
  }
  return registry;
}

export function builtinPluginsDir() {
  return BUILTIN_DIR;
}

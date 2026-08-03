// plugin-api.mjs — plugin schema, validation, and the default plugin object.
// Every plugin must export default { name, version, ... } matching validatePlugin.

export function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== "object") {
    return { ok: false, errors: ["plugin must be an object"] };
  }
  const errors = [];
  if (typeof plugin.name !== "string" || !plugin.name.trim()) errors.push("name (string) is required");
  if (typeof plugin.version !== "string") errors.push("version (string) is required");
  if (plugin.description !== undefined && typeof plugin.description !== "string") errors.push("description must be a string");
  if (plugin.tools !== undefined && !Array.isArray(plugin.tools)) errors.push("tools must be an array");
  if (plugin.commands !== undefined && !Array.isArray(plugin.commands)) errors.push("commands must be an array");
  if (plugin.skills !== undefined && !Array.isArray(plugin.skills)) errors.push("skills must be an array");
  if (plugin.hooks !== undefined && typeof plugin.hooks !== "object") errors.push("hooks must be an object");
  if (plugin.middleware !== undefined && !Array.isArray(plugin.middleware)) errors.push("middleware must be an array");
  for (const fn of ["onInit", "onDestroy", "onConfig"]) {
    if (plugin[fn] != null && typeof plugin[fn] !== "function") errors.push(`${fn} must be a function`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/** Normalize a plugin to a stable shape with defaults. */
export function normalizePlugin(raw) {
  const v = validatePlugin(raw);
  if (!v.ok) return { ok: false, plugin: null, errors: v.errors };
  return {
    ok: true,
    plugin: {
      name: raw.name,
      version: raw.version,
      description: raw.description || "",
      tools: Array.isArray(raw.tools) ? raw.tools : [],
      commands: Array.isArray(raw.commands) ? raw.commands : [],
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      hooks: raw.hooks || {},
      middleware: Array.isArray(raw.middleware) ? raw.middleware : [],
      onInit: raw.onInit,
      onDestroy: raw.onDestroy,
      onConfig: raw.onConfig,
    },
    errors: [],
  };
}

/** Convenience: create a minimal plugin object. */
export function definePlugin(def) {
  return { tools: [], commands: [], skills: [], hooks: {}, middleware: [], onInit: null, onDestroy: null, onConfig: null, ...def };
}

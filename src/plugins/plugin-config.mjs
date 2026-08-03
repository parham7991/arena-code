// plugin-config.mjs — load/save plugin configuration from .arena-code/plugins.json.
import fs from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG = { enabled: [], disabled: [], config: {} };

export function pluginConfigPath(projectRoot) {
  return path.join(projectRoot, ".arena-code", "plugins.json");
}

export function loadPluginConfig(projectRoot) {
  const file = pluginConfigPath(projectRoot);
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        enabled: Array.isArray(parsed.enabled) ? parsed.enabled : [],
        disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
        config: parsed.config || {},
      };
    }
  } catch {
    /* fall through to default */
  }
  return { ...DEFAULT_CONFIG, enabled: [], disabled: [], config: {} };
}

export function savePluginConfig(projectRoot, cfg) {
  const file = pluginConfigPath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), "utf8");
  return file;
}

/** Per-plugin config helper. */
export function pluginSettings(projectRoot, name) {
  const cfg = loadPluginConfig(projectRoot);
  return cfg.config[name] || {};
}

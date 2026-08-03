// plugin-registry.mjs — in-memory registry of loaded plugins and their
// aggregated tools, commands, skills, and hooks.
import { hookBus } from "../hooks.mjs";

export class PluginRegistry {
  constructor() {
    this.plugins = new Map(); // name -> plugin
    this.tools = new Map(); // toolName -> {schema, execute}
    this.commands = new Map(); // cmdName -> {name, description, handler}
    this.skills = new Map(); // skillName -> skill
  }

  register(plugin) {
    if (!plugin || this.plugins.has(plugin.name)) return false;
    this.plugins.set(plugin.name, plugin);

    for (const tool of plugin.tools || []) {
      if (tool?.schema?.name) this.tools.set(tool.schema.name, tool);
    }
    for (const cmd of plugin.commands || []) {
      if (cmd?.name) this.commands.set(cmd.name, cmd);
    }
    for (const skill of plugin.skills || []) {
      if (skill?.name) this.skills.set(skill.name, skill);
    }
    // register hooks
    for (const [event, handler] of Object.entries(plugin.hooks || {})) {
      if (typeof handler === "function") hookBus.on(event, handler, { priority: 50 });
    }
    return true;
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  getAllTools() {
    return [...this.tools.values()];
  }

  getAllCommands() {
    return [...this.commands.values()];
  }

  getAllSkills() {
    return [...this.skills.values()];
  }

  has(name) {
    return this.plugins.has(name);
  }
}

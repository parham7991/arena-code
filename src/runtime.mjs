// runtime.mjs — build the runtime context (config, i18n, theme, plugins,
// skills, commands, tools) shared by the CLI and TUI.
import { loadConfig } from "./config.mjs";
import { getI18n } from "./i18n.mjs";
import { loadTheme } from "./theme.mjs";
import { resetHooks, hookBus } from "./hooks.mjs";
import { PluginRegistry } from "./plugins/plugin-registry.mjs";
import { loadPlugins } from "./plugins/plugin-loader.mjs";
import { loadSkills } from "./skills/skill-loader.mjs";
import { runSkill } from "./skills/skill-runner.mjs";
import { CommandRegistry } from "./commands/registry.mjs";
import { builtinCommands } from "./commands/index.mjs";
import { getToolSchemas } from "./tools/registry.mjs";

export async function createRuntime({ env = process.env, overrides = {} } = {}) {
  const config = loadConfig(env, overrides);
  resetHooks();
  const i18n = getI18n(config.lang);
  const theme = loadTheme(config.theme, config.dataDir);

  // Plugins
  const pluginRegistry = new PluginRegistry();
  const { errors: pluginErrors } = await loadPlugins({
    projectRoot: overrides.cwd || process.cwd(),
    dataDir: config.dataDir,
    registry: pluginRegistry,
  });
  const pluginList = [...pluginRegistry.plugins.values()];

  // Tools: built-in + plugin tools
  const baseTools = getToolSchemas();
  const pluginTools = pluginRegistry.getAllTools().map((t) => ({ type: "function", function: t.schema }));
  const tools = [...baseTools, ...pluginTools];

  // Skills: built-in + user + project + plugin
  const skills = loadSkills({ projectRoot: overrides.cwd || process.cwd(), dataDir: config.dataDir });
  for (const s of pluginRegistry.getAllSkills()) skills.set(s.name, s);

  // Commands: built-in + plugin
  const commandRegistry = new CommandRegistry();
  for (const c of builtinCommands()) commandRegistry.register(c);
  for (const c of pluginRegistry.getAllCommands()) commandRegistry.register({ ...c, source: "plugin" });

  return {
    config,
    i18n,
    theme,
    hookBus,
    pluginRegistry,
    plugins: pluginList,
    pluginErrors,
    skills,
    commandRegistry,
    tools,
    /** Create a skill runner bound to a bridge/ctx/maxTurns. */
    makeSkillRunner: ({ bridge, ctx, maxTurns }) => (name, task = "") => runSkill(name, { bridgeClient: bridge, ctx, maxTurns, skills, taskOverride: task }),
  };
}

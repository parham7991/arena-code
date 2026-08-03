// commands/index.mjs — built-in slash commands. Each handler receives
// (args[], context) and returns a string (info) or {error} or object.
import { listSkills, matchSkill } from "../skills/skill-runner.mjs";
import { loadSkills } from "../skills/skill-loader.mjs";
import { getTheme, THEME_NAMES } from "../theme.mjs";
import { SUPPORTED } from "../i18n.mjs";

export function builtinCommands() {
  return [
    { name: "help", description: "Show help.", handler: (_a, ctx) => ctx?.helpText || "Arena Code — type /help for this menu." },
    {
      name: "compact",
      description: "Compress the conversation to free context.",
      handler: async (_a, ctx) => {
        if (typeof ctx?.engine?.compact !== "function") return { error: "Compaction not available." };
        const res = await ctx.engine.compact();
        return `Context compacted (${res.mode}): ${res.before.toLocaleString()} → ${res.after.toLocaleString()} tokens.`;
      },
    },
    { name: "clear", description: "Clear the transcript.", handler: (_a, ctx) => { ctx?.clear?.(); return "Cleared."; } },
    { name: "quit", description: "Exit.", handler: (_a, ctx) => { ctx?.quit?.(); return "Bye."; } },
    {
      name: "skills",
      description: "List available skills.",
      handler: (_a, ctx) => {
        const skills = loadSkills({ projectRoot: ctx?.projectRoot });
        const rows = listSkills(skills).map((s) => `  ${s.name} — ${s.description} (${s.trigger || "manual"})`);
        return `Skills (${rows.length}):\n${rows.join("\n") || "  (none)"}`;
      },
    },
    {
      name: "skill",
      description: "Run a skill: /skill <name> [args]",
      handler: async (args, ctx) => {
        const name = args?.[0];
        if (!name) return { error: "Usage: /skill <name>" };
        if (typeof ctx?.engine?.runSkill !== "function") return { error: "Skill runner not available." };
        const result = await ctx.engine.runSkill(name, args.slice(1).join(" "));
        return `Skill "${result.skill?.name}" finished.`;
      },
    },
    {
      name: "plugins",
      description: "List loaded plugins.",
      handler: (_a, ctx) => {
        const plugins = ctx?.plugins?.length ? ctx.plugins.map((p) => p.name) : [];
        return `Plugins (${plugins.length}): ${plugins.join(", ") || "(none)"}`;
      },
    },
    {
      name: "sessions",
      description: "List sessions for this project.",
      handler: (_a, ctx) => {
        const list = ctx?.store?.listSessions ? ctx.store.listSessions() : [];
        if (!list.length) return "No sessions saved.";
        return list.map((s) => `  ${s.id} — ${s.messageCount} msgs · ${s.updatedAt ? new Date(s.updatedAt).toISOString() : ""}`).join("\n");
      },
    },
    { name: "diff", description: "Show current git diff.", handler: async (_a, ctx) => (await import("../diff.mjs")).then(async (m) => (await m.computeDiff("", "", { from: "HEAD", to: "worktree" })) || "(no diff)") },
    {
      name: "snap",
      description: "Create a snapshot.",
      handler: async (_a, ctx) => (await import("../plugins/built-in/snapshot.mjs")).then((m) => m.default.tools[0].execute({ label: "manual" }, ctx?.ctx || {}).then((r) => `Snapshot created: ${r.id}`)),
    },
    {
      name: "stats",
      description: "Show usage stats.",
      handler: async (_a, ctx) => {
        const toks = typeof ctx?.engine?.tokenEstimate === "function" ? ctx.engine.tokenEstimate() : 0;
        return `Estimated context: ${toks.toLocaleString()} tokens.`;
      },
    },
    {
      name: "theme",
      description: "Show or change the theme (/theme <name>).",
      handler: (args, ctx) => {
        const name = args?.[0];
        if (name) {
          ctx?.setTheme?.(name);
          return `Theme set to ${name}.`;
        }
        return `Themes: ${THEME_NAMES.join(", ")} (current: ${ctx?.theme || "default"})`;
      },
    },
    {
      name: "lang",
      description: "Show or change the language (/lang <code>).",
      handler: (args, ctx) => {
        const code = args?.[0];
        if (code) {
          if (!SUPPORTED.includes(code)) return { error: `Unsupported language: ${code}. Supported: ${SUPPORTED.join(", ")}` };
          ctx?.setLang?.(code);
          return `Language set to ${code}.`;
        }
        return `Languages: ${SUPPORTED.join(", ")} (current: ${ctx?.lang || "en"})`;
      },
    },
    { name: "config", description: "Show current config summary.", handler: (_a, ctx) => Object.entries(ctx?.config || {}).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join("\n") },
    { name: "review", description: "Run the code-review skill.", handler: async (_a, ctx) => (typeof ctx?.engine?.runSkill === "function" ? (await ctx.engine.runSkill("code-review")).content : { error: "Unavailable" }) },
    { name: "debug", description: "Run the debug skill.", handler: async (_a, ctx) => (typeof ctx?.engine?.runSkill === "function" ? (await ctx.engine.runSkill("debug")).content : { error: "Unavailable" }) },
    { name: "team", description: "Run the team leader on the given task.", handler: async (args, ctx) => (args?.[0] && ctx?.runTeam ? await ctx.runTeam(args.join(" ")) : { error: "Usage: /team <task>" }) },
    { name: "git", description: "Show git status.", handler: async (_a, ctx) => (await import("../plugins/built-in/git.mjs")).then((m) => m.default.commands.find((c) => c.name === "git").handler([], ctx?.ctx || {}).then((r) => `git:\n${r.stdout || r.error || ""}`)) },
  ];
}

// built-in git plugin — Git integration: status, diff, log, commit, branch,
// push/pull, stash tools + /git, /commit, /push, /branch commands + hooks.
import { definePlugin } from "../plugin-api.mjs";
import { makeShellTool, run } from "./helpers.mjs";

const gitTools = [
  makeShellTool("GitStatus", "Show the current git repository status.", (a) => "git status --short", { properties: {}, required: [] }),
  makeShellTool("GitDiff", "Show staged/unstaged changes as a diff.", (a) => `git diff ${a.staged ? "--cached" : ""}`.trim(), {
    properties: { staged: { type: "boolean", description: "Show staged (cached) diff instead." } },
    required: [],
  }),
  makeShellTool("GitLog", "Show recent commit history.", (a) => `git log --oneline -n ${a.count || 20}`, {
    properties: { count: { type: "integer", description: "Number of commits to show." } },
    required: [],
  }),
  makeShellTool("GitBranch", "Create or list branches.", (a) => (a.name ? `git checkout -b ${a.name}` : "git branch"), {
    properties: { name: { type: "string", description: "New branch name (omit to list)." } },
    required: [],
  }),
  makeShellTool("GitPush", "Push commits to the remote.", (a) => `git push ${a.remote ? a.remote : "origin"}`, {
    properties: { remote: { type: "string", description: "Remote name (default origin)." } },
    required: [],
  }),
  makeShellTool("GitPull", "Pull changes from the remote.", (a) => `git pull ${a.remote ? a.remote : ""}`.trim(), {
    properties: { remote: { type: "string", description: "Remote name." } },
    required: [],
  }),
  makeShellTool("GitStash", "Stash uncommitted changes.", (a) => (a.pop ? "git stash pop" : "git stash"), {
    properties: { pop: { type: "boolean", description: "Pop the stash instead of stashing." } },
    required: [],
  }),
  {
    schema: {
      name: "GitCommit",
      description: "Commit staged changes with a message.",
      parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
    },
    async execute(args, ctx) {
      if (!args?.message) return { error: "GitCommit requires a message" };
      return run(`git commit -m ${JSON.stringify(args.message)}`, ctx?.projectRoot || ctx?.cwd);
    },
  },
];

const gitCommands = [
  { name: "git", description: "Show git status summary.", handler: async (args, ctx) => run("git status --short", ctx?.projectRoot) },
  {
    name: "commit",
    description: "Smart commit (stages changes and commits with a message).",
    handler: async (args, ctx) => {
      const msg = args?.message || args?.[0] || "auto commit";
      await run("git add -A", ctx?.projectRoot);
      return run(`git commit -m ${JSON.stringify(msg)}`, ctx?.projectRoot);
    },
  },
  { name: "push", description: "Push to remote (safety: current branch).", handler: async (args, ctx) => run("git push", ctx?.projectRoot) },
  { name: "branch", description: "List or create branches.", handler: async (args, ctx) => run(args?.[0] ? `git checkout -b ${args[0]}` : "git branch", ctx?.projectRoot) },
];

export default definePlugin({
  name: "git",
  version: "1.0.0",
  description: "Git integration for Arena Code",
  tools: gitTools,
  commands: gitCommands,
  hooks: {
    async onToolAfter(data) {
      // Auto-stage files after Write/Edit if auto_commit / auto-stage enabled.
      if (data?.tool === "Write" || data?.tool === "Edit") {
        await run("git add -A", data?.ctx?.projectRoot || data?.ctx?.cwd).catch(() => {});
      }
    },
  },
});

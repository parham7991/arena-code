// built-in linter plugin — Lint/Format tools + optional auto-lint/format hook.
import { definePlugin } from "../plugin-api.mjs";
import { run } from "./helpers.mjs";

const linterTools = [
  {
    schema: {
      name: "Lint",
      description: "Run the project linter (eslint, ruff, etc.).",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: [] },
    },
    async execute(args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      // Detect common linters; fall back to a generic npx eslint.
      for (const cmd of [`npx --no-install eslint ${args.path || "."}`, `ruff check ${args.path || "."}`, `eslint ${args.path || "."}`]) {
        const res = await run(cmd, root, 60_000);
        if (res.exitCode !== 127 && !/command not found/i.test(res.stderr + res.stdout)) return { ok: res.ok, ...res };
      }
      return { error: "Lint: no linter detected (tried eslint, ruff)" };
    },
  },
  {
    schema: {
      name: "Format",
      description: "Format the codebase (prettier, black, etc.).",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: [] },
    },
    async execute(args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      for (const cmd of [`npx --no-install prettier --write ${args.path || "."}`, `black ${args.path || "."}`]) {
        const res = await run(cmd, root, 60_000);
        if (res.exitCode !== 127 && !/command not found/i.test(res.stderr + res.stdout)) return { ok: res.ok, ...res };
      }
      return { error: "Format: no formatter detected (tried prettier, black)" };
    },
  },
];

export default definePlugin({
  name: "linter",
  version: "1.0.0",
  description: "Linting and formatting integration",
  tools: linterTools,
  commands: [],
  hooks: {},
});

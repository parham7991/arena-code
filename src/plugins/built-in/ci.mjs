// built-in ci plugin — CI/CD status/trigger/logs tools.
// Provides lightweight stubs that report the git commit/status; real pipeline
// integration is config-driven.
import { definePlugin } from "../plugin-api.mjs";
import { run } from "./helpers.mjs";

const ciTools = [
  { schema: { name: "CiStatus", description: "Show CI status (git/commit based stub).", parameters: { type: "object", properties: {}, required: [] } }, async execute(_a, ctx) { const r = await run("git log -1 --oneline", ctx?.projectRoot); return { ok: r.ok, note: "CI provider not configured; showing last commit.", ...r }; } },
  { schema: { name: "CiTrigger", description: "Trigger a CI pipeline (stub).", parameters: { type: "object", properties: {}, required: [] } }, async execute() { return { error: "CiTrigger: no CI provider configured" }; } },
];

export default definePlugin({
  name: "ci",
  version: "1.0.0",
  description: "CI/CD integration",
  tools: ciTools,
  commands: [{ name: "ci", description: "Show CI status stub.", handler: (_a, ctx) => ciTools[0].execute({}, ctx) }],
  hooks: {},
});

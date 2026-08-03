// built-in docker plugin — Docker container/image/compose tools.
// Gracefully reports when docker is unavailable.
import { definePlugin } from "../plugin-api.mjs";
import { run } from "./helpers.mjs";

const dockerTools = [
  { schema: { name: "DockerPs", description: "List running docker containers.", parameters: { type: "object", properties: {}, required: [] } }, async execute(_a, ctx) { const r = await run("docker ps", ctx?.projectRoot); return { ok: r.ok, ...r }; } },
  { schema: { name: "DockerBuild", description: "Build a docker image.", parameters: { type: "object", properties: { tag: { type: "string" } }, required: [] } }, async execute(a, ctx) { const r = await run(`docker build -t ${a?.tag || "app"} .`, ctx?.projectRoot); return { ok: r.ok, ...r }; } },
  { schema: { name: "DockerLogs", description: "Show docker container logs.", parameters: { type: "object", properties: { container: { type: "string" } }, required: ["container"] } }, async execute(a, ctx) { const r = await run(`docker logs ${a?.container}`, ctx?.projectRoot); return { ok: r.ok, ...r }; } },
];

export default definePlugin({
  name: "docker",
  version: "1.0.0",
  description: "Docker integration",
  tools: dockerTools,
  commands: [
    { name: "docker", description: "List docker containers.", handler: (_a, ctx) => dockerTools[0].execute({}, ctx) },
    { name: "compose", description: "Run docker compose up/down.", handler: async (a, ctx) => run(`docker compose ${a?.[0] || "up"}`, ctx?.projectRoot) },
  ],
  hooks: {},
});

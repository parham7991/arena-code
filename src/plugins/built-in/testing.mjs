// built-in testing plugin — RunTests / RunSingleTest / Coverage tools.
import { definePlugin } from "../plugin-api.mjs";
import { run } from "./helpers.mjs";

const testTools = [
  {
    schema: { name: "RunTests", description: "Run the project test suite.", parameters: { type: "object", properties: {}, required: [] } },
    async execute(_args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      for (const cmd of [`npm test`, `npx jest`, `pytest -q`]) {
        const res = await run(cmd, root, 120_000);
        if (res.exitCode !== 127 && !/command not found/i.test(res.stderr + res.stdout)) return { ok: res.ok, ...res };
      }
      return { error: "RunTests: no test runner detected (tried npm test, jest, pytest)" };
    },
  },
  {
    schema: {
      name: "RunSingleTest",
      description: "Run a single test file or test.",
      parameters: { type: "object", properties: { test: { type: "string" } }, required: ["test"] },
    },
    async execute(args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      const t = args.test;
      const res = await run(`node --test ${t} || npx jest ${t} || pytest -q ${t}`, root, 120_000);
      return { ok: res.exitCode === 0, ...res };
    },
  },
  {
    schema: { name: "Coverage", description: "Run tests with coverage.", parameters: { type: "object", properties: {}, required: [] } },
    async execute(_args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      const res = await run(`npx jest --coverage || node --experimental-test-coverage --test`, root, 120_000);
      return { ok: res.exitCode === 0, ...res };
    },
  },
];

export default definePlugin({
  name: "testing",
  version: "1.0.0",
  description: "Test running integration",
  tools: testTools,
  commands: [
    { name: "test", description: "Run the test suite.", handler: (_a, ctx) => testTools[0].execute({}, ctx) },
    { name: "coverage", description: "Run tests with coverage.", handler: (_a, ctx) => testTools[2].execute({}, ctx) },
  ],
  hooks: {},
});

// helpers.mjs — shared helpers for built-in plugins.
import { exec } from "node:child_process";

/** Run a shell command and return {ok, stdout, stderr, exitCode}. Never throws. */
export function run(cmd, cwd, timeout = 30_000) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      const exitCode = error?.code ?? 0;
      resolve({ ok: exitCode === 0, stdout: String(stdout || ""), stderr: String(stderr || ""), exitCode: Number.isInteger(exitCode) ? exitCode : -1 });
    });
  });
}

/** Make a simple schema wrapper for a tool that runs a shell command. */
export function makeShellTool(name, description, buildCommand, parameters = {}) {
  return {
    schema: {
      name,
      description,
      parameters: { type: "object", properties: parameters.properties || {}, required: parameters.required || [] },
    },
    async execute(args, ctx) {
      const cmd = buildCommand(args);
      if (!cmd) return { error: `${name}: could not build a command from the given arguments` };
      const res = await run(cmd, ctx?.projectRoot || ctx?.cwd, ctx?.bashTimeout ?? 30_000);
      return { ok: res.ok, ...res };
    },
  };
}

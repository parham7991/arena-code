// bash.mjs — Bash tool: run a shell command with timeout and capped output.
import { exec } from "node:child_process";
import { resolvePath } from "./path.mjs";

const MAX_OUTPUT_CHARS = 50_000;

function truncate(s) {
  if (typeof s !== "string") return "";
  return s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + "\n…[truncated]" : s;
}

export const bashTool = {
  schema: {
    name: "Bash",
    description:
      "Run a shell command (sh -c) on the user's machine. Use this for builds, tests, git, installing, etc. Output is capped.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute." },
        timeout: {
          type: "integer",
          description: "Timeout in milliseconds (default 30000).",
        },
        cwd: {
          type: "string",
          description: "Directory to run in (defaults to the project root).",
        },
      },
      required: ["command"],
    },
  },

  async execute(args, ctx) {
    const command = args?.command;
    if (typeof command !== "string" || command.length === 0) {
      return { error: "Bash failed: 'command' must be a non-empty string" };
    }
    const timeout = Number.isFinite(Number(args.timeout)) ? Number(args.timeout) : 30_000;
    let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
    if (args.cwd) {
      try {
        cwd = resolvePath(args.cwd, ctx);
      } catch {
        return { error: `Bash failed: invalid cwd '${args.cwd}'` };
      }
    }

    return new Promise((resolve) => {
      exec(command, { cwd, timeout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        const timedOut = Boolean(error?.killed);
        const exitCode = error?.code ?? 0;
        resolve({
          ok: exitCode === 0 && !timedOut,
          stdout: truncate(String(stdout || "")),
          stderr: truncate(String(stderr || "")),
          exitCode: Number.isInteger(exitCode) ? exitCode : -1,
          timedOut,
          cwd,
        });
      });
    });
  },
};

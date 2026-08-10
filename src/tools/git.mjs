// git.mjs — Git tool: status/diff/log/commit for flawless delivery without leaving Agent
import { exec } from "node:child_process";
import { resolvePath } from "./path.mjs";

const MAX_OUT = 30_000;
function trunc(s) {
  const t = String(s || "");
  return t.length > MAX_OUT ? t.slice(0, MAX_OUT) + "\n…[truncated]" : t;
}

function run(cmd, cwd, timeout = 10_000) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = String(stdout || "") + String(stderr || "");
      resolve({ ok: !err, exitCode: err?.code ?? 0, output: trunc(out) });
    });
  });
}

export const gitTool = {
  schema: {
    name: "Git",
    description:
      "Run git operations: status, diff, log, commit, branch. Use to check changes and commit without leaving the agent. Runs inside project root.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "diff", "log", "commit", "branch", "show"],
          description: "Git action",
        },
        message: { type: "string", description: "Commit message (for commit)" },
        args: { type: "string", description: "Extra args (e.g., '--stat' for diff/log)" },
        cwd: { type: "string", description: "Project directory" },
      },
      required: ["action"],
    },
  },

  async execute(args, ctx) {
    let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
    if (args.cwd) {
      try { cwd = resolvePath(args.cwd, ctx); } catch { return { error: `invalid cwd` }; }
    }
    const action = args.action;
    let cmd = "";
    if (action === "status") cmd = "git status --porcelain=v1 -b";
    else if (action === "diff") cmd = `git diff ${args.args || ""}`.trim();
    else if (action === "log") cmd = `git log --oneline -20 ${args.args || ""}`.trim();
    else if (action === "branch") cmd = "git branch -vv";
    else if (action === "show") cmd = `git show ${args.args || "HEAD"} --stat`;
    else if (action === "commit") {
      if (!args.message) return { error: "Git commit failed: 'message' required" };
      const msg = args.message.replace(/"/g, '\\"');
      cmd = `git add -A && git commit -m "${msg}"`;
    } else return { error: `Unknown git action ${action}` };

    const res = await run(cmd, cwd);
    return { ok: res.ok, action, command: cmd, exitCode: res.exitCode, cwd, output: res.output };
  },
};

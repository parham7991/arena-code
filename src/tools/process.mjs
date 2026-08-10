// process.mjs — Process tool: manage background dev servers and long-running commands
// Solves the "run and keep running" need for large projects (npm run dev, etc.)
import { spawn } from "node:child_process";
import { resolvePath } from "./path.mjs";

const processes = new Map(); // id -> { proc, logs, startTime }

function makeId() {
  return `proc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function truncateLogs(s, max = 50_000) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[truncated ${s.length - max} chars]`;
}

export const processTool = {
  schema: {
    name: "Process",
    description:
      "Manage background processes (dev servers, watchers). Actions: start (run a command in background), logs (get output), stop, list. Use for 'npm run dev', 'python app.py', etc. that need to keep running.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["start", "logs", "stop", "list"],
          description: "Action to perform",
        },
        command: { type: "string", description: "Command to run (for start)" },
        id: { type: "string", description: "Process id (for logs/stop)" },
        cwd: { type: "string", description: "Working directory" },
        timeout: { type: "integer", description: "Timeout for start check (ms, default 5000)" },
      },
      required: ["action"],
    },
  },

  async execute(args, ctx) {
    const action = args?.action;
    if (!["start", "logs", "stop", "list"].includes(action)) {
      return { error: `Process failed: unknown action '${action}'` };
    }

    if (action === "list") {
      const list = [...processes.entries()].map(([id, p]) => ({
        id,
        command: p.command,
        cwd: p.cwd,
        running: !p.proc.killed && p.proc.exitCode === null,
        uptimeSec: Math.floor((Date.now() - p.startTime) / 1000),
        logChars: p.logs.length,
      }));
      return { ok: true, processes: list };
    }

    if (action === "start") {
      const command = args?.command;
      if (!command) return { error: "Process start failed: 'command' required" };
      let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
      if (args.cwd) {
        try { cwd = resolvePath(args.cwd, ctx); } catch { return { error: `invalid cwd '${args.cwd}'` }; }
      }
      const id = makeId();
      const proc = spawn(command, { shell: true, cwd, detached: false });
      let logs = "";
      proc.stdout?.on("data", (d) => { logs += d.toString(); });
      proc.stderr?.on("data", (d) => { logs += d.toString(); });
      processes.set(id, { proc, logs: "", command, cwd, startTime: Date.now() });
      // Update logs reference
      const entry = processes.get(id);
      proc.stdout?.on("data", (d) => { entry.logs += d.toString(); });
      proc.stderr?.on("data", (d) => { entry.logs += d.toString(); });
      proc.on("exit", () => { /* keep logs */ });

      const waitMs = Number.isFinite(Number(args.timeout)) ? Number(args.timeout) : 3000;
      await new Promise((r) => setTimeout(r, waitMs));
      const running = !proc.killed && proc.exitCode === null;
      return {
        ok: true,
        id,
        running,
        cwd,
        command,
        logs: truncateLogs(entry.logs.slice(-8000)),
        hint: running ? `Process ${id} running. Use Process logs/stop.` : `Process exited with code ${proc.exitCode}`,
      };
    }

    if (action === "logs") {
      const entry = processes.get(args.id);
      if (!entry) return { error: `Process ${args.id} not found` };
      const running = !entry.proc.killed && entry.proc.exitCode === null;
      return {
        ok: true,
        id: args.id,
        running,
        exitCode: entry.proc.exitCode,
        logs: truncateLogs(entry.logs.slice(-50_000)),
      };
    }

    if (action === "stop") {
      const entry = processes.get(args.id);
      if (!entry) return { error: `Process ${args.id} not found` };
      try { entry.proc.kill("SIGTERM"); } catch {}
      await new Promise((r) => setTimeout(r, 800));
      if (!entry.proc.killed && entry.proc.exitCode === null) {
        try { entry.proc.kill("SIGKILL"); } catch {}
      }
      return { ok: true, id: args.id, stopped: true, exitCode: entry.proc.exitCode };
    }
  },
};

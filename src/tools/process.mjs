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
      const list = [...processes.entries()].map(([id, p]) => {
        let running = false;
        try { process.kill(-p.proc.pid, 0); running = true; } catch { running = !p.proc.killed && p.proc.exitCode === null; }
        return {
          id,
          command: p.command,
          cwd: p.cwd,
          pid: p.proc.pid,
          running,
          uptimeSec: Math.floor((Date.now() - p.startTime) / 1000),
          logChars: p.logs.length,
        };
      });
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
      // Use detached:true so we can kill the whole process group (shell + child)
      const proc = spawn(command, { shell: true, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
      proc.unref();
      const entry = { proc, logs: "", command, cwd, startTime: Date.now() };
      processes.set(id, entry);
      proc.stdout?.on("data", (d) => { entry.logs += d.toString(); });
      proc.stderr?.on("data", (d) => { entry.logs += d.toString(); });
      proc.on("exit", () => { /* keep logs */ });
      proc.on("error", () => {});

      const waitMs = Number.isFinite(Number(args.timeout)) ? Number(args.timeout) : 3000;
      await new Promise((r) => setTimeout(r, waitMs));
      // Robust running check: try to signal the group, not just proc.exitCode (shell may have exited)
      let running = false;
      try {
        process.kill(-proc.pid, 0);
        running = true;
      } catch {
        running = !proc.killed && proc.exitCode === null;
      }
      return {
        ok: true,
        id,
        running,
        cwd,
        command,
        pid: proc.pid,
        logs: truncateLogs(entry.logs.slice(-8000)),
        hint: running ? `Process ${id} running (pid ${proc.pid}). Use Process logs/stop.` : `Process exited with code ${proc.exitCode}`,
      };
    }

    if (action === "logs") {
      const entry = processes.get(args.id);
      if (!entry) return { error: `Process ${args.id} not found` };
      let running = false;
      try { process.kill(-entry.proc.pid, 0); running = true; } catch { running = !entry.proc.killed && entry.proc.exitCode === null; }
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
      // Try to kill the whole process group (detached shell + children)
      try { process.kill(-entry.proc.pid, "SIGTERM"); } catch {}
      try { entry.proc.kill("SIGTERM"); } catch {}
      await new Promise((r) => setTimeout(r, 1000));
      // Check if still alive via group signal
      let stillAlive = false;
      try { process.kill(-entry.proc.pid, 0); stillAlive = true; } catch { stillAlive = false; }
      if (stillAlive) {
        try { process.kill(-entry.proc.pid, "SIGKILL"); } catch {}
        try { entry.proc.kill("SIGKILL"); } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return { ok: true, id: args.id, stopped: true, exitCode: entry.proc.exitCode };
    }
  },
};

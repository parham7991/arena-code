// built-in snapshot plugin — snapshot/rollback of project files.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { definePlugin } from "../plugin-api.mjs";

function snapshotsDir(projectRoot) {
  return path.join(projectRoot, ".arena-code", "snapshots");
}

function listFilesRecursive(dir, base, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".arena-code") continue;
      listFilesRecursive(full, base, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

function readAllFiles(projectRoot) {
  const files = listFilesRecursive(projectRoot, projectRoot, []);
  const store = {};
  for (const rel of files) {
    try {
      store[rel] = fs.readFileSync(path.join(projectRoot, rel), "utf8");
    } catch {
      /* skip unreadable */
    }
  }
  return store;
}

const snapshotTools = [
  {
    schema: {
      name: "SnapshotCreate",
      description: "Save the current state of project files as a snapshot.",
      parameters: { type: "object", properties: { label: { type: "string" } }, required: [] },
    },
    async execute(args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const dir = snapshotsDir(root);
      fs.mkdirSync(dir, { recursive: true });
      const data = {
        id,
        label: args?.label || "",
        createdAt: new Date().toISOString(),
        files: readAllFiles(root),
      };
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data), "utf8");
      return { ok: true, id, label: data.label, files: Object.keys(data.files).length };
    },
  },
  {
    schema: { name: "SnapshotList", description: "List saved snapshots.", parameters: { type: "object", properties: {}, required: [] } },
    async execute(_args, ctx) {
      const dir = snapshotsDir(ctx.projectRoot || ctx.cwd);
      if (!fs.existsSync(dir)) return { ok: true, snapshots: [] };
      const snapshots = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
          return { id: d.id, label: d.label, createdAt: d.createdAt, files: Object.keys(d.files || {}).length };
        } catch {
          return { id: f.slice(0, -5) };
        }
      }).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return { ok: true, snapshots };
    },
  },
  {
    schema: {
      name: "SnapshotRestore",
      description: "Restore project files from a snapshot.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    async execute(args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      const dir = snapshotsDir(root);
      const fp = path.join(dir, `${args.id}.json`);
      if (!fs.existsSync(fp)) return { error: `Snapshot not found: ${args.id}` };
      const d = JSON.parse(fs.readFileSync(fp, "utf8"));
      let restored = 0;
      for (const [rel, content] of Object.entries(d.files || {})) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf8");
        restored += 1;
      }
      return { ok: true, restored };
    },
  },
  {
    schema: {
      name: "SnapshotDiff",
      description: "Show the difference between current files and a snapshot.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    async execute(args, ctx) {
      const root = ctx.projectRoot || ctx.cwd;
      const fp = path.join(snapshotsDir(root), `${args.id}.json`);
      if (!fs.existsSync(fp)) return { error: `Snapshot not found: ${args.id}` };
      const d = JSON.parse(fs.readFileSync(fp, "utf8"));
      const current = readAllFiles(root);
      const changed = [];
      const allKeys = new Set([...Object.keys(d.files || {}), ...Object.keys(current)]);
      for (const k of allKeys) {
        if (d.files?.[k] !== current[k]) changed.push(k);
      }
      return { ok: true, id: args.id, changed };
    },
  },
];

export default definePlugin({
  name: "snapshot",
  version: "1.0.0",
  description: "Snapshot and rollback of project files",
  tools: snapshotTools,
  commands: [
    { name: "snap", description: "Create a snapshot.", handler: (args, ctx) => snapshotTools[0].execute({ label: args?.[0] }, ctx) },
    { name: "rollback", description: "Restore from a snapshot (pass id).", handler: (args, ctx) => snapshotTools[2].execute({ id: args?.[0] }, ctx) },
  ],
  hooks: {
    async onSessionStart(data) {
      // auto-snapshot at session start
      if (data?.ctx?.projectRoot && data?.autoSnapshot !== false) {
        await snapshotTools[0].execute({ label: "session-start" }, data.ctx);
      }
    },
  },
});

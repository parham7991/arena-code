// session.mjs — persist conversation history as JSONL under
//   ~/.arena-code/sessions/<projectHash>/<id>.jsonl
// One JSON object (a message) per line. No external dependencies.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

/** Stable short hash of the project root, used to namespace sessions. */
export function projectHash(projectRoot) {
  return crypto.createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16);
}

/** Directory that holds this project's session files. */
export function sessionsDir(dataDir, projectRoot) {
  const base = dataDir || path.join(os.homedir(), ".arena-code");
  return path.join(base, "sessions", projectHash(projectRoot));
}

export class SessionStore {
  constructor({ dataDir, projectRoot }) {
    this.dir = sessionsDir(dataDir, projectRoot);
    this.projectRoot = projectRoot;
  }

  pathFor(id) {
    return path.join(this.dir, `${id}.jsonl`);
  }

  /** Load a session by id; returns { id, messages } (empty messages if absent). */
  load(id) {
    const fp = this.pathFor(id);
    if (!fs.existsSync(fp)) return { id, messages: [] };
    const lines = fs.readFileSync(fp, "utf8").split("\n").filter(Boolean);
    const messages = lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { role: "unknown", content: l };
      }
    });
    return { id, messages };
  }

  /** Persist the message array for a session id (overwrites). Returns metadata. */
  dump(id, messages) {
    fs.mkdirSync(this.dir, { recursive: true });
    const fp = this.pathFor(id);
    const body = (Array.isArray(messages) ? messages : []).map((m) => JSON.stringify(m)).join("\n") + "\n";
    fs.writeFileSync(fp, body, "utf8");
    return { id, file: fp, count: (Array.isArray(messages) ? messages : []).length };
  }

  /** List all session ids in this project (any order). */
  list() {
    return this.listSessions().map((s) => s.id);
  }

  /** List session metadata (newest first). */
  listSessions() {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const fp = path.join(this.dir, f);
        let stat;
        try {
          stat = fs.statSync(fp);
        } catch {
          return null;
        }
        const messages = this.load(f.slice(0, -6)).messages;
        return {
          id: f.slice(0, -6),
          file: fp,
          updatedAt: stat.mtimeMs,
          size: stat.size,
          messageCount: messages.length,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Load the most recently modified session, or null if none. */
  last() {
    return this.continueLast();
  }

  /** Continue the last session: returns { id, messages } or null if none. */
  continueLast() {
    const sessions = this.listSessions();
    if (!sessions.length) return null;
    return this.load(sessions[0].id);
  }
}

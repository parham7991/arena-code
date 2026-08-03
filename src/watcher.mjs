// watcher.mjs — watch project files for external changes and emit events.
import fs from "node:fs";
import path from "node:path";
import { hookBus } from "./hooks.mjs";

const IGNORED = new Set([".git", "node_modules", ".arena-code"]);

export class ProjectWatcher {
  constructor({ projectRoot, onChange }) {
    this.projectRoot = projectRoot;
    this.onChange = onChange || (() => {});
    this.watchers = new Set();
    this.watching = false;
  }

  start() {
    if (this.watching) return;
    this.watching = true;
    this._watchDir(this.projectRoot);
  }

  _watchDir(dir) {
    if (!fs.existsSync(dir)) return;
    let w;
    try {
      w = fs.watch(dir, { persistent: false }, (_event, filename) => {
        if (!filename) return;
        const full = path.join(dir, filename.toString());
        this.onChange({ filePath: full, changeType: _event, projectRoot: this.projectRoot });
        hookBus.notify("onExternalChange", { filePath: full, changeType: _event }).catch(() => {});
        // If a directory changed, (re)watch it.
        if (fs.existsSync(full) && fs.statSync(full).isDirectory() && !IGNORED.has(filename)) {
          this._watchDir(full);
        }
      });
      this.watchers.add(w);
    } catch {
      /* ignore */
    }
    // recursively watch subdirs
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && !IGNORED.has(e.name)) this._watchDir(path.join(dir, e.name));
    }
  }

  stop() {
    for (const w of this.watchers) w.close();
    this.watchers.clear();
    this.watching = false;
  }
}

// path.mjs — helpers to resolve tool file paths safely relative to projectRoot.
import path from "node:path";

/**
 * Resolve a user-supplied path against the project root.
 * - Absolute paths are used as-is.
 * - Relative paths are resolved against ctx.projectRoot (falling back to cwd).
 */
export function resolvePath(p, ctx) {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("path must be a non-empty string");
  }
  const base = ctx.projectRoot || ctx.cwd || process.cwd();
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(base, p);
}

/** Ensure a path stays inside projectRoot unless it was explicitly absolute. */
export function insideProject(abs, ctx) {
  const root = path.resolve(ctx.projectRoot || ctx.cwd || process.cwd());
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

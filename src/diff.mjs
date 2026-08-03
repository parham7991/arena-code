// diff.mjs — compute and format line diffs between two strings.
// No external dependencies.
import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Compute a unified diff using the system `diff` when available. */
export function computeDiff(oldContent, newContent, { from = "old", to = "new", context = 3 } = {}) {
  // Try system diff for accurate unified output.
  const tmpA = path.join(os.tmpdir(), `arena-old-${Date.now()}.txt`);
  const tmpB = path.join(os.tmpdir(), `arena-new-${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpA, oldContent ?? "");
    fs.writeFileSync(tmpB, newContent ?? "");
  } catch {
    /* fall through */
  }
  return new Promise((resolve) => {
    exec(`diff -u -U ${context} --label '${from}' --label '${to}' ${tmpA} ${tmpB}`, (err, stdout) => {
      fs.unlinkSync(tmpA);
      fs.unlinkSync(tmpB);
      if (err && err.code !== 1) {
        // diff exit 1 = differences found; other codes = failure
        resolve(diffByLines(oldContent, newContent));
      } else {
        resolve(stdout || "");
      }
    });
  });
}

/** Fallback line-based diff (LCS) producing +/- lines. */
export function diffByLines(oldContent, newContent) {
  const a = String(oldContent ?? "").split("\n");
  const b = String(newContent ?? "").split("\n");
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push("  " + a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push("- " + a[i]);
      i++;
    } else {
      out.push("+ " + b[j]);
      j++;
    }
  }
  while (i < n) out.push("- " + a[i++]);
  while (j < m) out.push("+ " + b[j++]);
  return out.join("\n");
}

/** Minimal ANSI coloring of a diff string. */
export function formatDiff(diff) {
  return String(diff)
    .split("\n")
    .map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) return `\x1b[32m${line}\x1b[0m`;
      if (line.startsWith("-") && !line.startsWith("---")) return `\x1b[31m${line}\x1b[0m`;
      if (line.startsWith("@@")) return `\x1b[36m${line}\x1b[0m`;
      return line;
    })
    .join("\n");
}

/** Summarize a diff into changed line counts. */
export function summarizeDiff(diff) {
  const lines = String(diff || "").split("\n");
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.startsWith("+") && !l.startsWith("+++")) added++;
    if (l.startsWith("-") && !l.startsWith("---")) removed++;
  }
  return { added, removed };
}

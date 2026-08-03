import { test } from "node:test";
import assert from "node:assert/strict";
import { diffByLines, formatDiff, summarizeDiff, computeDiff } from "../src/diff.mjs";

test("diffByLines shows additions and removals", () => {
  const d = diffByLines("a\nb\nc", "a\nB\nc");
  assert.match(d, /- b/);
  assert.match(d, /\+ B/);
  assert.match(d, /  a/);
  assert.match(d, /  c/);
});

test("diffByLines returns empty for identical input", () => {
  assert.equal(diffByLines("same\nlines", "same\nlines"), "  same\n  lines");
});

test("summarizeDiff counts added/removed lines", () => {
  const d = diffByLines("x\ny", "x\nz\nw");
  const s = summarizeDiff(d);
  assert.equal(s.removed, 1);
  assert.equal(s.added, 2);
});

test("formatDiff wraps +/- lines in ANSI colors", () => {
  const d = diffByLines("a", "b");
  const colored = formatDiff(d);
  assert.match(colored, /\x1b\[32m/); // green for added
  assert.match(colored, /\x1b\[31m/); // red for removed
});

test("computeDiff returns a unified diff (system diff)", async () => {
  const d = await computeDiff("one\ntwo\nthree", "one\nTWO\nthree", { from: "a.txt", to: "b.txt" });
  // unified diff contains headers and the change
  assert.match(d, /^--- a\.txt/m);
  assert.match(d, /^\+\+\+ b\.txt/m);
});

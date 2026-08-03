import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  estimateTokens,
  messageTokens,
  messagesTokens,
  pruneToolMessages,
  compactMessages,
  summarizeMessages,
  manageContext,
  compactMessagesWithLLM,
  manageContextAsync,
  transcriptForSummarization,
} from "../src/context.mjs";
import { loadProjectMemory, buildSystemPrompt, systemPromptWithMemoryNote } from "../src/prompts/memory.mjs";
import { SYSTEM_PROMPT } from "../src/prompts/sys.mjs";

test("estimateTokens approximates chars/4", () => {
  assert.equal(estimateTokens(""), 0);
  assert.ok(estimateTokens("1234") === 1);
  assert.ok(estimateTokens("a".repeat(40)) === 10);
});

test("messageTokens counts content and tool_calls", () => {
  const m = { content: "1234", tool_calls: [{ function: { arguments: "1234" } }] };
  assert.ok(messageTokens(m) === 2);
});

test("pruneToolMessages leaves history alone when under limit", () => {
  const msgs = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  const res = pruneToolMessages(msgs, { limitTokens: 1000 });
  assert.equal(res.pruned, 0);
  assert.equal(res.messages.length, 2);
});

test("pruneToolMessages trims large old tool results when over limit", () => {
  // force over budget by setting a tiny limit
  const big = "x".repeat(4000);
  const msgs = [
    { role: "user", content: "task" },
    { role: "assistant", content: null, tool_calls: [{ id: "1", function: { name: "Bash", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "1", name: "Bash", content: big },
  ];
  const res = pruneToolMessages(msgs, { limitTokens: 10, keepRecent: 0 });
  assert.ok(res.pruned >= 1, "expected at least one prune");
  assert.match(res.messages[2].content, /pruned by Arena Code/);
  assert.ok(res.tokensAfter < res.tokensBefore);
});

test("pruneToolMessages keeps recent tool messages when keepRecent > 0", () => {
  const big = "y".repeat(2000);
  const msgs = [
    { role: "tool", tool_call_id: "0", name: "Bash", content: big },
    { role: "user", content: "task" },
    { role: "assistant", content: null, tool_calls: [{ id: "2", function: { name: "Bash", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "2", name: "Bash", content: big },
  ];
  // tiny limit, keepRecent 1 -> the last tool message is preserved
  const res = pruneToolMessages(msgs, { limitTokens: 10, keepRecent: 1 });
  assert.ok(res.pruned >= 1);
  const lastTool = res.messages[res.messages.length - 1];
  assert.ok(!/pruned/.test(lastTool.content), "most recent tool message should not be pruned");
});

test("summarizeMessages produces a compact transcript", () => {
  const msgs = [
    { role: "user", content: "Refactor the parser module" },
    { role: "assistant", content: "Done, tests pass." },
  ];
  const summary = summarizeMessages(msgs, 2000);
  assert.match(summary, /Refactor the parser module/);
  assert.match(summary, /Done, tests pass/);
});

test("compactMessages folds the middle into a summary and keeps recent", () => {
  const msgs = [];
  msgs.push({ role: "system", content: "sys" });
  // Use realistic, sizable messages so compaction actually reduces tokens.
  for (let i = 0; i < 20; i++) {
    msgs.push({ role: "user", content: `user message number ${i}: please refactor the module and keep it clean`.repeat(2) });
    msgs.push({ role: "assistant", content: `assistant reply ${i}: I refactored the parser and added tests. `.repeat(4) });
  }
  const res = compactMessages(msgs, { keepRecent: 4 });
  // system + summary + recent messages (4 kept message objects)
  assert.ok(res.messages.length <= 1 + 1 + 4);
  assert.ok(res.messages.some((m) => m._compacted));
  assert.ok(res.tokensAfter < res.tokensBefore, `expected fewer tokens: ${res.tokensAfter} >= ${res.tokensBefore}`);
  assert.ok(res.summary.length > 0);
});

test("manageContext prunes and compacts as needed", () => {
  const big = "z".repeat(5000);
  const msgs = [{ role: "system", content: "sys" }];
  for (let i = 0; i < 40; i++) {
    msgs.push({ role: "user", content: `q${i}` });
    msgs.push({ role: "assistant", content: null, tool_calls: [{ id: `${i}`, function: { name: "Bash", arguments: "{}" } }] });
    msgs.push({ role: "tool", tool_call_id: `${i}`, name: "Bash", content: big });
  }
  const res = manageContext(msgs, { limitTokens: 1000, targetTokens: 500 });
  assert.ok(messagesTokens(res.messages) < messagesTokens(msgs));
});

// --- Project memory ---
test("loadProjectMemory returns null when ARENA_CODE.md is absent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-mem-"));
  assert.equal(loadProjectMemory(dir), null);
});

test("loadProjectMemory reads ARENA_CODE.md when present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-mem-"));
  fs.writeFileSync(path.join(dir, "ARENA_CODE.md"), "Use ESM .mjs only.\n");
  assert.equal(loadProjectMemory(dir), "Use ESM .mjs only.");
});

test("buildSystemPrompt includes project memory when present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-mem-"));
  fs.writeFileSync(path.join(dir, "ARENA_CODE.md"), "Stack: Node.js");
  const prompt = buildSystemPrompt(dir);
  assert.match(prompt, /Stack: Node.js/);
  assert.match(prompt, /Arena Code/);
});

test("buildSystemPrompt falls back to SYSTEM_PROMPT when no memory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-mem-"));
  assert.equal(buildSystemPrompt(dir), SYSTEM_PROMPT);
});

test("systemPromptWithMemoryNote adds a maintenance note when memory exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-mem-"));
  fs.writeFileSync(path.join(dir, "ARENA_CODE.md"), "convention");
  const prompt = systemPromptWithMemoryNote(dir);
  assert.match(prompt, /ARENA_CODE\.md/);
  assert.match(prompt, /convention/);
});

// --- LLM-based compaction ---

function bigConversation() {
  const msgs = [{ role: "system", content: "sys" }];
  for (let i = 0; i < 15; i++) {
    msgs.push({ role: "user", content: `user turn ${i}: please implement feature number ${i}`.repeat(4) });
    msgs.push({ role: "assistant", content: `assistant reply ${i}: implemented and tested feature ${i}`.repeat(4) });
  }
  return msgs;
}

test("compactMessagesWithLLM uses the bridge summary when available", async () => {
  const bridge = {
    async chat({ messages: m }) {
      // respond with a summary of whatever was sent
      const user = m.find((x) => x.role === "user")?.content || "";
      return { choices: [{ message: { role: "assistant", content: `AI-SUMMARY(${user.length} chars)` } }] };
    },
  };
  const msgs = bigConversation();
  const before = messagesTokens(msgs);
  const res = await compactMessagesWithLLM(msgs, { bridgeClient: bridge, keepRecent: 6 });
  assert.equal(res.mode, "llm");
  assert.match(res.summary, /AI-SUMMARY/);
  assert.ok(res.messages.some((m) => m._compacted && m._compactionMode === "llm"));
  assert.ok(res.tokensAfter < res.tokensBefore, "LLM compaction should reduce tokens");
  // recent turns preserved verbatim
  const recent = res.messages[res.messages.length - 1];
  assert.match(recent.content, /assistant reply 14/);
});

test("compactMessagesWithLLM falls back to deterministic when bridge fails", async () => {
  const bridge = {
    async chat() {
      throw new Error("bridge down");
    },
  };
  const res = await compactMessagesWithLLM(bigConversation(), { bridgeClient: bridge, keepRecent: 6 });
  assert.equal(res.mode, "deterministic");
  assert.ok(res.messages.some((m) => m._compacted && m._compactionMode === "deterministic"));
  assert.ok(res.summary.length > 0);
});

test("compactMessagesWithLLM without bridgeClient is deterministic", async () => {
  const res = await compactMessagesWithLLM(bigConversation(), { keepRecent: 6 });
  assert.equal(res.mode, "deterministic");
});

test("compactMessagesWithLLM returns mode none for short conversations", async () => {
  const short = [{ role: "system", content: "s" }, { role: "user", content: "hi" }];
  const res = await compactMessagesWithLLM(short, { keepRecent: 8 });
  assert.equal(res.mode, "none");
  assert.equal(res.summary, "");
});

test("transcriptForSummarization renders a capped transcript", () => {
  const msgs = [
    { role: "user", content: "Refactor parser" },
    { role: "assistant", content: "Done." },
    { role: "tool", content: "big result", tool_call_id: "1" },
  ];
  const t = transcriptForSummarization(msgs);
  assert.match(t, /\[user\] Refactor parser/);
  assert.match(t, /\[tool\] <tool result>/);
});

test("manageContextAsync prunes then compacts, prune-first", async () => {
  const bigTool = "q".repeat(6000);
  const msgs = [{ role: "system", content: "sys" }];
  for (let i = 0; i < 20; i++) {
    msgs.push({ role: "user", content: `q${i}` });
    msgs.push({ role: "assistant", content: null, tool_calls: [{ id: `${i}`, function: { name: "Bash", arguments: "{}" } }] });
    msgs.push({ role: "tool", tool_call_id: `${i}`, name: "Bash", content: bigTool });
  }
  const bridge = {
    async chat({ messages: m }) {
      const user = m.find((x) => x.role === "user")?.content || "";
      return { choices: [{ message: { role: "assistant", content: `SUMMARY ${user.length}` } }] };
    },
  };
  const res = await manageContextAsync(msgs, { limitTokens: 1000, targetTokens: 500, bridgeClient: bridge });
  assert.ok(messagesTokens(res.messages) < messagesTokens(msgs));
  assert.ok(res.pruned >= 1, "should have pruned tool messages first");
});

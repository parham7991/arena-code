// selftest.mjs — run a full local self-check: boot a minimal inline mock bridge,
// verify the runtime (plugins/skills/tools/commands), run one agent turn, and
// report. Used by `arena --selftest` and the installer.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { BridgeClient } from "./bridge.mjs";
import { createRuntime } from "./runtime.mjs";
import { runAgent } from "./agent.mjs";

/** Minimal self-contained mock bridge (OpenAI-compatible + SSE), no deps. */
function createInlineMock(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = JSON.parse(await readBody(req));
      const hasTool = body.messages.some((m) => m.role === "tool");
      if (!hasTool && body.stream) {
        const arg = JSON.stringify({ file_path: "output.txt", content: "hello from arena" });
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "writing…" }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "t1", function: { name: "Write", arguments: arg } }] } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
        res.end("data: [DONE]\n\n");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        choices: [{ index: 0, message: { role: "assistant", content: "Wrote the file. All done." }, finish_reason: "stop" }],
      }));
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
  });
  return {
    server,
    start: () => new Promise((r) => server.listen(port, "127.0.0.1", r)),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function runSelfTest({ port = 20141, cwd } = {}) {
  const report = { passed: true, checks: [] };
  const check = (name, ok, detail = "") => {
    report.checks.push({ name, ok, detail });
    if (!ok) report.passed = false;
    return ok;
  };

  const projectRoot = cwd || fs.mkdtempSync(path.join(os.tmpdir(), "arena-selftest-"));

  // 1. Boot the mock bridge.
  let bridge;
  try {
    bridge = createInlineMock(port);
    await bridge.start();
    check("mock bridge boots", true, `port ${port}`);
  } catch (e) {
    check("mock bridge boots", false, e.message);
    return report;
  }

  try {
    // 2. Runtime loads plugins/skills/commands.
    const rt = await createRuntime({ env: { ARENA_BRIDGE_URL: `http://127.0.0.1:${port}` }, overrides: { cwd: projectRoot } });
    check("runtime builds", true);
    check("plugins load", rt.plugins.length >= 6, `${rt.plugins.map((p) => p.name).join(", ")}`);
    check("tools > 7 built-in", rt.tools.length >= 7, `${rt.tools.length} tools`);
    check("skills load", rt.skills.size >= 10, `${rt.skills.size} skills`);
    check("commands load", rt.commandRegistry.all().length >= 15, `${rt.commandRegistry.all().length} commands`);

    // 3. Agent loop runs one turn via the mock bridge.
    const client = new BridgeClient({ url: `http://127.0.0.1:${port}`, apiKey: "selftest-key", timeoutMs: 15_000 });
    const result = await runAgent({
      messages: [{ role: "user", content: "Write a greeting file" }],
      tools: rt.tools,
      bridgeClient: client,
      maxTurns: 10,
      ctx: { cwd: projectRoot, projectRoot },
      stream: true,
    });
    const wroteFile = fs.existsSync(path.join(projectRoot, "output.txt"));
    check("agent loop runs a tool", wroteFile && result.status === "done", `status=${result.status}`);
  } finally {
    await bridge.close().catch(() => {});
  }

  return report;
}

export function formatReport(report) {
  const lines = report.checks.map((c) => `  ${c.ok ? "✔" : "✖"} ${c.name}${c.detail ? " — " + c.detail : ""}`);
  return [`Self-test ${report.passed ? "PASSED" : "FAILED"}:`, ...lines].join("\n");
}

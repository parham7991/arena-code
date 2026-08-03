// mock-bridge.mjs — a local mock of the arena-account-bridge OpenAI-compatible
// endpoint, using only node:http. No dependencies.
//
// Behavior:
//   GET /health                  -> { ok: true }
//   POST /v1/chat/completions    -> supports BOTH non-streaming (JSON) and
//                                   streaming (SSE). Emits a Write tool_call
//                                   first, then (once a tool result is present)
//                                   a final answer with finish_reason "stop".
//
// Options:
//   failFirstStatus/Retry-After  -> return that status on the first N chat
//                                   calls to exercise the client's backoff.
//
// Start standalone:
//   node test/mock-bridge.mjs --port 20141
import http from "node:http";

export function createMockBridge({
  port = 20141,
  token = "mock-token",
  failFirstStatus = 0,
  failFirstRetryAfter = 0,
  failFirstCount = 1,
} = {}) {
  const calls = { total: 0, toolCalls: 0, sessionIds: [] };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, version: "mock", service: "arena-account-bridge" });
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      calls.total += 1;
      if (req.headers["x-codex-session-id"]) calls.sessionIds.push(req.headers["x-codex-session-id"]);
      const body = await readBody(req);

      // Authorized? The real bridge requires a Bearer key; our mock is lenient
      // unless the request includes a key (then it must match).
      const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (req.headers.authorization && auth !== token) {
        return json(res, 401, { error: { message: "Invalid bridge key" } });
      }

      // Exercise the client's backoff on the first N requests.
      if (failFirstStatus && calls.total <= failFirstCount) {
        res.writeHead(failFirstStatus, { "Retry-After": String(failFirstRetryAfter) });
        res.end(JSON.stringify({ error: { message: "transient" } }));
        return;
      }

      const messages = Array.isArray(body.messages) ? body.messages : [];
      const hasToolResult = messages.some((m) => m.role === "tool");
      const wantsStream = body.stream === true;

      // Detect a context-compaction summarization request (system prompt mentions
      // "context-compaction assistant") and return a real summary.
      const firstSystem = messages.find((m) => m.role === "system" || m.role === "developer");
      if (firstSystem && /context-compaction/i.test(firstSystem.content)) {
        return json(res, 200, {
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "MOCK-SUMMARY: user asked to implement features; assistant implemented and tested them.",
              },
              finish_reason: "stop",
            },
          ],
        });
      }

      // Detect a team-leader planning request -> return a JSON plan.
      if (firstSystem && /Team Leader/.test(firstSystem.content)) {
        return json(res, 200, {
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content:
                  'Here is the plan:\n```json\n[{"name":"backend","task":"implement the backend module"},{"name":"frontend","task":"implement the frontend UI"}]\n```',
              },
              finish_reason: "stop",
            },
          ],
        });
      }

      // Detect a final synthesizer request -> return a merged report.
      if (firstSystem && /final synthesizer/.test(firstSystem.content)) {
        return json(res, 200, {
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "MOCK-MERGED: backend and frontend sub-agents completed their work.",
              },
              finish_reason: "stop",
            },
          ],
        });
      }

      if (!hasToolResult) {
        calls.toolCalls += 1;
        return respondToolCall(res, wantsStream);
      }
      return respondAnswer(res, wantsStream);
    }

    return json(res, 404, { error: { message: "Not found" } });
  });

  return {
    server,
    calls,
    port,
    token,
    start() {
      return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(this)));
    },
    close() {
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function respondToolCall(res, stream) {
  if (!stream) {
    return json(res, 200, {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `mock_${Date.now()}`,
                type: "function",
                function: { name: "Write", arguments: JSON.stringify({ file_path: "output.txt", content: "hello from arena" }) },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });
  }

  const callId = `mock_${Date.now()}`;
  const argStr = JSON.stringify({ file_path: "output.txt", content: "hello from arena" });
  sseStart(res);
  sse(res, { choices: [{ index: 0, delta: { content: "Let me write a file." }, finish_reason: null }] });
  sse(res, {
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: callId, type: "function", function: { name: "Write", arguments: "" } }] } }],
  });
  const split = Math.floor(argStr.length / 2);
  sse(res, {
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: argStr.slice(0, split) } }] } }],
  });
  sse(res, {
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: argStr.slice(split) } }] } }],
  });
  sse(res, { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  sse(res, "[DONE]");
  res.end();
}

function respondAnswer(res, stream) {
  if (!stream) {
    return json(res, 200, {
      choices: [{ index: 0, message: { role: "assistant", content: "Wrote the file. All done." }, finish_reason: "stop" }],
    });
  }
  sseStart(res);
  sse(res, { choices: [{ index: 0, delta: { content: "Wrote " }, finish_reason: null }] });
  sse(res, { choices: [{ index: 0, delta: { content: "the file. All done." }, finish_reason: null }] });
  sse(res, { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  sse(res, "[DONE]");
  res.end();
}

function sseStart(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
}

function sse(res, payload) {
  const data = payload === "[DONE]" ? "[DONE]" : JSON.stringify(payload);
  res.write(`data: ${data}\n\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

// Standalone runner.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const argPort = process.argv.indexOf("--port");
  const port = argPort > -1 ? Number(process.argv[argPort + 1]) : 20141;
  const bridge = createMockBridge({ port });
  bridge.start().then(() => {
    console.log(`Mock bridge listening on http://127.0.0.1:${port} (token: ${bridge.token})`);
  });
}

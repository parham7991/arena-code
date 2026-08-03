// app.mjs — the main Arena Code TUI component (ink/React).
//
// Layout (top -> bottom):
//   header (session id, project, autonomy)
//   transcript (user/assistant/info/error messages)
//   live area (running tools + "Thinking…" spinner + live streaming text)
//   input line (❯) with multiline support
//
// Keys:
//   Ctrl+C      stop the running turn; when idle, quit
//   Tab / e     expand/collapse the last tool result
//   Enter       submit (Shift+Enter for newline in input)
//
// Commands: /help, /compact (stub), /clear, /quit
import React, { useReducer, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { createElement as h } from "react";
import { Spinner } from "./spinner.mjs";
import { ToolList } from "./tools.mjs";
import { MultilineInput } from "./multiline.mjs";

function fmtTokens(n) {
  return `${(n ?? 0).toLocaleString()} tok`;
}

const HELP_TEXT = `Arena Code — interactive coding agent

COMMANDS
  /help       Show this help.
  /compact    Compress the conversation into a summary to free context.
  /clear      Clear the on-screen transcript.
  /quit       Quit.

KEYS
  Ctrl+C      Stop the running turn (or quit when idle).
  Tab / e     Expand/collapse the last tool result.
  Enter       Send the message (Shift+Enter inserts a newline).

The agent edits files and runs commands on your local machine.`;

export function ArenaApp({
  engine,
  sessionId,
  projectRoot,
  autonomy = "ask",
}) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [tools, setTools] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [tokens, setTokens] = useState(() => {
    try {
      return typeof engine.tokenEstimate === "function" ? engine.tokenEstimate() : 0;
    } catch {
      return 0;
    }
  });
  const streamingRef = useRef("");
  const cancelRef = useRef(false);
  const [, bump] = useReducer((x) => x + 1, 0);

  function refreshTokens() {
    try {
      if (typeof engine.tokenEstimate === "function") setTokens(engine.tokenEstimate());
    } catch {
      /* ignore */
    }
  }

  function addInfo(text) {
    setTranscript((t) => [...t, { kind: "info", text }]);
  }

  function flushStreaming() {
    const s = streamingRef.current;
    if (s) setTranscript((t) => [...t, { kind: "assistant", text: s }]);
    streamingRef.current = "";
    bump();
  }

  async function run(text) {
    cancelRef.current = false;
    setRunning(true);
    setTools([]);
    setExpandedId(null);
    setTranscript((t) => [...t, { kind: "user", text }]);
    setThinking(true);
    try {
      const result = await engine.run(text, {
        onChunk: (c) => {
          if (cancelRef.current) return;
          streamingRef.current += c;
          bump();
        },
        onTokens: () => {
          if (!cancelRef.current) refreshTokens();
        },
        onTurn: () => {
          if (!cancelRef.current) {
            setThinking(true);
            refreshTokens();
          }
        },
        onPruned: (n) => {
          if (!cancelRef.current) addInfo(`Pruned ${n} large tool result(s) to free context.`);
        },
        onToolCall: ({ id, name, args }) => {
          if (cancelRef.current) return;
          flushStreaming();
          setThinking(false);
          setTools((prev) => [...prev, { id, name, args, status: "running", result: undefined }]);
        },
        onToolResult: ({ id, result }) => {
          if (cancelRef.current) return;
          setTools((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status: result?.error ? "error" : "done", result } : t))
          );
        },
        onContent: (content) => {
          if (cancelRef.current) return;
          if (streamingRef.current) {
            flushStreaming();
          } else if (content) {
            setTranscript((t) => [...t, { kind: "assistant", text: content }]);
          }
        },
      });
      if (result?.messages && typeof engine.save === "function") {
        engine.save(result.messages);
      }
      refreshTokens();
    } catch (error) {
      flushStreaming();
      setTranscript((t) => [...t, { kind: "error", text: String(error?.message || error) }]);
    } finally {
      setRunning(false);
      setThinking(false);
      setTools([]);
      setExpandedId(null);
      bump();
    }
  }

  function submit(text) {
    const t = text.trim();
    if (t.startsWith("/")) {
      const cmd = (t.split(/\s+/)[0] || "").toLowerCase();
      if (cmd === "/help") return addInfo(HELP_TEXT);
      if (cmd === "/quit") return exit();
      if (cmd === "/clear") return setTranscript([]);
      if (cmd === "/compact") {
        if (typeof engine.compact === "function") {
          (async () => {
            setThinking(true);
            try {
              const res = await engine.compact();
              refreshTokens();
              setTranscript([]);
              addInfo(
                `Context compacted (${res.mode}): ${res.before.toLocaleString()} → ${res.after.toLocaleString()} estimated tokens.`
              );
            } catch (error) {
              addInfo(`Compact failed: ${error.message}`);
            } finally {
              setThinking(false);
              bump();
            }
          })();
        } else {
          addInfo("Context compaction is not available in this engine.");
        }
        return;
      }
      if (cmd === "/continue") return addInfo("Resume the last session with: arena-code --continue");
      return addInfo(`Unknown command: ${cmd}. Try /help`);
    }
    if (t) run(t);
  }

  function toggleExpand() {
    const last = tools[tools.length - 1];
    if (!last?.result) return;
    setExpandedId((cur) => (cur === last.id ? null : last.id));
  }

  // App-level keys (Ctrl+C, expand). Text entry is handled by MultilineInput.
  useInput((inputChar, key) => {
    if (running) {
      if (key.ctrl && inputChar.toLowerCase() === "c") {
        cancelRef.current = true;
        addInfo("Stopped.");
        setRunning(false);
        setThinking(false);
        bump();
      }
      return;
    }
    if (key.ctrl && inputChar.toLowerCase() === "c") {
      exit();
      return;
    }
    if (key.tab) {
      toggleExpand();
    }
  });

  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      h(Text, { bold: true, color: "magenta" }, "Arena Code"),
      h(
        Text,
        { dimColor: true },
        `session ${sessionId} · cwd ${projectRoot} · autonomy ${autonomy} · ctx ${fmtTokens(tokens)}`
      )
    ),
    h(Transcript, { items: transcript }),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(ToolList, { tools, expandedId, onToggle: toggleExpand }),
      thinking ? h(Spinner, { label: "Thinking…" }) : null,
      streamingRef.current ? h(Text, { dimColor: true, wrap: "wrap" }, streamingRef.current) : null
    ),
    h(Text, null),
    h(MultilineInput, { value: input, onChange: setInput, onSubmit: submit, active: !running }),
    h(
      Text,
      { dimColor: true },
      running ? "Ctrl+C stop · Tab expand" : "Enter send · Shift+Enter newline · /help"
    )
  );
}

/** Render the transcript as colored text lines. */
function Transcript({ items }) {
  return h(
    Box,
    { flexDirection: "column" },
    items.map((it, i) => {
      const text = String(it.text || "");
      if (it.kind === "user") {
        return h(Box, { key: i, flexDirection: "row" }, h(Text, { color: "blue", bold: true }, "❯ "), h(Text, { wrap: "wrap" }, text));
      }
      if (it.kind === "error") {
        return h(Text, { key: i, color: "red", wrap: "wrap" }, `✖ ${text}`);
      }
      if (it.kind === "info") {
        return h(Text, { key: i, color: "yellow", dimColor: true, wrap: "wrap" }, text);
      }
      return h(Text, { key: i, wrap: "wrap" }, text);
    })
  );
}

// app.mjs — the main Arena Code TUI component (ink/React).
//
// Layout (top -> bottom):
//   header (session id, project, autonomy, ctx tokens)
//   transcript (user/assistant/info/error messages)
//   live area (running tools + "Thinking…" spinner + live streaming text)
//   input line (❯) with multiline support
//
// Keys: Ctrl+C (stop/quit), Tab/e (expand). Slash commands route through the
// runtime's command registry (theme/i18n aware).
import React, { useReducer, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { createElement as h } from "react";
import { Spinner } from "./spinner.mjs";
import { ToolList } from "./tools.mjs";
import { MultilineInput } from "./multiline.mjs";
import { getI18n } from "../i18n.mjs";

function fmtTokens(n) {
  return `${(n ?? 0).toLocaleString()} tok`;
}

function cmdHelp(commandRegistry) {
  const cmds = commandRegistry ? commandRegistry.all() : [];
  const rows = cmds.map((c) => `  /${c.name.padEnd(12)} ${c.description}`).join("\n");
  return `Arena Code — interactive coding agent\n\nCOMMANDS\n${rows}\n\nKEYS\n  Ctrl+C      Stop the running turn (or quit when idle).\n  Tab / e     Expand/collapse the last tool result.\n  Enter       Send the message (Shift+Enter inserts a newline).\n\nThe agent edits files and runs commands on your local machine.`;
}

export function ArenaApp({
  engine,
  sessionId,
  projectRoot,
  autonomy = "ask",
  runtime,
  cmdCtx,
}) {
  const { exit } = useApp();
  const commandRegistry = runtime?.commandRegistry;
  const colors = runtime?.theme?.colors || { primary: "magenta", secondary: "cyan", success: "green", error: "red", warning: "yellow", muted: "gray" };
  const t = runtime?.i18n?.t || getI18n("en").t;

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
    setTranscript((tx) => [...tx, { kind: "info", text }]);
  }

  function flushStreaming() {
    const s = streamingRef.current;
    if (s) setTranscript((tx) => [...tx, { kind: "assistant", text: s }]);
    streamingRef.current = "";
    bump();
  }

  // Context passed to slash-command handlers.
  const buildCmdContext = () => ({
    engine,
    store: cmdCtx?.store,
    config: runtime?.config,
    projectRoot,
    ctx: cmdCtx?.ctx || { projectRoot },
    clear: () => setTranscript([]),
    quit: () => exit(),
    helpText: cmdHelp(commandRegistry),
    theme: runtime?.theme?.name || "default",
    setTheme: (name) => addInfo(`Theme ${name} (applies next launch; set ARENA_THEME or theme.json).`),
    lang: runtime?.i18n?.code || "en",
    setLang: (code) => addInfo(`Language ${code} (applies next launch; set ARENA_LANG).`),
    runTeam: (task) => engine.runTeam(task),
    plugins: runtime?.plugins || [],
  });

  async function run(text) {
    cancelRef.current = false;
    setRunning(true);
    setTools([]);
    setExpandedId(null);
    setTranscript((tx) => [...tx, { kind: "user", text }]);
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
          setTools((prev) => prev.map((tt) => (tt.id === id ? { ...tt, status: result?.error ? "error" : "done", result } : tt)));
        },
        onContent: (content) => {
          if (cancelRef.current) return;
          if (streamingRef.current) flushStreaming();
          else if (content) setTranscript((tx) => [...tx, { kind: "assistant", text: content }]);
        },
      });
      if (result?.messages && typeof engine.save === "function") engine.save(result.messages);
      refreshTokens();
    } catch (error) {
      flushStreaming();
      setTranscript((tx) => [...tx, { kind: "error", text: String(error?.message || error) }]);
    } finally {
      setRunning(false);
      setThinking(false);
      setTools([]);
      setExpandedId(null);
      bump();
    }
  }

  async function submit(text) {
    const t = text.trim();
    if (t.startsWith("/")) {
      // Route through the command registry if present.
      if (commandRegistry && typeof commandRegistry.run === "function") {
        const ctx = buildCmdContext();
        const result = await commandRegistry.run(t, ctx);
        if (result) {
          if (result.error) addInfo(`✖ ${result.error}`);
          else if (typeof result === "string") addInfo(result);
        }
        return;
      }
      // Fallback minimal handling.
      const cmd = (t.split(/\s+/)[0] || "").toLowerCase();
      if (cmd === "/help") return addInfo(cmdHelp(null));
      if (cmd === "/quit") return exit();
      if (cmd === "/clear") return setTranscript([]);
      if (cmd === "/compact" && typeof engine.compact === "function") {
        const res = await engine.compact();
        addInfo(`Context compacted (${res.mode}): ${res.before} → ${res.after} tokens.`);
        return;
      }
      return addInfo(`Unknown command: ${cmd}. Try /help`);
    }
    if (t) run(t);
  }

  function toggleExpand() {
    const last = tools[tools.length - 1];
    if (!last?.result) return;
    setExpandedId((cur) => (cur === last.id ? null : last.id));
  }

  useInput((inputChar, key) => {
    if (running) {
      if (key.ctrl && inputChar.toLowerCase() === "c") {
        cancelRef.current = true;
        addInfo(t("ui.stopped"));
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
    // Tab: if typing a slash command, let the input autocomplete; otherwise expand.
    if (key.tab) {
      if (input.startsWith("/")) return; // handled by MultilineInput
      toggleExpand();
    }
  });

  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      h(Text, { bold: true, color: colors.primary }, t("ui.header")),
      h(
        Text,
        { dimColor: true },
        `${t("ui.session")} ${sessionId} · ${t("ui.cwd")} ${projectRoot} · ${t("ui.autonomy")} ${autonomy} · ${t("ui.ctx")} ${fmtTokens(tokens)}`
      )
    ),
    h(Transcript, { items: transcript, colors }),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(ToolList, { tools, expandedId, onToggle: toggleExpand }),
      thinking ? h(Spinner, { label: t("ui.thinking") }) : null,
      streamingRef.current ? h(Text, { dimColor: true, wrap: "wrap" }, streamingRef.current) : null
    ),
    h(Text, null),
    h(MultilineInput, { value: input, onChange: setInput, onSubmit: submit, active: !running, prompt: t("ui.prompt"), commands: commandRegistry ? commandRegistry.all().map((c) => ({ name: c.name, description: c.description })) : [] }),
    h(Text, { dimColor: true }, running ? t("ui.stop") + " · " + t("ui.expand") : t("ui.send") + " · " + t("ui.newline") + " · /help")
  );
}

/** Render the transcript as colored text lines. */
function Transcript({ items, colors }) {
  return h(
    Box,
    { flexDirection: "column" },
    items.map((it, i) => {
      const text = String(it.text || "");
      if (it.kind === "user") {
        return h(Box, { key: i, flexDirection: "row" }, h(Text, { color: colors.secondary, bold: true }, "❯ "), h(Text, { wrap: "wrap" }, text));
      }
      if (it.kind === "error") {
        return h(Text, { key: i, color: colors.error, wrap: "wrap" }, `✖ ${text}`);
      }
      if (it.kind === "info") {
        return h(Text, { key: i, color: colors.warning, dimColor: true, wrap: "wrap" }, text);
      }
      return h(Text, { key: i, wrap: "wrap" }, text);
    })
  );
}

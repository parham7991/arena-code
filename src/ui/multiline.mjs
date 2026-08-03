// multiline.mjs — a multiline text input built on ink's useInput.
//   Enter        -> submit
//   Shift+Enter  -> insert a newline
//   Backspace/Delete/Home/End/arrows -> edit the buffer
//   Ctrl+U       -> clear the buffer
//   Tab          -> autocomplete a slash command (if the value starts with /)
//   Up/Down      -> cycle command suggestions when typing a /command
import React, { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { createElement as h } from "react";

export function MultilineInput({
  value = "",
  onChange,
  onSubmit,
  prompt = "❯ ",
  active = true,
  placeholder = "Type a message…",
  commands = [], // [{name, description}]
}) {
  const cursorRef = useRef(value.length);
  const [cursor, setCursorState] = useState(value.length);
  const [selIdx, setSelIdx] = useState(0);
  const setCursor = (n) => {
    cursorRef.current = n;
    setCursorState(n);
  };

  // Compute matching slash-command suggestions when the input starts with "/".
  const isSlash = value.startsWith("/");
  const slashPart = isSlash ? value.slice(1).split(/\s/)[0].toLowerCase() : "";
  const matches = isSlash && slashPart.length > 0
    ? commands.filter((c) => c.name.startsWith(slashPart)).slice(0, 6)
    : [];
  const showSuggestions = isSlash && matches.length > 0 && !value.includes(" ");

  function applyCommand(name) {
    onChange?.("/" + name + " ");
    setCursor(("/" + name + " ").length);
    setSelIdx(0);
  }

  useInput((input, key) => {
    if (!active) return;
    const cur = cursorRef.current;
    if (key.ctrl && input.toLowerCase() === "u") {
      onChange?.(""); setCursor(0); return;
    }
    // Tab autocompletes a slash command.
    if (key.tab && showSuggestions) {
      applyCommand(matches[selIdx % matches.length].name);
      return;
    }
    if (key.return && !key.shift) {
      const text = value;
      if (text.trim()) { onChange?.(""); setCursor(0); onSubmit?.(text); }
      return;
    }
    if (key.return && key.shift) {
      onChange?.(value.slice(0, cur) + "\n" + value.slice(cur)); setCursor(cur + 1); return;
    }
    if (key.backspace) {
      if (cur > 0) { onChange?.(value.slice(0, cur - 1) + value.slice(cur)); setCursor(cur - 1); }
      return;
    }
    if (key.delete) {
      if (cur < value.length) onChange?.(value.slice(0, cur) + value.slice(cur + 1));
      return;
    }
    if (key.leftArrow) { setCursor(Math.max(0, cur - 1)); return; }
    if (key.rightArrow) { setCursor(Math.min(value.length, cur + 1)); return; }
    if (key.home) { setCursor(0); return; }
    if (key.end) { setCursor(value.length); return; }
    // Up/Down cycle command suggestions when typing /.
    if ((key.upArrow || key.downArrow) && showSuggestions) {
      const d = key.upArrow ? -1 : 1;
      setSelIdx((i) => (i + d + matches.length) % matches.length);
      return;
    }
    if (key.upArrow || key.downArrow) return;
    if (input && input.length === 1) {
      // reset suggestion selection on typing
      setSelIdx(0);
      onChange?.(value.slice(0, cur) + input + value.slice(cur));
      setCursor(cur + 1);
    }
  });

  const display = value || placeholder;
  const lines = value.split("\n");
  const cursorLine = value.slice(0, cursor).split("\n").length - 1;

  return h(
    Box,
    { flexDirection: "column" },
    // command suggestion popup
    showSuggestions
      ? h(
          Box,
          { flexDirection: "column", marginBottom: 0 },
          matches.map((m, i) =>
            h(Text, { key: m.name, color: i === selIdx % matches.length ? "cyan" : "gray", bold: i === selIdx % matches.length },
              (i === selIdx % matches.length ? "❯ " : "  ") + "/" + m.name + (m.description ? "  " + m.description : ""))
          )
        )
      : null,
    h(
      Box,
      { flexDirection: "row" },
      h(Text, { color: "magenta", bold: true }, prompt),
      h(Text, { dimColor: !value }, value.slice(0, cursor)),
      h(Text, { inverse: true }, cursor < value.length ? value[cursor] : " "),
      h(Text, { dimColor: !value }, value.length > cursor ? value.slice(cursor + 1) : "")
    )
  );
}

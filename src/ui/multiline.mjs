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
  // Keep the latest value/cursor in refs so rapid keystrokes (type/delete) always
  // operate on the freshest state (avoids stale-closure backspace bugs).
  const valueRef = useRef(value);
  const cursorRef = useRef(value.length);
  const [, force] = useState(0);
  const setValue = (v) => {
    valueRef.current = v;
    onChange?.(v);
  };
  const setCursor = (n) => {
    cursorRef.current = n;
    force((x) => x + 1); // re-render for cursor display
  };
  const selRef = useRef(0);

  // Sync external value changes into the ref.
  if (valueRef.current !== value) valueRef.current = value;

  // Compute matching slash-command suggestions when the input starts with "/".
  const isSlash = value.startsWith("/");
  const slashPart = isSlash ? value.slice(1).split(/\s/)[0].toLowerCase() : "";
  const matches = isSlash && slashPart.length > 0
    ? commands.filter((c) => c.name.startsWith(slashPart)).slice(0, 6)
    : [];
  const showSuggestions = isSlash && matches.length > 0 && !value.includes(" ");

  function applyCommand(name) {
    setValue("/" + name + " ");
    setCursor(("/" + name + " ").length);
    selRef.current = 0;
  }

  useInput((input, key) => {
    if (!active) return;
    const cur = cursorRef.current;
    const val = valueRef.current;

    if (key.ctrl && (input || "").toLowerCase() === "u") {
      setValue(""); setCursor(0); return;
    }
    // Tab autocompletes a slash command.
    if (key.tab && showSuggestions) {
      applyCommand(matches[selRef.current % matches.length].name);
      return;
    }
    if (key.return && !key.shift) {
      const text = val;
      if (text.trim()) { setValue(""); setCursor(0); onSubmit?.(text); }
      return;
    }
    if (key.return && key.shift) {
      setValue(val.slice(0, cur) + "\n" + val.slice(cur)); setCursor(cur + 1); return;
    }
    if (key.backspace) {
      if (cur > 0) { setValue(val.slice(0, cur - 1) + val.slice(cur)); setCursor(cur - 1); }
      return;
    }
    if (key.delete) {
      if (cur < val.length) setValue(val.slice(0, cur) + val.slice(cur + 1));
      return;
    }
    if (key.leftArrow) { setCursor(Math.max(0, cur - 1)); return; }
    if (key.rightArrow) { setCursor(Math.min(val.length, cur + 1)); return; }
    if (key.home) { setCursor(0); return; }
    if (key.end) { setCursor(val.length); return; }
    // Up/Down cycle command suggestions when typing /.
    if ((key.upArrow || key.downArrow) && showSuggestions) {
      const d = key.upArrow ? -1 : 1;
      selRef.current = (selRef.current + d + matches.length) % matches.length;
      force((x) => x + 1);
      return;
    }
    if (key.upArrow || key.downArrow) return;
    if (input && input.length === 1) {
      selRef.current = 0;
      setValue(val.slice(0, cur) + input + val.slice(cur));
      setCursor(cur + 1);
    }
  });

  const display = value || placeholder;

  return h(
    Box,
    { flexDirection: "column" },
    showSuggestions
      ? h(
          Box,
          { flexDirection: "column", marginBottom: 0 },
          matches.map((m, i) =>
            h(Text, { key: m.name, color: i === selRef.current % matches.length ? "cyan" : "gray", bold: i === selRef.current % matches.length },
              (i === selRef.current % matches.length ? "❯ " : "  ") + "/" + m.name + (m.description ? "  " + m.description : ""))
          )
        )
      : null,
    h(
      Box,
      { flexDirection: "row" },
      h(Text, { color: "magenta", bold: true }, prompt),
      h(Text, { dimColor: !value }, value.slice(0, cursorRef.current)),
      h(Text, { inverse: true }, cursorRef.current < value.length ? value[cursorRef.current] : " "),
      h(Text, { dimColor: !value }, value.length > cursorRef.current ? value.slice(cursorRef.current + 1) : "")
    )
  );
}

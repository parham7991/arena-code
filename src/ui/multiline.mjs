// multiline.mjs — a multiline text input built on ink's useInput.
//   Enter        -> submit
//   Shift+Enter  -> insert a newline
//   Backspace/Delete/arrows -> edit the buffer
//   Ctrl+U       -> clear the buffer
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
}) {
  const cursorRef = useRef(value.length);
  const [cursor, setCursorState] = useState(value.length);
  const setCursor = (n) => {
    cursorRef.current = n;
    setCursorState(n);
  };

  useInput((input, key) => {
    if (!active) return;
    const cur = cursorRef.current;
    // Ctrl+C handled by the app (stop/quit). Ctrl+U clears the buffer.
    if (key.ctrl && input.toLowerCase() === "u") {
      onChange?.("");
      setCursor(0);
      return;
    }
    if (key.return && !key.shift) {
      const text = value;
      if (text.trim()) {
        onChange?.("");
        setCursor(0);
        onSubmit?.(text);
      }
      return;
    }
    if (key.return && key.shift) {
      onChange?.(value.slice(0, cur) + "\n" + value.slice(cur));
      setCursor(cur + 1);
      return;
    }
    if (key.backspace) {
      if (cur > 0) {
        onChange?.(value.slice(0, cur - 1) + value.slice(cur));
        setCursor(cur - 1);
      }
      return;
    }
    if (key.delete) {
      if (cur < value.length) {
        onChange?.(value.slice(0, cur) + value.slice(cur + 1));
      }
      return;
    }
    if (key.leftArrow) {
      setCursor(Math.max(0, cur - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor(Math.min(value.length, cur + 1));
      return;
    }
    if (key.upArrow || key.downArrow) return;
    if (input && input.length === 1) {
      onChange?.(value.slice(0, cur) + input + value.slice(cur));
      setCursor(cur + 1);
    }
  });

  const display = value || placeholder;

  return h(
    Box,
    { flexDirection: "row" },
    h(Text, { color: "magenta", bold: true }, prompt),
    h(Text, { wrap: "wrap", dimColor: !value }, display.slice(0, Math.min(cursor, display.length))),
    h(Text, { inverse: true }, cursor < value.length ? value[cursor] : " "),
    h(Text, { wrap: "wrap", dimColor: !value }, value.length > cursor ? value.slice(cursor + 1) : "")
  );
}

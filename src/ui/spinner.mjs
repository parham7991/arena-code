// spinner.mjs — a lightweight spinner component built on raw ink primitives.
// Cycles through braille frames via an interval. Testable with renderToString
// (which renders the initial frame synchronously).
import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { createElement as h } from "react";

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({
  label = "Thinking...",
  frames = DEFAULT_FRAMES,
  speed = 80,
  color = "cyan",
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % frames.length), speed);
    return () => clearInterval(t);
  }, [frames.length, speed]);
  const frame = frames[i % frames.length];
  return h(Text, { color }, `${frame} ${label}`);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getTheme, THEMES, THEME_NAMES, loadTheme } from "../src/theme.mjs";
import { initI18n, getI18n, SUPPORTED } from "../src/i18n.mjs";

test("themes expose semantic colors", () => {
  for (const name of THEME_NAMES) {
    const t = getTheme(name);
    for (const key of ["primary", "secondary", "success", "error", "warning", "muted", "border"]) {
      assert.ok(t[key], `${name}.${key}`);
    }
  }
});

test("loadTheme falls back to default for unknown names", () => {
  assert.equal(loadTheme("nope", os.tmpdir()).name, "default");
  assert.equal(loadTheme("nord", os.tmpdir()).colors.primary, THEMES.nord.primary);
});

test("loadTheme reads custom theme.json", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-theme-"));
  fs.writeFileSync(path.join(dataDir, "theme.json"), JSON.stringify({ name: "custom", colors: { primary: "red" } }));
  const t = loadTheme(null, dataDir);
  assert.equal(t.name, "custom");
  assert.equal(t.colors.primary, "red");
});

test("i18n supports en and fa", () => {
  const en = getI18n("en");
  assert.equal(en.t("ui.header"), "Arena Code");
  const fa = getI18n("fa");
  assert.equal(fa.t("ui.header"), "آرنا کد");
  assert.equal(fa.t("ui.thinking"), "در حال تفکر…");
});

test("i18n returns the key for unknown entries", () => {
  const en = getI18n("en");
  assert.equal(en.t("nope.nothere"), "nope.nothere");
});

test("SUPPORTED lists en and fa", () => {
  assert.ok(SUPPORTED.includes("en"));
  assert.ok(SUPPORTED.includes("fa"));
});

test("initI18n detects fa from env", () => {
  const fa = initI18n(null);
  assert.ok(fa.code);
  assert.ok(fa.t);
});

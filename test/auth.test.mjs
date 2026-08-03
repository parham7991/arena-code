import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { saveCredentials, loadCredentials, hasCredentials, saveUserPrefs, loadUserPrefs } from "../src/auth.mjs";

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "arena-auth-"));
}

test("saveCredentials encrypts and loadCredentials decrypts", () => {
  const dataDir = tmpDataDir();
  const file = saveCredentials(dataDir, { email: "a@b.com", password: "secret123", bridgeUrl: "http://x:1" });
  assert.ok(fs.existsSync(file));
  // raw file must not contain the plaintext password
  const raw = fs.readFileSync(file, "utf8");
  assert.ok(!raw.includes("secret123"), "password must be encrypted at rest");

  const creds = loadCredentials(dataDir);
  assert.equal(creds.email, "a@b.com");
  assert.equal(creds.password, "secret123");
  assert.equal(creds.bridgeUrl, "http://x:1");
});

test("hasCredentials reflects saved state", () => {
  const dataDir = tmpDataDir();
  assert.equal(hasCredentials(dataDir), false);
  saveCredentials(dataDir, { email: "a@b.com", password: "pw" });
  assert.equal(hasCredentials(dataDir), true);
});

test("saveUserPrefs + loadUserPrefs round-trip theme/lang", () => {
  const dataDir = tmpDataDir();
  saveUserPrefs(dataDir, { theme: "nord", lang: "fa" });
  const prefs = loadUserPrefs(dataDir);
  assert.equal(prefs.theme, "nord");
  assert.equal(prefs.lang, "fa");
});

test("loadCredentials returns null when none saved", () => {
  assert.equal(loadCredentials(tmpDataDir()), null);
});

test("file permissions are 0600", () => {
  const dataDir = tmpDataDir();
  const file = saveCredentials(dataDir, { email: "a@b.com", password: "pw" });
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600);
});

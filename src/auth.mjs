// auth.mjs — secure storage of Arena credentials (email + password) so the
// bridge can log in now and re-login (auto-refresh) later. Uses AES-256-GCM,
// file mode 0600. A local encryption key is stored in DATA_DIR/.auth-key.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export function authDir(dataDir) {
  return path.join(dataDir || path.join(os.homedir(), ".arena-code"), "auth");
}

function loadKey(dataDir) {
  const dir = authDir(dataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(dir, ".auth-key");
  let key = Buffer.alloc(0);
  try {
    key = fs.readFileSync(keyFile);
  } catch {
    key = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, key, { mode: 0o600 });
  }
  return key;
}

function encrypt(dataDir, plain) {
  const key = loadKey(dataDir);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("base64"), tag: tag.toString("base64"), data: enc.toString("base64") };
}

function decrypt(dataDir, obj) {
  const key = loadKey(dataDir);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(obj.iv, "base64"));
  decipher.setAuthTag(Buffer.from(obj.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(obj.data, "base64")), decipher.final()]).toString("utf8");
}

const credFile = (dataDir) => path.join(authDir(dataDir), "credentials.json");

/** Save encrypted email + password for the bridge to reuse on login. */
export function saveCredentials(dataDir, { email, password, bridgeUrl }) {
  const file = credFile(dataDir);
  const payload = {
    email,
    password: encrypt(dataDir, password),
    bridgeUrl: bridgeUrl || "http://127.0.0.1:20140",
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload), { mode: 0o600 });
  return file;
}

/** Load stored credentials; returns { email, password, bridgeUrl } or null. */
export function loadCredentials(dataDir) {
  const file = credFile(dataDir);
  try {
    if (!fs.existsSync(file)) return null;
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      email: obj.email,
      password: decrypt(dataDir, obj.password),
      bridgeUrl: obj.bridgeUrl || "http://127.0.0.1:20140",
      updatedAt: obj.updatedAt,
    };
  } catch {
    return null;
  }
}

/** True if saved credentials exist. */
export function hasCredentials(dataDir) {
  return loadCredentials(dataDir) !== null;
}

/** Save UI prefs (theme, lang) to user config. */
export function saveUserPrefs(dataDir, { theme, lang } = {}) {
  const base = dataDir || path.join(os.homedir(), ".arena-code");
  fs.mkdirSync(base, { recursive: true });
  const cfgFile = path.join(base, "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
  } catch {
    /* ignore */
  }
  if (theme) cfg.theme = theme;
  if (lang) cfg.lang = lang;
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfgFile;
}

/** Load user prefs. */
export function loadUserPrefs(dataDir) {
  const base = dataDir || path.join(os.homedir(), ".arena-code");
  try {
    return JSON.parse(fs.readFileSync(path.join(base, "config.json"), "utf8"));
  } catch {
    return {};
  }
}

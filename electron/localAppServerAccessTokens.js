const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ACCESS_TOKENS_FILE = "pl-server-access-tokens.json";

function tokensPath(userDataPath) {
  return path.join(userDataPath, ACCESS_TOKENS_FILE);
}

function normalizeCompanyIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const id of raw) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 200) break;
  }
  return out;
}

function normalizeInvitedEmails(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const email of raw) {
    const s = String(email || "").trim().toLowerCase();
    if (!s || !s.includes("@") || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 50) break;
  }
  return out;
}

function loadAccessTokenStore(userDataPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(tokensPath(userDataPath), "utf8"));
    const tokens = Array.isArray(raw.tokens) ? raw.tokens : [];
    return { tokens };
  } catch (_) {
    return { tokens: [] };
  }
}

function saveAccessTokenStore(userDataPath, store) {
  try {
    fs.mkdirSync(path.dirname(tokensPath(userDataPath)), { recursive: true });
    fs.writeFileSync(tokensPath(userDataPath), JSON.stringify(store, null, 2), "utf8");
  } catch (_) {}
}

function listAccessTokens(userDataPath) {
  const store = loadAccessTokenStore(userDataPath);
  return store.tokens
    .filter((t) => t && !t.revokedAt)
    .map((t) => ({
      id: t.id,
      label: t.label || "User",
      email: t.email || null,
      uid: t.uid || null,
      createdAt: t.createdAt || null,
      lastUsedAt: t.lastUsedAt || null,
      tokenPreview: t.token ? `${t.token.slice(0, 6)}…${t.token.slice(-4)}` : "",
      allowedCompanyIds: normalizeCompanyIds(t.allowedCompanyIds),
      invitedEmails: normalizeInvitedEmails(t.invitedEmails),
    }));
}

function findTokenRecord(store, token) {
  if (!token || typeof token !== "string") return null;
  return store.tokens.find((t) => t && !t.revokedAt && t.token === token) || null;
}

function getAccessTokenRecord(userDataPath, token) {
  const store = loadAccessTokenStore(userDataPath);
  return findTokenRecord(store, token);
}

function validateAccessToken(userDataPath, token) {
  const rec = getAccessTokenRecord(userDataPath, token);
  if (!rec) return false;
  const store = loadAccessTokenStore(userDataPath);
  const live = findTokenRecord(store, token);
  if (live) {
    live.lastUsedAt = new Date().toISOString();
    saveAccessTokenStore(userDataPath, store);
  }
  return true;
}

function createAccessToken(userDataPath, input = {}) {
  const store = loadAccessTokenStore(userDataPath);
  const allowedCompanyIds = normalizeCompanyIds(input.allowedCompanyIds);
  const token = crypto.randomBytes(32).toString("hex");
  const id = crypto.randomBytes(8).toString("hex");
  const rec = {
    id,
    token,
    label: String(input.label || "Shared user").slice(0, 120),
    email: input.email ? String(input.email).slice(0, 200) : null,
    uid: input.uid ? String(input.uid).slice(0, 128) : null,
    allowedCompanyIds,
    createdAt: new Date().toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
  store.tokens.push(rec);
  saveAccessTokenStore(userDataPath, store);
  return {
    id: rec.id,
    token: rec.token,
    label: rec.label,
    email: rec.email,
    uid: rec.uid,
    allowedCompanyIds: rec.allowedCompanyIds,
    createdAt: rec.createdAt,
  };
}

function revokeAccessToken(userDataPath, id) {
  const store = loadAccessTokenStore(userDataPath);
  const rec = store.tokens.find((t) => t && t.id === id);
  if (!rec) return false;
  rec.revokedAt = new Date().toISOString();
  saveAccessTokenStore(userDataPath, store);
  return true;
}

function getAccessTokenSecret(userDataPath, id) {
  const store = loadAccessTokenStore(userDataPath);
  const rec = store.tokens.find((t) => t && t.id === id && !t.revokedAt);
  if (!rec || !rec.token) return null;
  return {
    id: rec.id,
    token: rec.token,
    label: rec.label || "Shared user",
    allowedCompanyIds: normalizeCompanyIds(rec.allowedCompanyIds),
  };
}

/** New secret string — same token row id (old secret stops working). */
function rotateAccessToken(userDataPath, id, input = {}) {
  const store = loadAccessTokenStore(userDataPath);
  const rec = store.tokens.find((t) => t && t.id === id && !t.revokedAt);
  if (!rec) return null;
  rec.token = crypto.randomBytes(32).toString("hex");
  if (input.label != null) {
    rec.label = String(input.label || rec.label || "Shared user").slice(0, 120);
  }
  if (input.allowedCompanyIds != null) {
    rec.allowedCompanyIds = normalizeCompanyIds(input.allowedCompanyIds);
  }
  saveAccessTokenStore(userDataPath, store);
  return {
    id: rec.id,
    token: rec.token,
    label: rec.label,
    email: rec.email || null,
    uid: rec.uid || null,
    allowedCompanyIds: normalizeCompanyIds(rec.allowedCompanyIds),
    createdAt: rec.createdAt || null,
  };
}

function updateAccessToken(userDataPath, id, input = {}) {
  const store = loadAccessTokenStore(userDataPath);
  const rec = store.tokens.find((t) => t && t.id === id && !t.revokedAt);
  if (!rec) return null;
  if (input.label != null) {
    rec.label = String(input.label || rec.label || "Shared user").slice(0, 120);
  }
  if (input.allowedCompanyIds != null) {
    rec.allowedCompanyIds = normalizeCompanyIds(input.allowedCompanyIds);
  }
  if (input.invitedEmails != null) {
    rec.invitedEmails = normalizeInvitedEmails(input.invitedEmails);
  }
  saveAccessTokenStore(userDataPath, store);
  const ids = normalizeCompanyIds(rec.allowedCompanyIds);
  return {
    id: rec.id,
    label: rec.label || "User",
    email: rec.email || null,
    uid: rec.uid || null,
    createdAt: rec.createdAt || null,
    lastUsedAt: rec.lastUsedAt || null,
    tokenPreview: rec.token ? `${rec.token.slice(0, 6)}…${rec.token.slice(-4)}` : "",
    allowedCompanyIds: ids,
    invitedEmails: normalizeInvitedEmails(rec.invitedEmails),
  };
}

module.exports = {
  listAccessTokens,
  getAccessTokenRecord,
  validateAccessToken,
  createAccessToken,
  getAccessTokenSecret,
  rotateAccessToken,
  updateAccessToken,
  revokeAccessToken,
  normalizeCompanyIds,
  normalizeInvitedEmails,
};

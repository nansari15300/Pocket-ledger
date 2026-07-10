import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  LocalAppServerAccessTokenSummary,
  LocalAppServerConfig,
  LocalAppServerStatus,
} from "@/lib/electronLocalServer";

const CONFIG_FILE = "pl-local-server-config.json";
const ACCESS_TOKENS_FILE = "pl-server-access-tokens.json";
const RUNTIME_FILE = "pl-dev-server-runtime.json";

const PL_CLIENT_HEADER = "x-pocket-ledger-app";
const PL_ACCESS_HEADER = "x-pocket-ledger-access";
const PL_ELECTRON_MARKER_HEADER = "x-pocket-ledger-client";

const DEFAULT_CONFIG: LocalAppServerConfig = {
  port: 37123,
  bindMode: "localhost",
  appOnlyAccess: true,
  autoStartOnBoot: false,
  userWantsRunning: true,
  appRole: "both",
  remoteServerUrl: "",
  clientAccessToken: "",
  publicHost: "",
  requireRemoteAccessToken: true,
  selectedInviteUrls: [],
};

export function devUserDataDir(): string {
  return path.join(process.cwd(), ".data", "pl-dev-server-userdata");
}

function configPath(): string {
  return path.join(devUserDataDir(), CONFIG_FILE);
}

function tokensPath(): string {
  return path.join(devUserDataDir(), ACCESS_TOKENS_FILE);
}

function runtimePath(): string {
  return path.join(devUserDataDir(), RUNTIME_FILE);
}

function ensureDir(): void {
  fs.mkdirSync(devUserDataDir(), { recursive: true });
}

function normalizeAppRole(raw: unknown): LocalAppServerConfig["appRole"] {
  if (raw === "server" || raw === "client" || raw === "both") return raw;
  return "both";
}

function normalizeBindMode(raw: unknown): LocalAppServerConfig["bindMode"] {
  if (raw === "lan" || raw === "internet") return raw;
  return "localhost";
}

export function normalizeCompanyIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 200) break;
  }
  return out;
}

export function normalizeInvitedEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const email of raw) {
    const s = String(email || "").trim().toLowerCase();
    if (!s || !s.includes("@") || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 50) break;
  }
  return out;
}

export function loadDevConfig(): LocalAppServerConfig {
  ensureDir();
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Record<string, unknown>;
    const port = Number(raw.port);
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      port: Number.isFinite(port) && port > 0 && port < 65536 ? port : DEFAULT_CONFIG.port,
      bindMode: normalizeBindMode(raw.bindMode),
      appOnlyAccess: raw.appOnlyAccess !== false,
      autoStartOnBoot: raw.autoStartOnBoot === true,
      userWantsRunning: raw.userWantsRunning !== false,
      appRole: normalizeAppRole(raw.appRole),
      remoteServerUrl: typeof raw.remoteServerUrl === "string" ? raw.remoteServerUrl.trim() : "",
      clientAccessToken: typeof raw.clientAccessToken === "string" ? raw.clientAccessToken.trim() : "",
      publicHost: typeof raw.publicHost === "string" ? raw.publicHost.trim() : "",
      requireRemoteAccessToken: raw.requireRemoteAccessToken !== false,
      selectedInviteUrls: normalizeSelectedInviteUrls(raw.selectedInviteUrls),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function normalizeSelectedInviteUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item || "").trim();
    if (s) out.push(s);
  }
  return out;
}

export function saveDevConfig(partial: Partial<LocalAppServerConfig>): LocalAppServerConfig {
  const next = { ...loadDevConfig(), ...partial };
  if (partial.appRole != null) next.appRole = normalizeAppRole(partial.appRole);
  if (partial.bindMode != null) next.bindMode = normalizeBindMode(partial.bindMode);
  ensureDir();
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

type RuntimeState = { running?: boolean; port?: number | null };

function readRuntime(): RuntimeState {
  try {
    return JSON.parse(fs.readFileSync(runtimePath(), "utf8")) as RuntimeState;
  } catch {
    return {};
  }
}

export function writeRuntime(state: RuntimeState): void {
  ensureDir();
  fs.writeFileSync(runtimePath(), JSON.stringify(state, null, 2), "utf8");
}

function loadTokenStore(): { tokens: Array<Record<string, unknown>> } {
  ensureDir();
  try {
    const raw = JSON.parse(fs.readFileSync(tokensPath(), "utf8")) as { tokens?: unknown };
    return { tokens: Array.isArray(raw.tokens) ? raw.tokens : [] };
  } catch {
    return { tokens: [] };
  }
}

function saveTokenStore(store: { tokens: Array<Record<string, unknown>> }): void {
  ensureDir();
  fs.writeFileSync(tokensPath(), JSON.stringify(store, null, 2), "utf8");
}

export function listAccessTokens() {
  return loadTokenStore()
    .tokens.filter((t) => t && !t.revokedAt)
    .map((t) => ({
      id: String(t.id || ""),
      label: String(t.label || "User"),
      email: t.email ? String(t.email) : null,
      uid: t.uid ? String(t.uid) : null,
      createdAt: t.createdAt ? String(t.createdAt) : null,
      lastUsedAt: t.lastUsedAt ? String(t.lastUsedAt) : null,
      tokenPreview:
        typeof t.token === "string" && t.token.length >= 10
          ? `${t.token.slice(0, 6)}…${t.token.slice(-4)}`
          : "",
      allowedCompanyIds: normalizeCompanyIds(t.allowedCompanyIds),
      invitedEmails: normalizeInvitedEmails(t.invitedEmails),
    }));
}

export function getAccessTokenRecord(token: string) {
  const store = loadTokenStore();
  if (!token) return null;
  return (
    store.tokens.find((t) => t && !t.revokedAt && t.token === token) as Record<string, unknown> | undefined
  ) ?? null;
}

function touchToken(rec: Record<string, unknown>): void {
  const store = loadTokenStore();
  const live = store.tokens.find((t) => t && t.id === rec.id);
  if (live) {
    live.lastUsedAt = new Date().toISOString();
    saveTokenStore(store);
  }
}

export function createAccessToken(input: {
  label?: string;
  email?: string | null;
  uid?: string | null;
  allowedCompanyIds?: string[];
}) {
  const store = loadTokenStore();
  const token = crypto.randomBytes(32).toString("hex");
  const id = crypto.randomBytes(8).toString("hex");
  const rec = {
    id,
    token,
    label: String(input.label || "Shared user").slice(0, 120),
    email: input.email ? String(input.email).slice(0, 200) : null,
    uid: input.uid ? String(input.uid).slice(0, 128) : null,
    allowedCompanyIds: normalizeCompanyIds(input.allowedCompanyIds),
    createdAt: new Date().toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
  store.tokens.push(rec);
  saveTokenStore(store);
  return {
    id: rec.id,
    token: rec.token,
    label: rec.label,
    email: rec.email as string | null,
    uid: rec.uid as string | null,
    allowedCompanyIds: rec.allowedCompanyIds,
    createdAt: rec.createdAt,
  };
}

export function getAccessTokenSecret(id: string): {
  id: string;
  token: string;
  label: string;
  allowedCompanyIds: string[];
} | null {
  const store = loadTokenStore();
  const rec = store.tokens.find((t) => t && t.id === id && !t.revokedAt);
  if (!rec || typeof rec.token !== "string" || !rec.token) return null;
  return {
    id: String(rec.id || ""),
    token: rec.token,
    label: String(rec.label || "Shared user"),
    allowedCompanyIds: normalizeCompanyIds(rec.allowedCompanyIds),
  };
}

export function rotateAccessToken(
  id: string,
  input: { label?: string; allowedCompanyIds?: string[] } = {}
): {
  id: string;
  token: string;
  label: string;
  email: string | null;
  uid: string | null;
  allowedCompanyIds: string[];
  createdAt: string | null;
} | null {
  const store = loadTokenStore();
  const rec = store.tokens.find((t) => t && t.id === id && !t.revokedAt);
  if (!rec) return null;
  rec.token = crypto.randomBytes(32).toString("hex");
  if (input.label != null) {
    rec.label = String(input.label || rec.label || "Shared user").slice(0, 120);
  }
  if (input.allowedCompanyIds != null) {
    rec.allowedCompanyIds = normalizeCompanyIds(input.allowedCompanyIds);
  }
  saveTokenStore(store);
  const token = String(rec.token || "");
  return {
    id: String(rec.id || ""),
    token,
    label: String(rec.label || "Shared user"),
    email: rec.email ? String(rec.email) : null,
    uid: rec.uid ? String(rec.uid) : null,
    allowedCompanyIds: normalizeCompanyIds(rec.allowedCompanyIds),
    createdAt: rec.createdAt ? String(rec.createdAt) : null,
  };
}

export function revokeAccessToken(id: string): boolean {
  const store = loadTokenStore();
  const rec = store.tokens.find((t) => t && t.id === id);
  if (!rec) return false;
  rec.revokedAt = new Date().toISOString();
  saveTokenStore(store);
  return true;
}

export function updateAccessToken(
  id: string,
  input: { label?: string; allowedCompanyIds?: string[]; invitedEmails?: string[] }
): LocalAppServerAccessTokenSummary | null {
  const store = loadTokenStore();
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
  saveTokenStore(store);
  const token = String(rec.token || "");
  return {
    id: String(rec.id || ""),
    label: String(rec.label || "User"),
    email: rec.email ? String(rec.email) : null,
    uid: rec.uid ? String(rec.uid) : null,
    createdAt: rec.createdAt ? String(rec.createdAt) : null,
    lastUsedAt: rec.lastUsedAt ? String(rec.lastUsedAt) : null,
    tokenPreview: token.length >= 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : "",
    allowedCompanyIds: normalizeCompanyIds(rec.allowedCompanyIds),
    invitedEmails: normalizeInvitedEmails(rec.invitedEmails),
  };
}

function buildPublicServerListingUrl(publicHostRaw: string, port: number): string | null {
  const ph = String(publicHostRaw || "").trim();
  if (!ph || !Number.isFinite(port) || port <= 0) return null;
  try {
    let href = ph;
    if (!/^https?:\/\//i.test(href)) href = `http://${href}`;
    const u = new URL(href);
    const hostname = u.hostname;
    if (!hostname) return null;
    const portPart = u.port || String(port);
    return `http://${hostname}:${portPart}/`;
  } catch {
    const bare = ph
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .split("/")[0]
      ?.trim();
    if (!bare) return null;
    if (/^[\d.a-f:[\]-]+:\d+$/i.test(bare) || /^[^:/]+:\d+$/.test(bare)) {
      return `http://${bare}/`;
    }
    return `http://${bare}:${port}/`;
  }
}

function listLanUrls(port: number, publicHost: string): string[] {
  const urls = [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`];
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const ni of nets[name] || []) {
        if (!ni || ni.internal || ni.family !== "IPv4") continue;
        urls.push(`http://${ni.address}:${port}/`);
      }
    }
  } catch {
    /* ignore */
  }
  const pub = buildPublicServerListingUrl(publicHost, port);
  if (pub) urls.push(pub);
  return [...new Set(urls)];
}

function shouldHostLocalServer(cfg: LocalAppServerConfig): boolean {
  return cfg.appRole === "server" || cfg.appRole === "both";
}

export function getDevStatus(): LocalAppServerStatus {
  const cfg = loadDevConfig();
  const rt = readRuntime();
  const processUp = rt.running === true && typeof rt.port === "number";
  const port = processUp ? rt.port! : null;
  const hosting = shouldHostLocalServer(cfg);
  const sharingUp = Boolean(port && hosting && cfg.userWantsRunning !== false);
  return {
    running: sharingUp,
    appUiServing: processUp && !sharingUp,
    sharingActive: sharingUp,
    port: sharingUp ? port : port,
    appUiPort: port,
    sharingPort: sharingUp ? port : null,
    configuredPort: cfg.port,
    bindMode: cfg.bindMode,
    appOnlyAccess: cfg.appOnlyAccess,
    autoStartOnBoot: cfg.autoStartOnBoot,
    userWantsRunning: cfg.userWantsRunning,
    appRole: cfg.appRole,
    remoteServerUrl: cfg.remoteServerUrl,
    publicHost: cfg.publicHost,
    requireRemoteAccessToken: cfg.requireRemoteAccessToken,
    urls: port && hosting ? listLanUrls(port, cfg.publicHost) : [],
    clientHeader: PL_CLIENT_HEADER,
    accessHeader: PL_ACCESS_HEADER,
    electronMarkerHeader: PL_ELECTRON_MARKER_HEADER,
    portForwardHint:
      cfg.bindMode !== "localhost"
        ? "Router me TCP port forward: external port → this PC LAN IP + server port. Firewall me port allow karein."
        : null,
  };
}

export function resolvePlAccessContextFromHeaders(headers: Headers): {
  unrestricted: boolean;
  allowedCompanyIds: string[] | null;
  label: string | null;
} {
  const tok = (headers.get("x-pocket-ledger-access") || "").trim();
  if (tok) {
    const rec = getAccessTokenRecord(tok);
    if (!rec) throw new Error("invalid_or_missing_token");
    touchToken(rec);
    const ids = normalizeCompanyIds(rec.allowedCompanyIds);
    return {
      unrestricted: false,
      allowedCompanyIds: ids.length > 0 ? ids : null,
      label: typeof rec.label === "string" ? rec.label : null,
    };
  }
  const host = (headers.get("host") || "").split(":")[0].toLowerCase();
  const fromLocalhost = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (fromLocalhost) {
    return { unrestricted: true, allowedCompanyIds: null, label: null };
  }
  throw new Error("invalid_or_missing_token");
}

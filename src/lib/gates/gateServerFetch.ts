"use client";

import { CapacitorHttp } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { normalizeServerUrl } from "@/lib/gates/gateStore";
import {
  relayPlServerHttpBlob,
  relayPlServerHttpText,
  shouldRelayPlServerHttpUrl,
} from "@/lib/plServerHttpRelay";
import { plGateTrace } from "@/lib/plGateTrace";
import {
  getElectronLocalServerApi,
  isLocalAppServerSharingActive,
  resolveLocalAppServerSharingPort,
} from "@/lib/electronLocalServer";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import {
  getKnownPlSharingProbePorts,
  isRegisteredPlSharingPort,
  portFromServerUrl,
  registerGateServerPortFromUrl,
} from "@/lib/plSharingPortRegistry";
import { orderPlServerUrlsWithPreferred } from "@/lib/plServerClientUrlPick";
import { readCurrentAppAccountIdentity } from "@/lib/appAccountIdentity";
import type { CompanyClientDataDeleteCommand } from "@/lib/companyClientDataDeleteCommands";

const ACCESS_HEADER = "x-pocket-ledger-access";
const ELECTRON_CLIENT_HEADER = "x-pocket-ledger-client";
const ELECTRON_CLIENT_VALUE = "pocket-ledger-electron";
const APP_ACCOUNT_HEADER = "x-pocket-ledger-app-account";
const PL_SERVER_GET_TIMEOUT_MS = 10_000;
const PL_SERVER_POST_TIMEOUT_MS = 30_000;

function base64ToArrayBuffer(raw: string): ArrayBuffer {
  const value = String(raw || "").trim();
  const base64 = (value.includes(",") ? value.split(",").pop() || "" : value).replace(/\s+/g, "");
  if (!base64) return new ArrayBuffer(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function capacitorBinaryDataToBlob(data: unknown, contentType: string): Blob | null {
  if (!data) return null;
  if (data instanceof Blob) return data.size > 0 ? data : null;
  if (data instanceof ArrayBuffer) return data.byteLength > 0 ? new Blob([data], { type: contentType }) : null;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    const copy = new ArrayBuffer(view.byteLength);
    new Uint8Array(copy).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.byteLength > 0 ? new Blob([copy], { type: contentType }) : null;
  }
  if (typeof data === "string") {
    const ab = base64ToArrayBuffer(data);
    return ab.byteLength > 0 ? new Blob([ab], { type: contentType }) : null;
  }
  if (typeof data === "object" && data !== null) {
    const maybe = data as { data?: unknown; base64?: unknown };
    if (typeof maybe.base64 === "string") return capacitorBinaryDataToBlob(maybe.base64, contentType);
    if (typeof maybe.data === "string") return capacitorBinaryDataToBlob(maybe.data, contentType);
  }
  return null;
}

export type GateServerAccessContext = {
  unrestricted?: boolean;
  allowedCompanyIds: string[] | null;
  label?: string | null;
  companies?: Array<{
    id: string;
    name: string;
    storageOption?: string;
    ownerEmail?: string | null;
    planId?: string | null;
    planExpiryMs?: number | null;
    offlineLicenseValidUntilMs?: number | null;
    requiresLogin?: boolean;
    usernameHint?: string | null;
    accessAccount?: string | null;
  }> | null;
  clientDataDeleteCommands?: CompanyClientDataDeleteCommand[] | null;
  error?: string;
};

export async function gateHttpGet(
  url: string,
  accessToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers[ACCESS_HEADER] = accessToken;
  const appAccount = readCurrentAppAccountIdentity();
  if (appAccount) headers[APP_ACCOUNT_HEADER] = appAccount;
  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    headers[ELECTRON_CLIENT_HEADER] = ELECTRON_CLIENT_VALUE;
  }
  const timeoutMs =
    options?.timeoutMs ??
    (typeof window !== "undefined" && isElectronDesktopApp() ? 35_000 : PL_SERVER_GET_TIMEOUT_MS);

  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    const getPromise = CapacitorHttp.request({
      url,
      method: "GET",
      headers,
      responseType: "text",
    }).then((nativeRes) => {
      const status = typeof nativeRes.status === "number" ? nativeRes.status : 0;
      const body =
        nativeRes.data == null
          ? ""
          : typeof nativeRes.data === "string"
            ? nativeRes.data
            : JSON.stringify(nativeRes.data);
      return { status, body };
    });
    const timeoutPromise = new Promise<{ status: number; body: string }>((_, reject) => {
      setTimeout(() => reject(new DOMException("PL server GET timed out", "TimeoutError")), timeoutMs);
    });
    try {
      return await Promise.race([getPromise, timeoutPromise]);
    } catch {
      return { status: 0, body: "pl_server_get_timeout" };
    }
  }

  const { signal, clear } = gateHttpPostTimeoutSignal(options?.signal, timeoutMs);
  try {
    if (shouldRelayPlServerHttpUrl(url)) {
      return await relayPlServerHttpText(url, "GET", headers, undefined, signal);
    }
    const res = await fetch(url, { method: "GET", headers, cache: "no-store", signal });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      return { status: 0, body: "pl_server_get_timeout" };
    }
    throw wrapPlServerFetchError(e);
  } finally {
    clear();
  }
}

function buildGateHttpHeaders(accessToken: string, jsonBody?: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (jsonBody) headers["Content-Type"] = "application/json";
  if (accessToken) headers[ACCESS_HEADER] = accessToken;
  const appAccount = readCurrentAppAccountIdentity();
  if (appAccount) headers[APP_ACCOUNT_HEADER] = appAccount;
  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    headers[ELECTRON_CLIENT_HEADER] = ELECTRON_CLIENT_VALUE;
  }
  return headers;
}

function gateHttpPostTimeoutSignal(
  signal?: AbortSignal,
  timeoutMs = PL_SERVER_POST_TIMEOUT_MS
): { signal: AbortSignal; clear: () => void } {
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) timeoutCtrl.abort();
    else signal.addEventListener("abort", () => timeoutCtrl.abort(), { once: true });
  }
  return { signal: timeoutCtrl.signal, clear: () => clearTimeout(timer) };
}

/** LAN server POST — EXE/APK native HTTP + Electron client marker. */
export async function gateHttpPost(
  url: string,
  accessToken: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<{ status: number; body: string }> {
  const headers = buildGateHttpHeaders(accessToken, true);
  const payload = JSON.stringify(body);
  const timeoutMs = options?.timeoutMs ?? PL_SERVER_POST_TIMEOUT_MS;

  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    const postPromise = CapacitorHttp.request({
      url,
      method: "POST",
      headers,
      data: body,
      responseType: "text",
    }).then((nativeRes) => {
      const status = typeof nativeRes.status === "number" ? nativeRes.status : 0;
      const resBody =
        nativeRes.data == null
          ? ""
          : typeof nativeRes.data === "string"
            ? nativeRes.data
            : JSON.stringify(nativeRes.data);
      return { status, body: resBody };
    });
    const timeoutPromise = new Promise<{ status: number; body: string }>((_, reject) => {
      setTimeout(() => reject(new DOMException("PL server POST timed out", "TimeoutError")), timeoutMs);
    });
    try {
      return await Promise.race([postPromise, timeoutPromise]);
    } catch {
      return { status: 0, body: "pl_server_post_timeout" };
    }
  }

  const { signal, clear } = gateHttpPostTimeoutSignal(options?.signal, timeoutMs);
  try {
    if (shouldRelayPlServerHttpUrl(url)) {
      return await relayPlServerHttpText(url, "POST", headers, payload, signal);
    }
    const res = await fetch(url, { method: "POST", headers, body: payload, cache: "no-store", signal });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      return { status: 0, body: "pl_server_post_timeout" };
    }
    throw wrapPlServerFetchError(e);
  } finally {
    clear();
  }
}

/** Binary GET — attachment bytes from PL server (`/__pl_attachment`). */
export async function gateHttpFetchBlob(
  url: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<{ status: number; blob: Blob | null; contentType: string | null }> {
  const PL_SERVER_BLOB_TIMEOUT_MS = 25_000;
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), PL_SERVER_BLOB_TIMEOUT_MS);
  const linked = signal
    ? (() => {
        if (signal.aborted) timeoutCtrl.abort();
        else signal.addEventListener("abort", () => timeoutCtrl.abort(), { once: true });
        return timeoutCtrl.signal;
      })()
    : timeoutCtrl.signal;
  const headers: Record<string, string> = {};
  if (accessToken) headers[ACCESS_HEADER] = accessToken;
  const appAccount = readCurrentAppAccountIdentity();
  if (appAccount) headers[APP_ACCOUNT_HEADER] = appAccount;
  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    headers[ELECTRON_CLIENT_HEADER] = ELECTRON_CLIENT_VALUE;
  }

  try {
    if (typeof window !== "undefined" && isCapacitorNativeApp()) {
      const nativeRes = await CapacitorHttp.request({
        url,
        method: "GET",
        headers,
        responseType: "arraybuffer",
      });
      const status = typeof nativeRes.status === "number" ? nativeRes.status : 0;
      if (!status || status >= 400) return { status, blob: null, contentType: null };
      const ct =
        (nativeRes.headers && (nativeRes.headers["content-type"] || nativeRes.headers["Content-Type"])) ||
        "application/octet-stream";
      const data = nativeRes.data;
      const blob = capacitorBinaryDataToBlob(data, String(ct));
      return { status, blob, contentType: String(ct) };
    }

    if (shouldRelayPlServerHttpUrl(url)) {
      return await relayPlServerHttpBlob(url, headers, linked);
    }
    const res = await fetch(url, { method: "GET", headers, cache: "no-store", signal: linked });
    if (!res.ok) return { status: res.status, blob: null, contentType: null };
    const blob = await res.blob();
    return {
      status: res.status,
      blob: blob.size > 0 ? blob : null,
      contentType: res.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timer);
  }
}

function wrapPlServerFetchError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|fetch failed|network|cleartext|mixed content|unable to resolve/i.test(msg)) {
    return new Error(
      "Cannot reach host server — use the Public address in the invite, and ensure port forwarding and firewall allow inbound connections."
    );
  }
  return e instanceof Error ? e : new Error(msg || "Connection failed");
}

/**
 * True jab URL par full PL sharing server (localAppServer) ho — sirf Next UI port par
 * `/__pl_access_context` mil sakta hai; delta endpoints nahi.
 */
/** Sharing server ports — delta export yahi par; UI-only dev port 3000 par nahi. */
export function isPlSharingServerPortUrl(serverUrlRaw: string): boolean {
  const port = portFromServerUrl(serverUrlRaw);
  if (!port) return false;
  if (isRegisteredPlSharingPort(port)) return true;
  return port === "3001" || port === "37123";
}

export async function verifyPlSharingServerCapable(
  serverUrlRaw: string,
  accessToken: string,
  options?: { timeoutMs?: number }
): Promise<boolean> {
  const base = normalizeServerUrl(serverUrlRaw);
  if (!base) return false;
  if (isPlSharingServerPortUrl(base)) return true;
  const url = `${base}/__pl_delta_health?companyId=__pl_cap_probe__`;
  try {
    const { status } = await gateHttpGet(url, accessToken.trim(), {
      timeoutMs: options?.timeoutMs ?? 8_000,
    });
    if (status === 404 || status === 0) return false;
    return true;
  } catch {
    return false;
  }
}

/** Connect ke baad: company ledger host par export ho sakta hai ya nahi. */
export async function verifyPlServerCompanyDeltaReady(
  serverUrlRaw: string,
  accessToken: string,
  companyId: string,
  options?: { timeoutMs?: number }
): Promise<{ ok: boolean; error?: string }> {
  const base = normalizeServerUrl(serverUrlRaw);
  const id = String(companyId || "").trim();
  if (!base || !id) return { ok: false, error: "missing_server_or_company" };
  const url = `${base}/__pl_delta_health?companyId=${encodeURIComponent(id)}`;
  try {
    const { status, body } = await gateHttpGet(url, accessToken.trim(), {
      timeoutMs: options?.timeoutMs ?? 20_000,
    });
    if (status === 503) {
      return {
        ok: false,
        error:
          "Host ledger bridge is offline. On the server PC keep Pocket Ledger open in the browser (npm run dev tab) with this company loaded and Server sharing ON.",
      };
    }
    if (status === 403) {
      return { ok: false, error: "Access token does not allow this company on the host." };
    }
    if (!status || status >= 500) {
      return { ok: false, error: `Host delta check failed (HTTP ${status || "network"}).` };
    }
    let parsed: { ok?: boolean; error?: string; voucherCount?: number } = {};
    try {
      parsed = JSON.parse(body) as { ok?: boolean; error?: string; voucherCount?: number };
    } catch {
      return { ok: false, error: "Host returned an invalid delta response." };
    }
    if (parsed.ok === true) return { ok: true };
    if (parsed.error === "export_unavailable") {
      return {
        ok: false,
        error:
          "Host has no ledger data for this company. Open the company on the server PC browser (localhost dev), not only in EXE, then restart sharing.",
      };
    }
    return {
      ok: false,
      error:
        parsed.error ||
        "Host cannot export company data — open the company on the server PC with sharing ON.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Host delta check failed.",
    };
  }
}

/** Test Pocket Ledger server + token (LAN/WAN). */
export async function fetchGateServerAccessContext(
  serverUrlRaw: string,
  accessToken: string,
  options?: { timeoutMs?: number }
): Promise<GateServerAccessContext> {
  const base = normalizeServerUrl(serverUrlRaw);
  if (!base) return { allowedCompanyIds: null, error: "Invalid server URL" };
  registerGateServerPortFromUrl(base);
  const url = `${base}/__pl_access_context`;
  plGateTrace("fetch_access_context_start", { url });
  const startedMs = Date.now();

  try {
    const { status, body } = await gateHttpGet(url, accessToken.trim(), {
      timeoutMs: options?.timeoutMs,
    });
    if (status === 403) {
      plGateTrace("fetch_access_context_done", { url, ok: false, ms: Date.now() - startedMs, error: "403" });
      return { allowedCompanyIds: null, error: "Host denied gate access" };
    }
    if (status === 0 && body === "pl_server_get_timeout") {
      plGateTrace("fetch_access_context_done", { url, ok: false, ms: Date.now() - startedMs, error: "timeout" });
      return {
        allowedCompanyIds: null,
        error: "Host server timed out — try LAN or This PC address instead of Public IP on the same network.",
      };
    }
    if (!status || status >= 500) {
      plGateTrace("fetch_access_context_done", { url, ok: false, ms: Date.now() - startedMs, status });
      return { allowedCompanyIds: null, error: `Server error (${status || "network"})` };
    }
    if (status >= 400) {
      plGateTrace("fetch_access_context_done", { url, ok: false, ms: Date.now() - startedMs, status });
      return { allowedCompanyIds: null, error: `Request failed (${status})` };
    }
    const data = JSON.parse(body) as GateServerAccessContext;
    const ids = Array.isArray(data.allowedCompanyIds)
      ? data.allowedCompanyIds.map((x) => String(x).trim()).filter(Boolean)
      : null;
    const companies = Array.isArray(data.companies)
      ? data.companies
          .map((row) => {
            const id = String(row?.id || "").trim();
            if (!id) return null;
            const planExpiryMs =
              typeof (row as { planExpiryMs?: unknown }).planExpiryMs === "number" &&
              Number.isFinite((row as { planExpiryMs: number }).planExpiryMs)
                ? (row as { planExpiryMs: number }).planExpiryMs
                : null;
            const offlineLicenseValidUntilMs =
              typeof (row as { offlineLicenseValidUntilMs?: unknown }).offlineLicenseValidUntilMs ===
                "number" &&
              Number.isFinite((row as { offlineLicenseValidUntilMs: number }).offlineLicenseValidUntilMs)
                ? (row as { offlineLicenseValidUntilMs: number }).offlineLicenseValidUntilMs
                : null;
            const planRaw = (row as { planId?: unknown }).planId;
            return {
              id,
              name: String(row?.name || row?.id || "").trim(),
              storageOption: "local" as const,
              ownerEmail: row?.ownerEmail ?? null,
              accessAccount: String((row as { accessAccount?: unknown }).accessAccount || "").trim() || null,
              planId: planRaw != null && String(planRaw).trim() ? String(planRaw).trim() : null,
              planExpiryMs,
              offlineLicenseValidUntilMs,
              ...(typeof (row as { requiresLogin?: unknown }).requiresLogin === "boolean"
                ? { requiresLogin: (row as { requiresLogin: boolean }).requiresLogin }
                : {}),
              ...((row as { usernameHint?: unknown }).usernameHint != null
                ? {
                    usernameHint: String((row as { usernameHint?: unknown }).usernameHint || "").trim() || null,
                  }
                : {}),
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row?.id))
      : null;
    plGateTrace("fetch_access_context_done", {
      url,
      ok: true,
      ms: Date.now() - startedMs,
      companyCount: companies?.length ?? 0,
    });
    return {
      unrestricted: data.unrestricted === true,
      allowedCompanyIds: ids,
      label: data.label ?? null,
      companies,
      clientDataDeleteCommands: Array.isArray(data.clientDataDeleteCommands)
        ? data.clientDataDeleteCommands
        : null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    plGateTrace("fetch_access_context_done", { url, ok: false, ms: Date.now() - startedMs, error: msg });
    if (/failed to fetch|fetch failed|network|cleartext|mixed content|unable to resolve|relay failed|timed out|connection_timed_out/i.test(msg)) {
      return {
        allowedCompanyIds: null,
        error:
          "Cannot reach host server — pick the Public address, and ensure sharing is on with port forwarding.",
      };
    }
    return { allowedCompanyIds: null, error: msg || "Connection failed" };
  }
}

/** Dev/UI port (3000) vs PL sharing port (3001) — gate add par sahi URL pick karo. */
function candidatePlSharingServerUrls(serverUrlRaw: string): string[] {
  const original = normalizeServerUrl(serverUrlRaw);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const url = normalizeServerUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  push(original || serverUrlRaw);
  try {
    const href = original || serverUrlRaw;
    const u = new URL(/^https?:\/\//i.test(href) ? href : `http://${href}`);
    const host = u.hostname;
    if (!host) return out;
    const protocol = u.protocol;
    const currentPort = u.port || (protocol === "https:" ? "443" : "80");
    if (isPlSharingServerPortUrl(original || serverUrlRaw)) return out;
    for (const altPort of getKnownPlSharingProbePorts()) {
      if (String(altPort) === currentPort) continue;
      push(`${protocol}//${host}:${altPort}`);
    }
  } catch {
    /* ignore */
  }
  return out;
}

function hostnameFromPlServerUrl(urlRaw: string): string {
  try {
    const href = normalizeServerUrl(urlRaw) || urlRaw;
    return new URL(/^https?:\/\//i.test(href) ? href : `http://${href}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function collectLocalHostServerHostnames(status: {
  urls?: string[] | null;
}): Set<string> {
  const hosts = new Set<string>(["127.0.0.1", "localhost"]);
  for (const listing of status.urls || []) {
    const h = hostnameFromPlServerUrl(listing);
    if (h) hosts.add(h);
  }
  return hosts;
}

function gatePointsAtLocalHostServer(serverUrlRaw: string, status: { urls?: string[] | null }): boolean {
  const host = hostnameFromPlServerUrl(serverUrlRaw);
  if (!host) return false;
  return collectLocalHostServerHostnames(status).has(host);
}

/** Sirf is PC ke apne server par hairpin shortcuts — remote gate IP mat inject karo. */
async function expandPlSharingServerCandidatesForGate(serverUrlRaw: string): Promise<string[]> {
  const original = normalizeServerUrl(serverUrlRaw);
  const base = candidatePlSharingServerUrls(serverUrlRaw);
  const extra: string[] = [];
  if (typeof window !== "undefined" && isLocalAppServerHost() && original) {
    const api = getElectronLocalServerApi();
    if (api) {
      try {
        const status = await api.getStatus();
        if (isLocalAppServerSharingActive(status) && gatePointsAtLocalHostServer(original, status)) {
          const port = resolveLocalAppServerSharingPort(status);
          if (port) {
            extra.push(`http://127.0.0.1:${port}`, `http://localhost:${port}`);
            for (const listing of status.urls || []) {
              try {
                const listingUrl = new URL(listing);
                const listingPort = listingUrl.port || (listingUrl.protocol === "https:" ? "443" : "80");
                if (String(listingPort) === String(port)) {
                  extra.push(normalizeServerUrl(listing));
                }
              } catch {
                /* ignore */
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  return orderPlServerUrlsWithPreferred(original || serverUrlRaw, [...base, ...extra]);
}

/** User-entered gate URL kabhi auto-replace mat karo — sirf alag transport URL use karo. */
function shouldUseSeparateTransportUrl(original: string, probeUrl: string): boolean {
  const orig = normalizeServerUrl(original);
  const probe = normalizeServerUrl(probeUrl);
  if (!orig || !probe || orig === probe) return false;
  return true;
}

export type ResolvedPlSharingServerUrl = {
  /** Gate record / invite URL (public IP preserve). */
  url: string;
  /** Working HTTP origin on this PC (loopback/LAN probe). */
  transportUrl?: string;
  rewritten: boolean;
  capable: boolean;
  accessContext: GateServerAccessContext | null;
};

export function resolvePlSharingTransportUrl(
  resolved: ResolvedPlSharingServerUrl | null | undefined,
  fallbackRaw: string
): string {
  return normalizeServerUrl(resolved?.transportUrl || resolved?.url || fallbackRaw);
}

/**
 * Manual gate add: `/__pl_access_context` 3000 par bhi chal sakta hai (Next dev UI),
 * lekin voucher delta sirf sharing server par (3001 / EXE sharing port).
 */
export async function resolvePlSharingServerUrlForGate(
  serverUrlRaw: string,
  accessToken: string,
  options?: { timeoutMs?: number }
): Promise<ResolvedPlSharingServerUrl> {
  const original = normalizeServerUrl(serverUrlRaw);
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const candidates = await expandPlSharingServerCandidatesForGate(serverUrlRaw);
  plGateTrace("resolve_sharing_url_candidates", { original, candidates });
  let fallback: { url: string; accessContext: GateServerAccessContext } | null = null;

  for (const url of candidates) {
    plGateTrace("resolve_sharing_url_probe", { url });
    const accessContext = await fetchGateServerAccessContext(url, accessToken, { timeoutMs });
    if (accessContext.error) {
      plGateTrace("resolve_sharing_url_probe_failed", { url, error: accessContext.error });
      continue;
    }
    if (!fallback) fallback = { url, accessContext };
    const capable =
      isPlSharingServerPortUrl(url) ||
      (await verifyPlSharingServerCapable(url, accessToken, { timeoutMs }));
    if (capable) {
      const normalizedProbe = normalizeServerUrl(url);
      const separateTransport = shouldUseSeparateTransportUrl(original, normalizedProbe);
      return {
        url: original,
        transportUrl: separateTransport ? normalizedProbe : undefined,
        rewritten: false,
        capable: true,
        accessContext,
      };
    }
  }

  if (fallback) {
    const normalizedProbe = normalizeServerUrl(fallback.url);
    const separateTransport = shouldUseSeparateTransportUrl(original, normalizedProbe);
    return {
      url: original,
      transportUrl: separateTransport ? normalizedProbe : undefined,
      rewritten: false,
      capable: false,
      accessContext: fallback.accessContext,
    };
  }

  return {
    url: original,
    rewritten: false,
    capable: false,
    accessContext: {
      allowedCompanyIds: null,
      error:
        isLocalAppServerHost()
          ? "Cannot reach host server — sharing ON hai to loopback/LAN try karo; remote ke liye port forward check karo."
          : "Cannot reach host server",
    },
  };
}

export function buildLocalServerConnectUrl(serverUrlRaw: string, accessToken: string, companyId?: string): string {
  const base = normalizeServerUrl(serverUrlRaw);
  const u = new URL(`${base}/company`);
  u.searchParams.set("pl_remote_client", "1");
  const tok = accessToken.trim();
  if (tok) u.searchParams.set("pl_access", tok);
  if (companyId?.trim()) u.searchParams.set("pl_company", companyId.trim());
  return u.toString();
}

/** Fast reachability — no company list / bridge wait (Gate → Test). */
export async function pingPlSharingServer(
  serverUrlRaw: string,
  options?: { timeoutMs?: number }
): Promise<{ ok: boolean; ms: number; error?: string }> {
  const base = normalizeServerUrl(serverUrlRaw);
  if (!base) return { ok: false, ms: 0, error: "Invalid server URL" };
  const url = `${base}/__pl_server_ping`;
  const startedMs = Date.now();
  plGateTrace("ping_start", { url });
  try {
    const { status, body } = await gateHttpGet(url, "", {
      timeoutMs: options?.timeoutMs ?? 12_000,
    });
    const ms = Date.now() - startedMs;
    if (status === 200) {
      plGateTrace("ping_ok", { url, ms, body: body.slice(0, 120) });
      return { ok: true, ms };
    }
    if (status === 0 && body === "pl_server_get_timeout") {
      plGateTrace("ping_timeout", { url, ms });
      return { ok: false, ms, error: "Host server timed out" };
    }
    plGateTrace("ping_fail", { url, ms, status });
    return { ok: false, ms, error: `Server responded HTTP ${status || "network"}` };
  } catch (e) {
    const ms = Date.now() - startedMs;
    const msg = e instanceof Error ? e.message : String(e);
    plGateTrace("ping_fail", { url, ms, error: msg });
    return { ok: false, ms, error: msg || "Connection failed" };
  }
}

/** Gate Test: sirf HTTP ping — companies Open gate / company pick par load. */
export async function testPlServerGateConnection(
  serverUrlRaw: string,
  options?: { timeoutMs?: number }
): Promise<{ ok: boolean; message: string; ms?: number; transportUrl?: string; url: string }> {
  const original = normalizeServerUrl(serverUrlRaw);
  const candidates = await expandPlSharingServerCandidatesForGate(serverUrlRaw);
  plGateTrace("gate_ping_candidates", { original, candidates });
  let lastError = "Cannot reach host server";
  let lastMs = 0;
  for (const candidate of candidates) {
    const ping = await pingPlSharingServer(candidate, options);
    lastMs = ping.ms;
    if (ping.ok) {
      const normalizedCandidate = normalizeServerUrl(candidate);
      const separateTransport = shouldUseSeparateTransportUrl(original, normalizedCandidate);
      return {
        ok: true,
        message: `Server reachable (${ping.ms}ms)`,
        ms: ping.ms,
        transportUrl: separateTransport ? normalizedCandidate : undefined,
        url: original,
      };
    }
    lastError = ping.error || lastError;
  }
  return { ok: false, message: lastError, ms: lastMs, url: original };
}

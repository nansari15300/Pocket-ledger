"use client";

import { CapacitorHttp } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { normalizeServerUrl } from "@/lib/gates/gateStore";
import {
  needsPlServerHttpRelay,
  relayPlServerHttpBlob,
  relayPlServerHttpText,
} from "@/lib/plServerHttpRelay";

const ACCESS_HEADER = "x-pocket-ledger-access";
const ELECTRON_CLIENT_HEADER = "x-pocket-ledger-client";
const ELECTRON_CLIENT_VALUE = "pocket-ledger-electron";
const PL_SERVER_HTTP_TIMEOUT_MS = 30_000;

export type GateServerAccessContext = {
  unrestricted?: boolean;
  allowedCompanyIds: string[] | null;
  label?: string | null;
  companies?: Array<{ id: string; name: string; storageOption?: string; ownerEmail?: string | null }> | null;
  error?: string;
};

export async function gateHttpGet(
  url: string,
  accessToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers[ACCESS_HEADER] = accessToken;
  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    headers[ELECTRON_CLIENT_HEADER] = ELECTRON_CLIENT_VALUE;
  }
  const timeoutMs = options?.timeoutMs ?? PL_SERVER_HTTP_TIMEOUT_MS;

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
    if (needsPlServerHttpRelay(url)) {
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
  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    headers[ELECTRON_CLIENT_HEADER] = ELECTRON_CLIENT_VALUE;
  }
  return headers;
}

function gateHttpPostTimeoutSignal(
  signal?: AbortSignal,
  timeoutMs = PL_SERVER_HTTP_TIMEOUT_MS
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
  const timeoutMs = options?.timeoutMs ?? PL_SERVER_HTTP_TIMEOUT_MS;

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
    if (needsPlServerHttpRelay(url)) {
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
      if (!data) return { status, blob: null, contentType: null };
      const ab = data instanceof ArrayBuffer ? data : new ArrayBuffer(0);
      return { status, blob: new Blob([ab], { type: String(ct) }), contentType: String(ct) };
    }

    if (needsPlServerHttpRelay(url)) {
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
 * `/__pl_access_context` mil sakta hai; mirror endpoints nahi.
 */
export async function verifyPlSharingServerCapable(
  serverUrlRaw: string,
  accessToken: string,
  options?: { timeoutMs?: number }
): Promise<boolean> {
  const base = normalizeServerUrl(serverUrlRaw);
  if (!base) return false;
  const url = `${base}/__pl_mirror_health`;
  try {
    const { status, body } = await gateHttpGet(url, accessToken.trim(), {
      timeoutMs: options?.timeoutMs ?? 8_000,
    });
    if (status === 404 || status === 0) return false;
    if (status === 400) {
      try {
        const parsed = JSON.parse(body) as { error?: string };
        return parsed?.error === "missing_company_id";
      } catch {
        return true;
      }
    }
    return status === 200 || status === 403 || status === 503;
  } catch {
    return false;
  }
}

/** Connect ke baad: company ledger host par export ho sakta hai ya nahi. */
export async function verifyPlServerCompanyMirrorReady(
  serverUrlRaw: string,
  accessToken: string,
  companyId: string,
  options?: { timeoutMs?: number }
): Promise<{ ok: boolean; error?: string }> {
  const base = normalizeServerUrl(serverUrlRaw);
  const id = String(companyId || "").trim();
  if (!base || !id) return { ok: false, error: "missing_server_or_company" };
  const url = `${base}/__pl_mirror_health?companyId=${encodeURIComponent(id)}`;
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
      return { ok: false, error: `Host mirror check failed (HTTP ${status || "network"}).` };
    }
    let parsed: { ok?: boolean; error?: string; voucherCount?: number } = {};
    try {
      parsed = JSON.parse(body) as { ok?: boolean; error?: string; voucherCount?: number };
    } catch {
      return { ok: false, error: "Host returned an invalid mirror response." };
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
      error: e instanceof Error ? e.message : "Host mirror check failed.",
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
  const url = `${base}/__pl_access_context`;

  try {
    const { status, body } = await gateHttpGet(url, accessToken.trim(), {
      timeoutMs: options?.timeoutMs,
    });
    if (status === 403) {
      return { allowedCompanyIds: null, error: "Invalid or missing access token" };
    }
    if (status === 0 && body === "pl_server_get_timeout") {
      return {
        allowedCompanyIds: null,
        error: "Host server timed out — try LAN or This PC address instead of Public IP on the same network.",
      };
    }
    if (!status || status >= 500) {
      return { allowedCompanyIds: null, error: `Server error (${status || "network"})` };
    }
    if (status >= 400) {
      return { allowedCompanyIds: null, error: `Request failed (${status})` };
    }
    const data = JSON.parse(body) as GateServerAccessContext;
    const ids = Array.isArray(data.allowedCompanyIds)
      ? data.allowedCompanyIds.map((x) => String(x).trim()).filter(Boolean)
      : null;
    const companies = Array.isArray(data.companies)
      ? data.companies
          .map((row) => ({
            id: String(row?.id || "").trim(),
            name: String(row?.name || row?.id || "").trim(),
            storageOption: "local" as const,
            ownerEmail: row?.ownerEmail ?? null,
          }))
          .filter((row) => row.id)
      : null;
    return {
      unrestricted: data.unrestricted === true,
      allowedCompanyIds: ids,
      label: data.label ?? null,
      companies,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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

export function buildLocalServerConnectUrl(serverUrlRaw: string, accessToken: string, companyId?: string): string {
  const base = normalizeServerUrl(serverUrlRaw);
  const u = new URL(`${base}/company`);
  u.searchParams.set("pl_remote_client", "1");
  const tok = accessToken.trim();
  if (tok) u.searchParams.set("pl_access", tok);
  if (companyId?.trim()) u.searchParams.set("pl_company", companyId.trim());
  return u.toString();
}

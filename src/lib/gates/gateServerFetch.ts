"use client";

import { CapacitorHttp } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { normalizeServerUrl } from "@/lib/gates/gateStore";

const ACCESS_HEADER = "x-pocket-ledger-access";
const ELECTRON_CLIENT_HEADER = "x-pocket-ledger-client";
const ELECTRON_CLIENT_VALUE = "pocket-ledger-electron";

export type GateServerAccessContext = {
  unrestricted?: boolean;
  allowedCompanyIds: string[] | null;
  label?: string | null;
  companies?: Array<{ id: string; name: string; storageOption?: string; ownerEmail?: string | null }> | null;
  error?: string;
};

export async function gateHttpGet(url: string, accessToken: string): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers[ACCESS_HEADER] = accessToken;
  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    headers[ELECTRON_CLIENT_HEADER] = ELECTRON_CLIENT_VALUE;
  }

  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    const nativeRes = await CapacitorHttp.request({
      url,
      method: "GET",
      headers,
      responseType: "text",
    });
    const status = typeof nativeRes.status === "number" ? nativeRes.status : 0;
    const body =
      nativeRes.data == null
        ? ""
        : typeof nativeRes.data === "string"
          ? nativeRes.data
          : JSON.stringify(nativeRes.data);
    return { status, body };
  }

  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  return { status: res.status, body: await res.text() };
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

/** LAN server POST — EXE/APK native HTTP + Electron client marker. */
export async function gateHttpPost(
  url: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: string }> {
  const headers = buildGateHttpHeaders(accessToken, true);
  const payload = JSON.stringify(body);

  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    const nativeRes = await CapacitorHttp.request({
      url,
      method: "POST",
      headers,
      data: body,
      responseType: "text",
    });
    const status = typeof nativeRes.status === "number" ? nativeRes.status : 0;
    const resBody =
      nativeRes.data == null
        ? ""
        : typeof nativeRes.data === "string"
          ? nativeRes.data
          : JSON.stringify(nativeRes.data);
    return { status, body: resBody };
  }

  const res = await fetch(url, { method: "POST", headers, body: payload, cache: "no-store" });
  return { status: res.status, body: await res.text() };
}

/** Binary GET — attachment bytes from PL server (`/__pl_attachment`). */
export async function gateHttpFetchBlob(
  url: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<{ status: number; blob: Blob | null; contentType: string | null }> {
  const headers: Record<string, string> = {};
  if (accessToken) headers[ACCESS_HEADER] = accessToken;
  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    headers[ELECTRON_CLIENT_HEADER] = ELECTRON_CLIENT_VALUE;
  }

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

  const res = await fetch(url, { method: "GET", headers, cache: "no-store", signal });
  if (!res.ok) return { status: res.status, blob: null, contentType: null };
  const blob = await res.blob();
  return {
    status: res.status,
    blob: blob.size > 0 ? blob : null,
    contentType: res.headers.get("content-type"),
  };
}

/** Test Pocket Ledger server + token (LAN/WAN). */
export async function fetchGateServerAccessContext(
  serverUrlRaw: string,
  accessToken: string
): Promise<GateServerAccessContext> {
  const base = normalizeServerUrl(serverUrlRaw);
  if (!base) return { allowedCompanyIds: null, error: "Invalid server URL" };
  const url = `${base}/__pl_access_context`;

  try {
    const { status, body } = await gateHttpGet(url, accessToken.trim());
    if (status === 403) {
      return { allowedCompanyIds: null, error: "Invalid or missing access token" };
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
    if (/failed to fetch|network|cleartext|unable to resolve/i.test(msg)) {
      return { allowedCompanyIds: null, error: "Cannot reach server — check IP, port, Wi‑Fi, and firewall." };
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

"use client";

import { CapacitorHttp } from "@capacitor/core";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { normalizeServerUrl } from "@/lib/gates/gateStore";

const ACCESS_HEADER = "x-pocket-ledger-access";

export type GateServerAccessContext = {
  unrestricted?: boolean;
  allowedCompanyIds: string[] | null;
  label?: string | null;
  companies?: Array<{ id: string; name: string; storageOption?: string; ownerEmail?: string | null }> | null;
  error?: string;
};

async function gateHttpGet(url: string, accessToken: string): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers[ACCESS_HEADER] = accessToken;

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

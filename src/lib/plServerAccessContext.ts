"use client";

import type { Company } from "@/hooks/useCompany";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isLocalAppServerHost, isLocalhostDevPreview } from "@/lib/localAppServerDevPreview";

const STORAGE_IDS = "pl_server_allowed_company_ids";
const STORAGE_LABEL = "pl_server_access_label";
/** Dev: Client settings → access token for filtering company list on localhost. */
export const PL_DEV_CLIENT_ACCESS_TOKEN_KEY = "pl_dev_client_access_token";
export const PL_SERVER_ACCESS_CONTEXT_EVENT = "pl-server-access-context";

export type PlServerAccessContextPayload = {
  unrestricted?: boolean;
  allowedCompanyIds: string[] | null;
  label?: string | null;
};

function isLocalAppHost(): boolean {
  return isLocalAppServerHost();
}

export function readDevClientAccessToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return (sessionStorage.getItem(PL_DEV_CLIENT_ACCESS_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function persistDevClientAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = token.trim();
    if (t) sessionStorage.setItem(PL_DEV_CLIENT_ACCESS_TOKEN_KEY, t);
    else sessionStorage.removeItem(PL_DEV_CLIENT_ACCESS_TOKEN_KEY);
    window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
  } catch {
    /* ignore */
  }
}

export function shouldFetchPlServerAccessContext(): boolean {
  if (typeof window === "undefined") return false;
  if (isPlRemoteServerClientMode()) return true;
  if (!isLocalAppHost()) return true;
  if (readDevClientAccessToken()) return true;
  return false;
}

export function clearPlServerAccessContext(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_IDS);
    sessionStorage.removeItem(STORAGE_LABEL);
    window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
  } catch {
    /* ignore */
  }
}

export function applyPlServerAccessContextPayload(payload: PlServerAccessContextPayload): void {
  if (typeof window === "undefined") return;
  try {
    if (payload.unrestricted || !payload.allowedCompanyIds?.length) {
      sessionStorage.removeItem(STORAGE_IDS);
    } else {
      sessionStorage.setItem(STORAGE_IDS, JSON.stringify(payload.allowedCompanyIds));
    }
    if (payload.label) sessionStorage.setItem(STORAGE_LABEL, payload.label);
    else sessionStorage.removeItem(STORAGE_LABEL);
    window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
  } catch {
    /* ignore */
  }
}

export async function refreshPlServerAccessContext(): Promise<PlServerAccessContextPayload | null> {
  if (!shouldFetchPlServerAccessContext()) {
    clearPlServerAccessContext();
    return null;
  }
  try {
    const headers: Record<string, string> = {};
    const devTok = readDevClientAccessToken();
    if (devTok) headers["x-pocket-ledger-access"] = devTok;
    const res = await fetch("/__pl_access_context", { cache: "no-store", headers });
    if (!res.ok) {
      clearPlServerAccessContext();
      return null;
    }
    const data = (await res.json()) as PlServerAccessContextPayload;
    applyPlServerAccessContextPayload(data);
    return data;
  } catch {
    clearPlServerAccessContext();
    return null;
  }
}

/** Non-null = restrict company list to these ids (server token). */
export function getPlServerAllowedCompanyIds(): string[] | null {
  if (typeof window === "undefined") return null;
  if (!shouldFetchPlServerAccessContext()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_IDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return null;
  }
}

export function getPlServerAccessLabel(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(STORAGE_LABEL);
  } catch {
    return null;
  }
}

export function filterCompaniesForPlServerAccess(companies: Company[]): Company[] {
  const allowed = getPlServerAllowedCompanyIds();
  if (!allowed?.length) return companies;
  const set = new Set(allowed);
  return companies.filter((c) => set.has(String(c.id || "").trim()));
}

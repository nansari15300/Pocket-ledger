"use client";

import type { Company } from "@/hooks/useCompany";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { getActiveGate } from "@/lib/gates/gateStore";

const STORAGE_IDS = "pl_server_allowed_company_ids";
const STORAGE_LABEL = "pl_server_access_label";
const STORAGE_COMPANIES = "pl_server_shared_companies_v1";
const STORAGE_GATE_ID = "pl_server_context_gate_id";
/** Dev: Client settings → access token for filtering company list on localhost. */
export const PL_DEV_CLIENT_ACCESS_TOKEN_KEY = "pl_dev_client_access_token";
export const PL_SERVER_ACCESS_CONTEXT_EVENT = "pl-server-access-context";

export type PlServerAccessContextPayload = {
  unrestricted?: boolean;
  allowedCompanyIds: string[] | null;
  label?: string | null;
  companies?: Array<{ id: string; name?: string; storageOption?: string; ownerEmail?: string | null }> | null;
};

export type CompanyWithPlServerShared = Company & { plServerShared?: boolean };

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

/**
 * Sirf remote client / local_server gate / loopback dev preview par server access context chahiye.
 * Public web (pocketledger.com + Online gate) par mat — warna company list [] ho kar auto-select loop.
 */
export function shouldFetchPlServerAccessContext(): boolean {
  if (typeof window === "undefined") return false;
  if (isPlRemoteServerClientMode()) return true;
  if (getActiveGate().type === "local_server") return true;
  if (isLocalAppHost()) {
    if (readDevClientAccessToken()) return true;
    try {
      if (sessionStorage.getItem(STORAGE_COMPANIES) || sessionStorage.getItem(STORAGE_IDS)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function companiesFromAccessPayload(payload: PlServerAccessContextPayload): PlServerSharedCompanySummary[] {
  const fromServer = normalizeSharedCompanies(payload.companies);
  if (fromServer.length > 0) return fromServer;
  const ids = Array.isArray(payload.allowedCompanyIds)
    ? payload.allowedCompanyIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (!ids.length) return [];
  return ids.map((id) => ({
    id,
    name: id,
    storageOption: "local" as const,
    ownerEmail: null,
  }));
}

export function clearPlServerAccessContext(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_IDS);
    sessionStorage.removeItem(STORAGE_LABEL);
    sessionStorage.removeItem(STORAGE_COMPANIES);
    sessionStorage.removeItem(STORAGE_GATE_ID);
    window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
  } catch {
    /* ignore */
  }
}

function normalizeSharedCompanies(raw: unknown): PlServerSharedCompanySummary[] {
  if (!Array.isArray(raw)) return [];
  const out: PlServerSharedCompanySummary[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as PlServerSharedCompanySummary).id || "").trim();
    if (!id) continue;
    out.push({
      id,
      name: String((row as PlServerSharedCompanySummary).name || id),
      storageOption: "local",
      ownerEmail: (row as PlServerSharedCompanySummary).ownerEmail ?? null,
    });
  }
  return out;
}

export function applyPlServerAccessContextPayload(
  payload: PlServerAccessContextPayload,
  gateId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (payload.unrestricted || !payload.allowedCompanyIds?.length) {
      sessionStorage.removeItem(STORAGE_IDS);
    } else {
      sessionStorage.setItem(STORAGE_IDS, JSON.stringify(payload.allowedCompanyIds));
    }
    if (payload.label) sessionStorage.setItem(STORAGE_LABEL, payload.label);
    else sessionStorage.removeItem(STORAGE_LABEL);
    const companies = companiesFromAccessPayload(payload);
    if (companies.length > 0) {
      sessionStorage.setItem(STORAGE_COMPANIES, JSON.stringify(companies));
    } else {
      sessionStorage.removeItem(STORAGE_COMPANIES);
    }
    const gid = String(gateId || "").trim();
    if (gid) sessionStorage.setItem(STORAGE_GATE_ID, gid);
    else sessionStorage.removeItem(STORAGE_GATE_ID);
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

export function getPlServerSharedCompanies(): PlServerSharedCompanySummary[] {
  if (typeof window === "undefined") return [];
  if (!shouldFetchPlServerAccessContext()) return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_COMPANIES);
    if (!raw) return [];
    return normalizeSharedCompanies(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Gate settings page: read preview context even on device gate (after Test). */
export function readPlServerGatePreviewContext(gateId?: string | null): {
  allowedCompanyIds: string[] | null;
  companies: PlServerSharedCompanySummary[];
} {
  if (typeof window === "undefined") {
    return { allowedCompanyIds: null, companies: [] };
  }
  const forGate = String(gateId || "").trim();
  if (forGate) {
    try {
      const storedGate = sessionStorage.getItem(STORAGE_GATE_ID);
      if (storedGate && storedGate !== forGate) {
        return { allowedCompanyIds: null, companies: [] };
      }
    } catch {
      /* ignore */
    }
  }
  let allowedCompanyIds: string[] | null = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_IDS);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        allowedCompanyIds = parsed.map((x) => String(x).trim()).filter(Boolean);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_COMPANIES);
    if (!raw) return { allowedCompanyIds, companies: [] };
    return { allowedCompanyIds, companies: normalizeSharedCompanies(JSON.parse(raw)) };
  } catch {
    return { allowedCompanyIds, companies: [] };
  }
}

/** Server gate preview / remote list row — device-local SQLite company nahi. */
export function isPlServerSharedCompanyRow(
  company: { id?: string; plServerShared?: boolean } | null | undefined,
  gateId?: string | null
): boolean {
  const id = String(company?.id || "").trim();
  if (!id) return false;
  if ((company as CompanyWithPlServerShared).plServerShared === true) return true;
  if (getPlServerSharedCompanies().some((r) => r.id === id)) return true;
  const preview = readPlServerGatePreviewContext(gateId);
  return preview.companies.some((r) => r.id === id);
}

export function companyStubFromPlServerShared(
  row: PlServerSharedCompanySummary
): CompanyWithPlServerShared {
  return {
    id: row.id,
    name: row.name || row.id,
    storageOption: "local",
    ownerEmail: row.ownerEmail ?? undefined,
    ownerId: "",
    isOwned: false,
    plServerShared: true,
  } as CompanyWithPlServerShared;
}

export function buildPlServerGatePreviewCompanyList(
  registry: Company[],
  gateId: string
): CompanyWithPlServerShared[] {
  const { allowedCompanyIds, companies: sharedRows } = readPlServerGatePreviewContext(gateId);
  if (!sharedRows.length && !allowedCompanyIds?.length) return [];

  const allowedSet = allowedCompanyIds?.length
    ? new Set(allowedCompanyIds.map((x) => String(x).trim()).filter(Boolean))
    : null;

  const byId = new Map<string, CompanyWithPlServerShared>(
    registry.map((c) => [String(c.id || "").trim(), c as CompanyWithPlServerShared])
  );

  const injectShared = (row: PlServerSharedCompanySummary) => {
    const id = String(row.id || "").trim();
    if (!id) return;
    if (allowedSet && !allowedSet.has(id)) return;
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, {
        ...existing,
        name: row.name || existing.name,
        plServerShared: true,
      } as CompanyWithPlServerShared);
      return;
    }
    byId.set(id, {
      id,
      name: row.name || id,
      storageOption: "local",
      ownerEmail: row.ownerEmail ?? undefined,
      isOwned: false,
      plServerShared: true,
    } as CompanyWithPlServerShared);
  };

  for (const row of sharedRows) injectShared(row);

  if (allowedSet) {
    for (const id of allowedSet) {
      if (byId.has(id)) continue;
      const row = sharedRows.find((r) => r.id === id);
      injectShared(
        row ?? { id, name: id, storageOption: "local", ownerEmail: null }
      );
    }
  }

  let list = [...byId.values()].filter((c) => c.isDeleted !== true && c.movedToAdminRecycleAt == null);
  if (allowedSet?.size) {
    list = list.filter((c) => allowedSet.has(String(c.id || "").trim()));
  } else if (sharedRows.length > 0) {
    list = list.filter((c) => c.plServerShared === true);
  }
  return list;
}

export function mergePlServerSharedCompaniesIntoRegistry(companies: Company[]): CompanyWithPlServerShared[] {
  const shared = getPlServerSharedCompanies();
  if (!shared.length) return companies;
  const byId = new Map<string, CompanyWithPlServerShared>(
    companies.map((c) => [String(c.id || "").trim(), c as CompanyWithPlServerShared])
  );
  for (const row of shared) {
    if (byId.has(row.id)) continue;
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      storageOption: "local",
      ownerEmail: row.ownerEmail ?? undefined,
      isOwned: false,
      plServerShared: true,
    } as CompanyWithPlServerShared);
  }
  return [...byId.values()];
}

export function filterCompaniesForPlServerAccess(companies: Company[]): CompanyWithPlServerShared[] {
  if (!shouldFetchPlServerAccessContext()) return companies;
  const merged = mergePlServerSharedCompaniesIntoRegistry(companies);
  const allowed = getPlServerAllowedCompanyIds();
  if (!allowed?.length) {
    if (isPlRemoteServerClientMode()) {
      return merged.filter((c) => c.plServerShared === true);
    }
    const shared = getPlServerSharedCompanies();
    if (shared.length > 0) {
      const set = new Set(shared.map((row) => row.id));
      return merged.filter((c) => set.has(String(c.id || "").trim()));
    }
    return merged;
  }
  const set = new Set(allowed);
  return merged.filter((c) => set.has(String(c.id || "").trim()));
}

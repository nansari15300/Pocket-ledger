"use client";

import type { Company } from "@/hooks/useCompany";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { getActiveGate } from "@/lib/gates/gateStore";
import { fetchGateServerAccessContext } from "@/lib/gates/gateServerFetch";

const STORAGE_IDS = "pl_server_allowed_company_ids";
const STORAGE_LABEL = "pl_server_access_label";
const STORAGE_COMPANIES = "pl_server_shared_companies_v1";
const STORAGE_GATE_ID = "pl_server_context_gate_id";
/** Gate page preview — per gate id (Online active rehne par bhi Test list dikhe). */
const GATE_PREVIEW_PREFIX = "pl_server_gate_preview_v1:";

type GatePreviewSnapshot = {
  allowedCompanyIds: string[] | null;
  label?: string | null;
  companies: PlServerSharedCompanySummary[];
  updatedAtMs?: number;
};

function gatePreviewStorageKey(gateId: string): string {
  return `${GATE_PREVIEW_PREFIX}${String(gateId || "").trim()}`;
}

function persistGatePreviewSnapshot(gateId: string, payload: PlServerAccessContextPayload): void {
  const gid = String(gateId || "").trim();
  if (!gid || typeof window === "undefined") return;
  try {
    const companies = companiesFromAccessPayload(payload);
    const snap: GatePreviewSnapshot = {
      allowedCompanyIds: payload.unrestricted ? null : payload.allowedCompanyIds ?? null,
      label: payload.label ?? null,
      companies,
      updatedAtMs: Date.now(),
    };
    sessionStorage.setItem(gatePreviewStorageKey(gid), JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function readGatePreviewSnapshot(gateId: string): GatePreviewSnapshot | null {
  const gid = String(gateId || "").trim();
  if (!gid || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(gatePreviewStorageKey(gid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GatePreviewSnapshot;
    return {
      allowedCompanyIds: Array.isArray(parsed.allowedCompanyIds)
        ? parsed.allowedCompanyIds.map((x) => String(x).trim()).filter(Boolean)
        : parsed.allowedCompanyIds,
      label: parsed.label ?? null,
      companies: normalizeSharedCompanies(parsed.companies),
    };
  } catch {
    return null;
  }
}

/** Gate remove par us gate ka cached Test preview hatao. */
export function clearPlServerGatePreview(gateId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(gatePreviewStorageKey(String(gateId || "").trim()));
  } catch {
    /* ignore */
  }
}
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

/** Registry / gate filters — null rows se `plServerShared` crash avoid. */
function compactCompanyList(companies: Company[]): Company[] {
  return companies.filter((c): c is Company => c != null && typeof c === "object" && Boolean(String(c.id || "").trim()));
}

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

/** Gate Test toast — same rules as sessionStorage preview (not raw `companies.length` alone). */
export function countPlServerAccessContextCompanies(
  payload: PlServerAccessContextPayload
): number | "all" {
  if (payload.unrestricted) return "all";
  return companiesFromAccessPayload(payload).length;
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

/** Gate Test / mirror — server access context se company rows. */
export function sharedCompaniesFromAccessPayload(
  payload: PlServerAccessContextPayload
): PlServerSharedCompanySummary[] {
  return companiesFromAccessPayload(payload);
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
    if (gid) {
      sessionStorage.setItem(STORAGE_GATE_ID, gid);
      persistGatePreviewSnapshot(gid, payload);
    } else {
      sessionStorage.removeItem(STORAGE_GATE_ID);
    }
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

  const activeGate = getActiveGate();

  /** Remote server origin (Gate → Connect): token ke bina mat fetch — 403 + context wipe avoid. */
  if (isPlRemoteServerClientMode()) {
    const token = readDevClientAccessToken();
    if (!token) return null;
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "x-pocket-ledger-access": token,
      };
      const res = await fetch("/__pl_access_context", { cache: "no-store", headers });
      if (res.status === 403 || !res.ok) return null;
      const data = (await res.json()) as PlServerAccessContextPayload;
      applyPlServerAccessContextPayload(
        data,
        activeGate.type === "local_server" ? activeGate.id : null
      );
      return data;
    } catch {
      return null;
    }
  }

  /** Web/APK client + local_server gate: remote server se context — localhost `/__pl_access_context` mat (unrestricted wipe). */
  if (activeGate.type === "local_server" && activeGate.serverUrl?.trim()) {
    const token = (activeGate.accessToken || "").trim() || readDevClientAccessToken();
    if (!token) return null;
    const ctx = await fetchGateServerAccessContext(activeGate.serverUrl, token);
    if (ctx.error) {
      if (/invalid|missing token|403/i.test(ctx.error)) {
        clearPlServerAccessContext();
      }
      return null;
    }
    const payload: PlServerAccessContextPayload = {
      unrestricted: ctx.unrestricted,
      allowedCompanyIds: ctx.allowedCompanyIds,
      label: ctx.label ?? null,
      companies: ctx.companies ?? null,
    };
    applyPlServerAccessContextPayload(payload, activeGate.id);
    return payload;
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const devTok = readDevClientAccessToken();
    if (devTok) headers["x-pocket-ledger-access"] = devTok;
    else if (!isLocalAppHost()) return null;
    const res = await fetch("/__pl_access_context", { cache: "no-store", headers });
    if (!res.ok) return null;
    const data = (await res.json()) as PlServerAccessContextPayload;
    applyPlServerAccessContextPayload(data);
    return data;
  } catch {
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

export function getPlServerContextGateId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = sessionStorage.getItem(STORAGE_GATE_ID);
    return id?.trim() || null;
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
    const perGate = readGatePreviewSnapshot(forGate);
    if (perGate) {
      return {
        allowedCompanyIds: perGate.allowedCompanyIds,
        companies: perGate.companies,
      };
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
  if (company?.plServerShared === true) return true;
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
  registry = compactCompanyList(registry);
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

  let list = [...byId.values()].filter(
    (c) => c && c.isDeleted !== true && c.movedToAdminRecycleAt == null
  );
  if (allowedSet?.size) {
    list = list.filter((c) => allowedSet.has(String(c.id || "").trim()));
  } else if (sharedRows.length > 0) {
    list = list.filter((c) => c?.plServerShared === true);
  }
  return list;
}

/** Save & Copy To: owned local + online + server-shared — gate filter / sidebar fallback ke bina. */
export function listCompaniesForVoucherCopyTo(companies: Company[]): CompanyWithPlServerShared[] {
  const visible = compactCompanyList(companies).filter(
    (c) => c.isDeleted !== true && c.movedToAdminRecycleAt == null
  );
  return mergePlServerSharedCompaniesIntoRegistry(visible);
}

export function mergePlServerSharedCompaniesIntoRegistry(companies: Company[]): CompanyWithPlServerShared[] {
  companies = compactCompanyList(companies);
  const shared = getPlServerSharedCompanies();
  const byId = new Map<string, CompanyWithPlServerShared>(
    companies.map((c) => [String(c.id || "").trim(), c as CompanyWithPlServerShared])
  );
  // Registry/SQLite me `plServerShared` ho to session context wipe par bhi Server tab me dikhe.
  for (const c of companies) {
    if (!isPlServerSharedCompanyRow(c, null)) continue;
    const id = String(c.id || "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    byId.set(id, {
      ...(existing ?? c),
      ...c,
      plServerShared: true,
      isOwned: existing?.isOwned ?? c.isOwned ?? false,
    } as CompanyWithPlServerShared);
  }
  for (const row of shared) {
    const existing = byId.get(row.id);
    if (existing) {
      byId.set(row.id, {
        ...existing,
        name: row.name || existing.name,
        ownerEmail: row.ownerEmail ?? existing.ownerEmail,
        plServerShared: true,
      } as CompanyWithPlServerShared);
      continue;
    }
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
  const compact = compactCompanyList(companies);
  if (!shouldFetchPlServerAccessContext()) return compact;
  const merged = mergePlServerSharedCompaniesIntoRegistry(compact);
  const allowed = getPlServerAllowedCompanyIds();
  if (!allowed?.length) {
    if (isPlRemoteServerClientMode()) {
      return merged.filter((c) => c?.plServerShared === true);
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

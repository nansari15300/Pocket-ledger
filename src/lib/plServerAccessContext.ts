"use client";

import type { Company } from "@/hooks/useCompany";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import {
  isPlServerGateClientActive,
  isPlSharingServerPortOrigin,
} from "@/lib/plRemoteServerClient";
import { gatePointsAtRemotePlServerHost, isAppUiOrigin } from "@/lib/plGatePageOrigin";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";
import { fetchGateServerAccessContext } from "@/lib/gates/gateServerFetch";
import { matchPlServerSharedCompanyForLocalId } from "@/lib/plServerHostCompanyId";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";
import { readCurrentAppAccountIdentity } from "@/lib/appAccountIdentity";
import {
  executeDueCompanyClientDataDeleteCommands,
  parseCompanyClientDataDeleteCommands,
  type CompanyClientDataDeleteCommand,
} from "@/lib/companyClientDataDeleteCommands";

const STORAGE_IDS = "pl_server_allowed_company_ids";
const STORAGE_LABEL = "pl_server_access_label";
const STORAGE_COMPANIES = "pl_server_shared_companies_v1";
const STORAGE_GATE_ID = "pl_server_context_gate_id";
/** Gate page preview — per gate id (Online active rehne par bhi Test list dikhe). */
const GATE_PREVIEW_PREFIX = "pl_server_gate_preview_v1:";

let accessContextRefreshInflight: Promise<PlServerAccessContextPayload | null> | null = null;

const PL_SERVER_COMPANY_NAME_PLACEHOLDER = "Server company";

function isRealPlServerCompanyName(name: unknown, id: string): boolean {
  const value = String(name || "").trim();
  return Boolean(value && value !== id && value !== PL_SERVER_COMPANY_NAME_PLACEHOLDER);
}

function previousSharedCompanyName(id: string): string {
  if (typeof window === "undefined") return "";
  try {
    const rows = JSON.parse(sessionStorage.getItem(STORAGE_COMPANIES) || "[]") as Array<{
      id?: unknown;
      name?: unknown;
    }>;
    const row = rows.find((item) => String(item?.id || "").trim() === id);
    return isRealPlServerCompanyName(row?.name, id) ? String(row?.name).trim() : "";
  } catch {
    return "";
  }
}

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
/** Legacy client access key storage; tokenless PLServer clears this value. */
export const PL_DEV_CLIENT_ACCESS_TOKEN_KEY = "pl_dev_client_access_token";
export const PL_SERVER_ACCESS_CONTEXT_EVENT = "pl-server-access-context";

export type PlServerAccessContextPayload = {
  unrestricted?: boolean;
  allowedCompanyIds: string[] | null;
  label?: string | null;
  companies?: Array<{ id: string; name?: string; storageOption?: string; ownerEmail?: string | null }> | null;
  clientDataDeleteCommands?: CompanyClientDataDeleteCommand[] | null;
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
  if (isPlServerGateClientActive()) return true;
  // Sharing port (`:3001`) — host ya staff; Firebase gate jaisa server company list yahan load.
  if (isPlSharingServerPortOrigin()) return true;
  const gate = getActiveGate();
  if (gate.type === "local_server") {
    const url = String(gate.serverUrl || "").trim();
    if (url) {
      // Bundled staff (phone APK / remote-gate EXE) — server list + delta ke liye context chahiye.
      if (!isLocalAppHost()) return true;
      if (gatePointsAtRemotePlServerHost(url)) return true;
    }
  }
  if (isAppUiOrigin()) return false;
  if (gate.type === "local_server") return true;
  return false;
}

/** Company registry + profile: host shared plan overlay (remote client / local_server gate). */
export function shouldMergePlServerSharedIntoRegistry(): boolean {
  if (typeof window === "undefined") return false;
  if (shouldFetchPlServerAccessContext()) return true;
  return getActiveGate().type === "local_server";
}

function companiesFromAccessPayload(payload: PlServerAccessContextPayload): PlServerSharedCompanySummary[] {
  const fromServer = normalizeSharedCompanies(payload.companies);
  if (fromServer.length > 0) return fromServer;
  const ids = Array.isArray(payload.allowedCompanyIds)
    ? payload.allowedCompanyIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (!ids.length) return [];
  // The ID-only response is temporary; never expose its UUID as a company name.
  return ids.map((id) => ({
    id,
    name: previousSharedCompanyName(id) || PL_SERVER_COMPANY_NAME_PLACEHOLDER,
    storageOption: "local" as const,
    ownerEmail: null,
  }));
}

function clearPasswordlessSessionsThatNowRequireLogin(companies: PlServerSharedCompanySummary[]): void {
  const loginRequiredIds = companies
    .filter((row) => row.requiresLogin === true)
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
  if (!loginRequiredIds.length || typeof window === "undefined") return;
  void Promise.all([import("@/lib/localApiClient"), import("@/lib/localCompanyStore")])
    .then(async ([{ clearLocalAuth, getLocalAuthUser }, { listLocalCompanies }]) => {
      const idsToClear = new Set(loginRequiredIds);
      try {
        const localRows = await listLocalCompanies({ includeDeleted: true });
        const requiredRows = companies.filter((row) => row.requiresLogin === true);
        for (const row of localRows) {
          const id = String(row.id || "").trim();
          if (!id) continue;
          const hostId = String((row as { plServerHostCompanyId?: unknown }).plServerHostCompanyId || "").trim();
          if (
            loginRequiredIds.includes(id) ||
            (hostId && loginRequiredIds.includes(hostId)) ||
            Boolean(matchPlServerSharedCompanyForLocalId(id, requiredRows))
          ) {
            idsToClear.add(id);
          }
        }
      } catch {
        /* local registry unavailable */
      }
      let cleared = false;
      for (const id of idsToClear) {
        const localUser = getLocalAuthUser(id);
        const localUserId = String(localUser?.id || "").trim();
        if (localUserId === "local_open" || localUserId === "local_open_owner") {
          clearLocalAuth(id);
          cleared = true;
        }
      }
      if (cleared) {
        window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
      }
    })
    .catch(() => {
      /* optional guard */
    });
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
    const before = readAccessContextStorageSignature();
    sessionStorage.removeItem(STORAGE_IDS);
    sessionStorage.removeItem(STORAGE_LABEL);
    sessionStorage.removeItem(STORAGE_COMPANIES);
    sessionStorage.removeItem(STORAGE_GATE_ID);
    if (before !== readAccessContextStorageSignature()) {
      window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
    }
  } catch {
    /* ignore */
  }
}

function readAccessContextStorageSignature(): string {
  if (typeof window === "undefined") return "";
  try {
    return JSON.stringify({
      ids: sessionStorage.getItem(STORAGE_IDS) || "",
      label: sessionStorage.getItem(STORAGE_LABEL) || "",
      companies: sessionStorage.getItem(STORAGE_COMPANIES) || "",
      gateId: sessionStorage.getItem(STORAGE_GATE_ID) || "",
    });
  } catch {
    return "";
  }
}

function normalizeSharedCompanies(raw: unknown): PlServerSharedCompanySummary[] {
  if (!Array.isArray(raw)) return [];
  const out: PlServerSharedCompanySummary[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as PlServerSharedCompanySummary).id || "").trim();
    if (!id) continue;
    const r = row as PlServerSharedCompanySummary;
    const planExpiryMs =
      typeof r.planExpiryMs === "number" && Number.isFinite(r.planExpiryMs) ? r.planExpiryMs : null;
    const offlineLicenseValidUntilMs =
      typeof r.offlineLicenseValidUntilMs === "number" && Number.isFinite(r.offlineLicenseValidUntilMs)
        ? r.offlineLicenseValidUntilMs
        : null;
    const rawName = String(r.name || "").trim();
    out.push({
      id,
      name: isRealPlServerCompanyName(rawName, id)
        ? rawName
        : previousSharedCompanyName(id) || PL_SERVER_COMPANY_NAME_PLACEHOLDER,
      storageOption: "local",
      ownerEmail: r.ownerEmail ?? null,
      planId: r.planId != null && String(r.planId).trim() ? String(r.planId).trim() : null,
      planExpiryMs,
      offlineLicenseValidUntilMs,
      ...(typeof r.requiresLogin === "boolean" ? { requiresLogin: r.requiresLogin } : {}),
      ...(r.usernameHint != null ? { usernameHint: r.usernameHint ? String(r.usernameHint) : null } : {}),
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
    const before = readAccessContextStorageSignature();
    if (payload.unrestricted || !payload.allowedCompanyIds?.length) {
      sessionStorage.removeItem(STORAGE_IDS);
    } else {
      sessionStorage.setItem(STORAGE_IDS, JSON.stringify(payload.allowedCompanyIds));
    }
    if (payload.label) sessionStorage.setItem(STORAGE_LABEL, payload.label);
    else sessionStorage.removeItem(STORAGE_LABEL);
    const companies = companiesFromAccessPayload(payload);
    const deleteCommands = parseCompanyClientDataDeleteCommands(payload.clientDataDeleteCommands);
    if (deleteCommands.length > 0) {
      void executeDueCompanyClientDataDeleteCommands({
        commands: deleteCommands,
        appEmail: readCurrentAppAccountIdentity(),
      }).then((removedIds) => {
        if (removedIds.length > 0) window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
      });
    }
    clearPasswordlessSessionsThatNowRequireLogin(companies);
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
    const changed = before !== readAccessContextStorageSignature();
    if (changed) {
      window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
    }
    // Host plan → client SQLite (LAN up hone par; offline pe last saved plan rehta hai)
    if (companies.length > 0) {
      void import("@/lib/plServerHostPlanSync")
        .then(({ applyPlServerHostPlansFromSharedSummaries }) =>
          applyPlServerHostPlansFromSharedSummaries(companies)
        )
        .catch(() => {
          /* optional */
        });
    }
  } catch {
    /* ignore */
  }
}

async function fetchSameOriginPlServerAccessContext(
  gateId: string | null
): Promise<PlServerAccessContextPayload | null> {
  try {
    const appAccount = readCurrentAppAccountIdentity();
    const res = await fetch("/__pl_access_context", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(appAccount ? { "x-pocket-ledger-app-account": appAccount } : {}),
      },
    });
    if (res.status === 403 || !res.ok) return null;
    const data = (await res.json()) as PlServerAccessContextPayload;
    applyPlServerAccessContextPayload(data, gateId);
    return data;
  } catch {
    return null;
  }
}

async function refreshPlServerAccessContextInner(): Promise<PlServerAccessContextPayload | null> {
  if (!shouldFetchPlServerAccessContext()) {
    // Online/device gate par stale server session hatao — local_server gate par mat (staff EXE flicker loop).
    const gate = getActiveGate();
    if (gate.type !== "local_server") {
      clearPlServerAccessContext();
    }
    return null;
  }

  const activeGate = getActiveGate();
  const gateIdForContext = activeGate.type === "local_server" ? activeGate.id : null;

  async function fetchAccessContextFromActiveGate(): Promise<PlServerAccessContextPayload | null> {
    if (activeGate.type !== "local_server" || !activeGate.serverUrl?.trim()) return null;
    if (typeof window !== "undefined" && isPlSharingServerPortOrigin()) {
      try {
        const gateOrigin = new URL(normalizeServerUrl(activeGate.serverUrl) || activeGate.serverUrl).origin;
        if (gateOrigin === window.location.origin) {
          return fetchSameOriginPlServerAccessContext(gateIdForContext);
        }
      } catch {
        /* fall through to absolute gate URL */
      }
    }
    const ctx = await fetchGateServerAccessContext(activeGate.serverUrl, "");
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
      clientDataDeleteCommands: ctx.clientDataDeleteCommands ?? null,
    };
    applyPlServerAccessContextPayload(payload, activeGate.id);
    await import("@/lib/plServerGateCleanup")
      .then((m) => m.pruneLocalServerGateCompaniesFromAccessPayload(activeGate, payload))
      .catch(() => ({ removedIds: [], skipped: true }));
    return payload;
  }

  /** Sharing port (`:3001`) — same-origin first; avoids flaky cross-fetch + port probes. */
  if (isPlSharingServerPortOrigin()) {
    const sameOrigin = await fetchSameOriginPlServerAccessContext(gateIdForContext);
    if (sameOrigin) return sameOrigin;
  }

  /** Remote / hub relay client: PLServer gate access is token-free. */
  if (isPlServerGateClientActive()) {
    const fromGate = await fetchAccessContextFromActiveGate();
    if (fromGate) return fromGate;
    return fetchSameOriginPlServerAccessContext(gateIdForContext);
  }

  /** Web/APK client + local_server gate: remote server se context — localhost `/__pl_access_context` mat (unrestricted wipe). */
  if (activeGate.type === "local_server" && activeGate.serverUrl?.trim()) {
    return fetchAccessContextFromActiveGate();
  }

  try {
    if (!isLocalAppHost()) return null;
    return fetchSameOriginPlServerAccessContext(null);
  } catch {
    return null;
  }
}

export async function refreshPlServerAccessContext(_options?: {
  force?: boolean;
}): Promise<PlServerAccessContextPayload | null> {
  void _options;
  // `force` means bypass cached context, not duplicate an active network request.
  // A slow host response must have exactly one caller on the wire.
  if (accessContextRefreshInflight) return accessContextRefreshInflight;
  const request = refreshPlServerAccessContextInner().finally(() => {
    if (accessContextRefreshInflight === request) accessContextRefreshInflight = null;
  });
  accessContextRefreshInflight = request;
  return request;
}

/** Non-null = restrict company list to these ids (legacy allow-list payload). */
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

/** Session access context se local company id ka host owner plan (shared company UI). */
export function resolvePlServerSharedOwnerPlanId(localCompanyId: string): PlanId | null {
  const id = String(localCompanyId || "").trim();
  if (!id) return null;
  const hit = matchPlServerSharedCompanyForLocalId(id, getPlServerSharedCompanies());
  if (!hit?.planId) return null;
  return normalizePlanIdForClient(hit.planId);
}

/** Host plan resolve ke baad sessionStorage companies row patch — profile UI turant update. */
export function patchPlServerSharedCompanyPlanInSession(
  hostCompanyId: string,
  plan: {
    planId: PlanId;
    planExpiryMs?: number | null;
    offlineLicenseValidUntilMs?: number | null;
  }
): void {
  if (typeof window === "undefined") return;
  const hostId = String(hostCompanyId || "").trim();
  if (!hostId) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_COMPANIES);
    if (!raw) return;
    const rows = normalizeSharedCompanies(JSON.parse(raw));
    if (!rows.length) return;
    let changed = false;
    const next = rows.map((row) => {
      if (String(row.id || "").trim() !== hostId) return row;
      changed = true;
      return {
        ...row,
        planId: plan.planId,
        ...(typeof plan.planExpiryMs === "number" && Number.isFinite(plan.planExpiryMs)
          ? { planExpiryMs: plan.planExpiryMs }
          : {}),
        ...(typeof plan.offlineLicenseValidUntilMs === "number" &&
        Number.isFinite(plan.offlineLicenseValidUntilMs)
          ? { offlineLicenseValidUntilMs: plan.offlineLicenseValidUntilMs }
          : {}),
      };
    });
    if (!changed) return;
    sessionStorage.setItem(STORAGE_COMPANIES, JSON.stringify(next));
    window.dispatchEvent(new Event(PL_SERVER_ACCESS_CONTEXT_EVENT));
  } catch {
    /* ignore */
  }
}

/** Gate Test/Connect snapshot saved — `companies: []` means host exposes no shared companies. */
export function plServerShareListAuthoritativeEmpty(gateId?: string | null): boolean {
  const gid = String(gateId ?? getPlServerContextGateId() ?? "").trim();
  if (!gid) return false;
  const snap = readGatePreviewSnapshot(gid);
  return Boolean(snap && snap.companies.length === 0);
}

export function hasPlServerAuthoritativeShareList(gateId?: string | null): boolean {
  const gid = String(gateId ?? getPlServerContextGateId() ?? "").trim();
  return Boolean(gid && readGatePreviewSnapshot(gid));
}

/** Server picker: authoritative shared list (per-gate preview first, then session). */
export function resolvePlServerAuthoritativeSharedCompanies(
  gateId?: string | null
): PlServerSharedCompanySummary[] {
  const preview = readPlServerGatePreviewContext(gateId);
  const gid = String(gateId ?? getPlServerContextGateId() ?? "").trim();
  if (gid && readGatePreviewSnapshot(gid)) return preview.companies;
  if (preview.companies.length > 0) return preview.companies;
  return getPlServerSharedCompanies();
}

export function isListedPlServerSharedCompany(
  company: { id?: string; plServerHostCompanyId?: string } | null | undefined,
  gateId?: string | null
): boolean {
  const id = String(company?.id || "").trim();
  const hostId = String(company?.plServerHostCompanyId || "").trim();
  if (!id && !hostId) return false;
  const shared = resolvePlServerAuthoritativeSharedCompanies(gateId);
  if (shared.length) {
    return (
      shared.some((r) => String(r.id || "").trim() === id || (hostId && String(r.id || "").trim() === hostId)) ||
      Boolean(matchPlServerSharedCompanyForLocalId(id, shared))
    );
  }
  if (plServerShareListAuthoritativeEmpty(gateId)) {
    const sessionShared = getPlServerSharedCompanies();
    if (!sessionShared.length) return false;
    return (
      sessionShared.some((r) => String(r.id || "").trim() === id || (hostId && String(r.id || "").trim() === hostId)) ||
      Boolean(matchPlServerSharedCompanyForLocalId(id, sessionShared))
    );
  }
  return false;
}

/** Server tab row — gate metadata + host share list membership (stale SQLite mirror mat dikhao). */
export function isServerTabCompanyRow(
  company:
    | {
        id?: string;
        plServerShared?: boolean;
        syncedFromCloud?: boolean;
        storageOption?: string | null;
        plServerGateId?: string;
        plServerGateServerUrl?: string;
        plServerHostCompanyId?: string;
      }
    | null
    | undefined,
  gateId?: string | null
): boolean {
  if (!company?.plServerShared) return false;
  if (company.syncedFromCloud === true) return false;
  const so = String(company.storageOption ?? "").toLowerCase().trim();
  if (so === "firebase" || so === "drive") return false;
  const gateMeta = Boolean(
    String(company.plServerGateId ?? "").trim() ||
      String(company.plServerGateServerUrl ?? "").trim() ||
      String(company.plServerHostCompanyId ?? "").trim()
  );
  if (!gateMeta) return false;
  return isListedPlServerSharedCompany(company, gateId);
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

/** Server gate preview / remote list row — device-local SQLite company nahi; online stamp ignore. */
export function isPlServerSharedCompanyRow(
  company:
    | {
        id?: string;
        ownerId?: string;
        plServerShared?: boolean;
        storageOption?: string | null;
        syncedFromCloud?: boolean;
        plServerGateId?: string;
        plServerGateServerUrl?: string;
        plServerHostCompanyId?: string;
      }
    | null
    | undefined,
  gateId?: string | null
): boolean {
  const id = String(company?.id || "").trim();
  if (!id) return false;
  if (isCloudLinkedCompanyStorage(company)) return false;
  if (company?.plServerShared === true) {
    const rowGateId = String(company.plServerGateId || "").trim();
    const rowGateServerUrl = String(company.plServerGateServerUrl || "").trim();
    const rowHostId = String(company.plServerHostCompanyId || "").trim();
    if (rowGateId || rowGateServerUrl || rowHostId) {
      return isListedPlServerSharedCompany(company, gateId);
    }
  }
  const shared = resolvePlServerAuthoritativeSharedCompanies(gateId);
  if (shared.some((r) => r.id === id)) return true;
  if (matchPlServerSharedCompanyForLocalId(id, shared)) return true;
  const preview = readPlServerGatePreviewContext(gateId);
  if (preview.companies.some((r) => r.id === id)) return true;
  if (matchPlServerSharedCompanyForLocalId(id, preview.companies)) return true;
  return false;
}

function looksLikeOpaqueCompanyId(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/^[a-z0-9-]+_[a-f0-9]{6,}$/i.test(v)) return true;
  if (/^[a-f0-9-]{24,}$/i.test(v)) return true;
  return false;
}

/** Gate company list — kabhi UID mat dikhao; shared/registry name prefer karo. */
export function resolvePlServerGateCompanyDisplayName(
  companyId: string,
  gateId: string,
  registry?: Company[]
): string {
  const id = String(companyId || "").trim();
  if (!id) return "Company";
  const { companies: sharedRows } = readPlServerGatePreviewContext(gateId);
  const sharedHit =
    sharedRows.find((r) => String(r.id || "").trim() === id) ||
    matchPlServerSharedCompanyForLocalId(id, sharedRows);
  const sharedName = String(sharedHit?.name || "").trim();
  if (sharedName && sharedName !== id && !looksLikeOpaqueCompanyId(sharedName)) return sharedName;

  const reg =
    registry?.find((c) => String(c.id || "").trim() === id) ??
    registry?.find((c) => {
      const hostId = String((c as Record<string, unknown>).plServerHostCompanyId || "").trim();
      return hostId === id;
    });
  const regName = String(reg?.name || "").trim();
  if (regName && regName !== id && !looksLikeOpaqueCompanyId(regName)) return regName;

  const hostId = String((reg as Record<string, unknown> | undefined)?.plServerHostCompanyId || "").trim();
  if (hostId && hostId !== id) {
    const hostShared = sharedRows.find((r) => String(r.id || "").trim() === hostId);
    const hostName = String(hostShared?.name || "").trim();
    if (hostName && hostName !== hostId && !looksLikeOpaqueCompanyId(hostName)) return hostName;
  }
  if (sharedName && !looksLikeOpaqueCompanyId(sharedName)) return sharedName;
  return "Company";
}

function resolveAllowedPreviewRow(
  id: string,
  sharedRows: PlServerSharedCompanySummary[],
  byId: Map<string, CompanyWithPlServerShared>
): PlServerSharedCompanySummary {
  const fromShared = sharedRows.find((r) => String(r.id || "").trim() === id);
  if (fromShared) return fromShared;
  const fuzzy = matchPlServerSharedCompanyForLocalId(id, sharedRows);
  if (fuzzy) return { ...fuzzy, id };
  const reg = byId.get(id);
  const regName = String(reg?.name || "").trim();
  if (reg && regName && regName !== id && !looksLikeOpaqueCompanyId(regName)) {
    return { id, name: regName, storageOption: "local", ownerEmail: reg.ownerEmail ?? null };
  }
  return { id, name: "", storageOption: "local", ownerEmail: null };
}

export function companyStubFromPlServerShared(
  row: PlServerSharedCompanySummary
): CompanyWithPlServerShared {
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  return {
    id: row.id,
    name: name && name !== id && !looksLikeOpaqueCompanyId(name) ? name : "Company",
    storageOption: "local",
    ownerEmail: row.ownerEmail ?? undefined,
    ownerId: "",
    isOwned: false,
    plServerShared: true,
    ...(row.planId != null ? { planId: row.planId } : {}),
    ...(typeof row.planExpiryMs === "number" ? { planExpiryMs: row.planExpiryMs } : {}),
    ...(typeof row.requiresLogin === "boolean" ? { requiresLogin: row.requiresLogin } : {}),
    ...(row.usernameHint != null ? { usernameHint: row.usernameHint } : {}),
  } as CompanyWithPlServerShared;
}

export function buildPlServerGatePreviewCompanyList(
  registry: Company[],
  gateId: string
): CompanyWithPlServerShared[] {
  registry = compactCompanyList(registry);
  const { allowedCompanyIds, companies: sharedRows } = readPlServerGatePreviewContext(gateId);
  const activeGate = getActiveGate();
  const gateServerUrl =
    activeGate.type === "local_server" && activeGate.id === gateId
      ? normalizeServerUrl(activeGate.serverUrl || "")
      : "";
  if (!sharedRows.length && !allowedCompanyIds?.length) {
    if (plServerShareListAuthoritativeEmpty(gateId)) return [];
    return plServerRegistryRowsForGateFallback(registry, gateId);
  }

  const allowedSet = allowedCompanyIds?.length
    ? new Set(allowedCompanyIds.map((x) => String(x).trim()).filter(Boolean))
    : null;

  const byId = new Map<string, CompanyWithPlServerShared>(
    registry.map((c) => [String(c.id || "").trim(), c as CompanyWithPlServerShared])
  );
  const allowedRows: PlServerSharedCompanySummary[] = allowedSet
    ? [...allowedSet].map((id) => resolveAllowedPreviewRow(id, sharedRows, byId))
    : [];
  const hostIdForCompany = (company: CompanyWithPlServerShared): string =>
    String((company as Record<string, unknown>).plServerHostCompanyId || "").trim();
  const findExistingForSharedRow = (
    row: PlServerSharedCompanySummary
  ): { key: string; company: CompanyWithPlServerShared } | null => {
    const id = String(row.id || "").trim();
    const exact = byId.get(id);
    if (exact) return { key: id, company: exact };
    for (const [key, company] of byId.entries()) {
      const hostId = hostIdForCompany(company);
      if (hostId && hostId === id) return { key, company };
      if (matchPlServerSharedCompanyForLocalId(key, [row])) return { key, company };
    }
    return null;
  };

  const injectShared = (row: PlServerSharedCompanySummary) => {
    const id = String(row.id || "").trim();
    if (!id) return;
    if (allowedSet && !allowedSet.has(id)) return;
    const existing = findExistingForSharedRow(row);
    // Online/Firestore registry row pe plServerShared mat chipkao — Server tab me online company na aaye.
    if (existing && isCloudLinkedCompanyStorage(existing.company)) {
      byId.set(id, {
        id,
        name: resolvePlServerGateCompanyDisplayName(id, gateId, registry),
        storageOption: "local",
        ownerEmail: row.ownerEmail ?? undefined,
        ownerId: "",
        isOwned: false,
        plServerShared: true,
        plServerGateId: gateId,
        ...(gateServerUrl ? { plServerGateServerUrl: gateServerUrl } : {}),
        ...(row.planId != null ? { planId: row.planId } : {}),
        ...(typeof row.planExpiryMs === "number" ? { planExpiryMs: row.planExpiryMs } : {}),
        ...(typeof row.requiresLogin === "boolean" ? { requiresLogin: row.requiresLogin } : {}),
        ...(row.usernameHint != null ? { usernameHint: row.usernameHint } : {}),
      } as CompanyWithPlServerShared);
      return;
    }
    if (existing) {
      byId.set(existing.key, {
        ...existing.company,
        ...(existing.key !== id ? { plServerHostCompanyId: id } : {}),
        name: row.name || existing.company.name || resolvePlServerGateCompanyDisplayName(id, gateId, registry),
        storageOption: "local",
        syncedFromCloud: false,
        syncPolicy: "offline",
        plServerShared: true,
        plServerGateId: gateId,
        ...(gateServerUrl ? { plServerGateServerUrl: gateServerUrl } : {}),
        ...(row.planId != null ? { planId: row.planId } : {}),
        ...(typeof row.planExpiryMs === "number" ? { planExpiryMs: row.planExpiryMs } : {}),
        ...(typeof row.requiresLogin === "boolean" ? { requiresLogin: row.requiresLogin } : {}),
        ...(row.usernameHint != null ? { usernameHint: row.usernameHint } : {}),
      } as CompanyWithPlServerShared);
      return;
    }
    byId.set(id, {
      id,
      name: resolvePlServerGateCompanyDisplayName(id, gateId, registry),
      storageOption: "local",
      ownerEmail: row.ownerEmail ?? undefined,
      ownerId: "",
      isOwned: false,
      plServerShared: true,
      plServerGateId: gateId,
      ...(gateServerUrl ? { plServerGateServerUrl: gateServerUrl } : {}),
      ...(row.planId != null ? { planId: row.planId } : {}),
      ...(typeof row.planExpiryMs === "number" ? { planExpiryMs: row.planExpiryMs } : {}),
      ...(typeof row.requiresLogin === "boolean" ? { requiresLogin: row.requiresLogin } : {}),
      ...(row.usernameHint != null ? { usernameHint: row.usernameHint } : {}),
    } as CompanyWithPlServerShared);
  };

  for (const row of sharedRows) injectShared(row);

  if (allowedSet) {
    for (const id of allowedSet) {
      const row = sharedRows.find((r) => r.id === id);
      if (row) {
        injectShared(row);
        continue;
      }
      if ([...byId.values()].some((c) => {
        const cid = String(c.id || "").trim();
        const hostId = hostIdForCompany(c);
        return cid === id || hostId === id || Boolean(matchPlServerSharedCompanyForLocalId(cid, allowedRows));
      })) {
        continue;
      }
      injectShared(resolveAllowedPreviewRow(id, sharedRows, byId));
    }
  }

  let list = [...byId.values()].filter(
    (c) => c && c.isDeleted !== true && c.movedToAdminRecycleAt == null
  );
  if (allowedSet?.size) {
    list = list.filter((c) => {
      const id = String(c.id || "").trim();
      const hostId = hostIdForCompany(c);
      return allowedSet.has(id) || (hostId ? allowedSet.has(hostId) : false) || Boolean(matchPlServerSharedCompanyForLocalId(id, allowedRows));
    });
  } else if (sharedRows.length > 0) {
    list = list.filter((c) => {
      if (c?.plServerShared !== true || isCloudLinkedCompanyStorage(c)) return false;
      const id = String(c.id || "").trim();
      const hostId = hostIdForCompany(c);
      return (
        sharedRows.some((row) => row.id === id) ||
        (hostId ? sharedRows.some((row) => row.id === hostId) : false) ||
        Boolean(matchPlServerSharedCompanyForLocalId(id, sharedRows))
      );
    });
  }
  const deduped = new Map<string, CompanyWithPlServerShared>();
  const score = (c: CompanyWithPlServerShared, key: string) => {
    if (hostIdForCompany(c)) return 3;
    if (String(c.id || "").trim() !== key) return 2;
    return 1;
  };
  for (const company of list) {
    const id = String(company.id || "").trim();
    const sharedMatch = matchPlServerSharedCompanyForLocalId(id, sharedRows);
    const key = hostIdForCompany(company) || sharedMatch?.id || id;
    const canonicalId = String(key || id).trim();
    const normalized = {
      ...company,
      id: canonicalId,
      name: resolvePlServerGateCompanyDisplayName(canonicalId, gateId, registry),
      plServerHostCompanyId: canonicalId,
      plServerGateId: gateId,
      ...(gateServerUrl ? { plServerGateServerUrl: gateServerUrl } : {}),
    } as CompanyWithPlServerShared;
    const existing = deduped.get(canonicalId);
    if (!existing || score(normalized, canonicalId) > score(existing, canonicalId)) {
      deduped.set(canonicalId, normalized);
    }
  }
  return [...deduped.values()];
}

/** Preview blank ho to active local-server gate ke saved SQLite rows fallback me dikhao. */
function plServerRegistryRowsForGateFallback(
  registry: Company[],
  gateId: string
): CompanyWithPlServerShared[] {
  const activeGate = getActiveGate();
  const activeGateMatches = activeGate.id === gateId && activeGate.type === "local_server";
  const activeServerUrl = activeGateMatches ? normalizeServerUrl(activeGate.serverUrl || "") : "";
  return registry
    .filter((c) => {
      if (!c || c.isDeleted === true || c.movedToAdminRecycleAt != null) return false;
      if ((c as { plServerShared?: boolean }).plServerShared !== true) return false;
      if (isCloudLinkedCompanyStorage(c)) return false;
      const rowGateId = String((c as Record<string, unknown>).plServerGateId || "").trim();
      if (rowGateId) return rowGateId === gateId;
      const rowServerUrl = normalizeServerUrl(
        String((c as Record<string, unknown>).plServerGateServerUrl || "")
      );
      if (rowServerUrl && activeServerUrl) return rowServerUrl === activeServerUrl;
      return activeGateMatches;
    })
    .map(
      (c) =>
        ({
          ...c,
          plServerShared: true,
          isOwned: c.isOwned ?? false,
        }) as CompanyWithPlServerShared
    );
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
  const contextGateId = getPlServerContextGateId();
  const activeGate = getActiveGate();
  const contextGateServerUrl =
    contextGateId && activeGate.type === "local_server" && activeGate.id === contextGateId
      ? normalizeServerUrl(activeGate.serverUrl || "")
      : "";
  const byId = new Map<string, CompanyWithPlServerShared>(
    companies.map((c) => [String(c.id || "").trim(), c as CompanyWithPlServerShared])
  );
  const authoritativeShareList = hasPlServerAuthoritativeShareList(contextGateId);
  for (const row of shared) {
    const direct = byId.get(row.id);
    const matched = direct
      ? { key: row.id, company: direct }
      : [...byId.entries()]
          .map(([key, company]) => ({ key, company }))
          .find(({ key, company }) => {
            const hostId = String((company as Record<string, unknown>).plServerHostCompanyId || "").trim();
            return hostId === row.id || Boolean(matchPlServerSharedCompanyForLocalId(key, [row]));
          }) ?? null;
    const existing = matched?.company ?? null;
    // Online company ko Server-shared mat banao — Online tab alignment ke liye.
    if (existing && isCloudLinkedCompanyStorage(existing)) {
      continue;
    }
    if (existing) {
      const existingOwnedLocal =
        existing.isOwned === true &&
        String(existing.storageOption ?? "").toLowerCase() === "local" &&
        existing.syncedFromCloud !== true &&
        !String((existing as { plServerHostCompanyId?: string }).plServerHostCompanyId ?? "").trim();
      const matchedKey = matched?.key || row.id;
      if (
        existingOwnedLocal &&
        matchedKey !== row.id &&
        !matchPlServerSharedCompanyForLocalId(matchedKey, [row])
      ) {
        continue;
      }
      byId.set(matchedKey, {
        ...existing,
        ...((matched?.key || row.id) !== row.id ? { plServerHostCompanyId: row.id } : {}),
        name: isRealPlServerCompanyName(row.name, row.id) ? row.name : existing.name,
        ownerEmail: row.ownerEmail ?? existing.ownerEmail,
        storageOption: "local",
        syncedFromCloud: false,
        syncPolicy: "offline",
        plServerShared: true,
        ...(contextGateId ? { plServerGateId: contextGateId } : {}),
        ...(contextGateServerUrl ? { plServerGateServerUrl: contextGateServerUrl } : {}),
        ...(row.planId != null ? { planId: row.planId } : {}),
        ...(typeof row.planExpiryMs === "number" ? { planExpiryMs: row.planExpiryMs } : {}),
        ...(typeof row.requiresLogin === "boolean" ? { requiresLogin: row.requiresLogin } : {}),
        ...(row.usernameHint != null ? { usernameHint: row.usernameHint } : {}),
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
      ...(contextGateId ? { plServerGateId: contextGateId } : {}),
      ...(contextGateServerUrl ? { plServerGateServerUrl: contextGateServerUrl } : {}),
      ...(row.planId != null ? { planId: row.planId } : {}),
      ...(typeof row.planExpiryMs === "number" ? { planExpiryMs: row.planExpiryMs } : {}),
      ...(typeof row.requiresLogin === "boolean" ? { requiresLogin: row.requiresLogin } : {}),
      ...(row.usernameHint != null ? { usernameHint: row.usernameHint } : {}),
    } as CompanyWithPlServerShared);
  }
  if (!authoritativeShareList) return [...byId.values()];
  return [...byId.values()].filter((c) => {
    if ((c as { plServerShared?: boolean }).plServerShared !== true) return true;
    return isListedPlServerSharedCompany(c, contextGateId);
  });
}

export function filterCompaniesForPlServerAccess(companies: Company[]): CompanyWithPlServerShared[] {
  const compact = compactCompanyList(companies);
  if (!shouldFetchPlServerAccessContext()) return compact;
  const merged = mergePlServerSharedCompaniesIntoRegistry(compact);
  const allowed = getPlServerAllowedCompanyIds();
  if (!allowed?.length) {
    const shared = resolvePlServerAuthoritativeSharedCompanies(getPlServerContextGateId());
    if (plServerShareListAuthoritativeEmpty(getPlServerContextGateId()) || !shared.length) {
      return [];
    }
    return merged.filter((c) => isListedPlServerSharedCompany(c, getPlServerContextGateId()));
  }
  const set = new Set(allowed);
  return merged.filter((c) => {
    const id = String(c.id || "").trim();
    const hostId = String((c as { plServerHostCompanyId?: string }).plServerHostCompanyId || "").trim();
    return set.has(id) || (hostId ? set.has(hostId) : false);
  });
}

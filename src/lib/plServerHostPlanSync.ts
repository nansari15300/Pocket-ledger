"use client";

/**
 * PL Server: host company plan → staff/client SQLite.
 * pocket-ledger.com sync-plan ke bina; ek baar save ke baad host offline pe bhi plan drop nahi hota
 * (upsert merge + yeh apply helpers).
 */

import { normalizePlanIdForClient, planTierIndex, type PlanId } from "@/config/plans";
import {
  clearCompanyPlanLocalCache,
  readCompanyPlanLocalCache,
  writeCompanyPlanLocalCache,
  type CompanyPlanLocalCacheEntry,
} from "@/lib/companyPlanLocalCache";
import { getLocalCompanyById, listLocalCompanies, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";
import { matchPlServerSharedCompanyForLocalId } from "@/lib/plServerHostCompanyId";
import type { SyncCompanyPlanResult } from "@/lib/companyPlanServerSync";

export const PL_SERVER_PLAN_PERSIST_KEYS = [
  "planId",
  "planExpiryMs",
  "offlineLicenseValidUntilMs",
  "planUpgradedAtMs",
  "plServerPlanSyncedAtMs",
  "planSyncFirestoreCompanyId",
] as const;

export type PlServerHostPlanFields = {
  planId: PlanId;
  planExpiryMs: number | null;
  offlineLicenseValidUntilMs: number | null;
};

const PLAN_CACHE_PREFIX = "pocket-ledger:companyPlan:";

function pickBetterPlan(a: PlServerHostPlanFields, b: PlServerHostPlanFields): PlServerHostPlanFields {
  const ia = planTierIndex(a.planId);
  const ib = planTierIndex(b.planId);
  if (ib > ia) return b;
  if (ia > ib) return a;
  const expA = a.planExpiryMs ?? 0;
  const expB = b.planExpiryMs ?? 0;
  if (expB > expA) {
    return {
      ...a,
      planExpiryMs: b.planExpiryMs,
      offlineLicenseValidUntilMs: b.offlineLicenseValidUntilMs ?? a.offlineLicenseValidUntilMs,
    };
  }
  return a;
}

function fieldsFromCacheEntry(entry: CompanyPlanLocalCacheEntry): PlServerHostPlanFields {
  return {
    planId: normalizePlanIdForClient(entry.planId),
    planExpiryMs:
      typeof entry.planExpiryMs === "number" && Number.isFinite(entry.planExpiryMs) ? entry.planExpiryMs : null,
    offlineLicenseValidUntilMs:
      typeof entry.entitlementOfflineUntilMsFromJwt === "number" &&
      Number.isFinite(entry.entitlementOfflineUntilMsFromJwt)
        ? entry.entitlementOfflineUntilMsFromJwt
        : null,
  };
}

/** Host device: saari company plan caches — Pro+ kisi online company pe ho to shareable local pe bhi. */
function scanBestPlanFromAllDeviceCaches(): PlServerHostPlanFields | null {
  if (typeof window === "undefined") return null;
  let best: PlServerHostPlanFields | null = null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(PLAN_CACHE_PREFIX)) continue;
      const companyId = key.slice(PLAN_CACHE_PREFIX.length);
      if (!companyId) continue;
      const entry = readCompanyPlanLocalCache(companyId);
      if (!entry || normalizePlanIdForClient(entry.planId) === "basic") continue;
      const fields = fieldsFromCacheEntry(entry);
      best = best ? pickBetterPlan(best, fields) : fields;
    }
  } catch {
    /* ignore */
  }
  return best;
}

/** Host SQLite / single-row cache se plan. */
export function resolveHostPlanFieldsForPlShare(row: {
  id?: string;
  planId?: unknown;
  planExpiryMs?: unknown;
  offlineLicenseValidUntilMs?: unknown;
}): PlServerHostPlanFields {
  let planId = normalizePlanIdForClient(
    typeof row.planId === "string" ? row.planId : row.planId != null ? String(row.planId) : undefined
  );
  let planExpiryMs =
    typeof row.planExpiryMs === "number" && Number.isFinite(row.planExpiryMs) ? row.planExpiryMs : null;
  let offlineLicenseValidUntilMs =
    typeof row.offlineLicenseValidUntilMs === "number" && Number.isFinite(row.offlineLicenseValidUntilMs)
      ? row.offlineLicenseValidUntilMs
      : null;

  const cid = String(row.id || "").trim();
  if (cid) {
    try {
      const cache = readCompanyPlanLocalCache(cid);
      if (cache && planTierIndex(cache.planId) > planTierIndex(planId)) {
        planId = normalizePlanIdForClient(cache.planId);
        if (typeof cache.planExpiryMs === "number" && Number.isFinite(cache.planExpiryMs)) {
          planExpiryMs = cache.planExpiryMs;
        }
      }
    } catch {
      /* cache optional */
    }
  }

  return { planId, planExpiryMs, offlineLicenseValidUntilMs };
}

/**
 * Host share / mirror: company row + same-owner locals + device-wide plan cache.
 * Admin UI Pro+ dikhe lekin shared local SQLite `basic` ho — tab bhi Pro+ export.
 */
export async function resolveHostPlanFieldsForPlShareAsync(row: {
  id?: string;
  ownerId?: unknown;
  ownerEmail?: unknown;
  planId?: unknown;
  planExpiryMs?: unknown;
  offlineLicenseValidUntilMs?: unknown;
  isOwned?: unknown;
}): Promise<PlServerHostPlanFields> {
  let best = resolveHostPlanFieldsForPlShare(row);
  const ownerId = String(row.ownerId || "").trim();
  const ownerEmail = String(row.ownerEmail || "")
    .toLowerCase()
    .trim();

  try {
    const all = await listLocalCompanies();
    for (const c of all) {
      const sameOwner =
        (ownerId && String(c.ownerId || "").trim() === ownerId) ||
        (ownerEmail &&
          String(c.ownerEmail || "")
            .toLowerCase()
            .trim() === ownerEmail) ||
        c.isOwned === true;
      if (!sameOwner && String(c.id || "").trim() !== String(row.id || "").trim()) continue;
      best = pickBetterPlan(best, resolveHostPlanFieldsForPlShare(c));
    }
  } catch {
    /* sqlite optional */
  }

  const deviceBest = scanBestPlanFromAllDeviceCaches();
  if (deviceBest) best = pickBetterPlan(best, deviceBest);
  return best;
}

export function plServerHostPlanFieldsFromSummary(
  row: PlServerSharedCompanySummary | null | undefined
): PlServerHostPlanFields | null {
  if (!row?.id) return null;
  if (row.planId == null && row.planExpiryMs == null && row.offlineLicenseValidUntilMs == null) {
    return null;
  }
  return {
    planId: normalizePlanIdForClient(row.planId),
    planExpiryMs:
      typeof row.planExpiryMs === "number" && Number.isFinite(row.planExpiryMs) ? row.planExpiryMs : null,
    offlineLicenseValidUntilMs:
      typeof row.offlineLicenseValidUntilMs === "number" && Number.isFinite(row.offlineLicenseValidUntilMs)
        ? row.offlineLicenseValidUntilMs
        : null,
  };
}

export function plServerHostPlanFieldsFromCompanyBundle(
  company: Record<string, unknown> | null | undefined
): PlServerHostPlanFields | null {
  if (!company || typeof company !== "object") return null;
  if (!("planId" in company) && !("planExpiryMs" in company) && !("offlineLicenseValidUntilMs" in company)) {
    return null;
  }
  return resolveHostPlanFieldsForPlShare({
    id: typeof company.id === "string" ? company.id : undefined,
    planId: company.planId,
    planExpiryMs: company.planExpiryMs,
    offlineLicenseValidUntilMs: company.offlineLicenseValidUntilMs,
  });
}

export function mergePersistedPlServerPlanFields(
  existing: LocalCompanyDoc | null | undefined,
  incoming: LocalCompanyDoc
): LocalCompanyDoc {
  if (!existing?.id) return incoming;
  const out: LocalCompanyDoc = { ...incoming };
  for (const key of PL_SERVER_PLAN_PERSIST_KEYS) {
    if (out[key] === undefined && existing[key] !== undefined && existing[key] !== null) {
      out[key] = existing[key];
    }
  }
  return out;
}

/**
 * Host plan → client SQLite + cache.
 * PL sync kabhi higher → basic downgrade nahi (galat host basic se wipe avoid).
 */
export async function applyPlServerHostPlanToLocalCompany(
  companyId: string,
  plan: PlServerHostPlanFields
): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const local = await getLocalCompanyById(id, { includeDeleted: true });
  if (!local) return false;

  const nextPlanId = normalizePlanIdForClient(plan.planId);
  const prevPlanId = normalizePlanIdForClient(
    typeof local.planId === "string" ? local.planId : undefined
  );
  const prevExpiry =
    typeof local.planExpiryMs === "number" && Number.isFinite(local.planExpiryMs) ? local.planExpiryMs : null;
  const prevOffline =
    typeof local.offlineLicenseValidUntilMs === "number" && Number.isFinite(local.offlineLicenseValidUntilMs)
      ? local.offlineLicenseValidUntilMs
      : null;

  if (planTierIndex(nextPlanId) < planTierIndex(prevPlanId)) {
    return false;
  }

  const same =
    prevPlanId === nextPlanId &&
    prevExpiry === plan.planExpiryMs &&
    prevOffline === plan.offlineLicenseValidUntilMs;
  if (same) return false;

  const merged: LocalCompanyDoc = {
    ...local,
    planId: nextPlanId,
    planUpgradedAtMs: Date.now(),
    plServerPlanSyncedAtMs: Date.now(),
  };
  if (plan.planExpiryMs != null) merged.planExpiryMs = plan.planExpiryMs;
  else if (nextPlanId === "basic") delete merged.planExpiryMs;
  if (plan.offlineLicenseValidUntilMs != null) {
    merged.offlineLicenseValidUntilMs = plan.offlineLicenseValidUntilMs;
  }

  await upsertLocalCompany(merged);

  if (nextPlanId === "basic") {
    clearCompanyPlanLocalCache(id);
  } else if (plan.planExpiryMs != null && Number.isFinite(plan.planExpiryMs)) {
    writeCompanyPlanLocalCache(id, {
      planId: nextPlanId,
      planExpiryMs: plan.planExpiryMs,
    });
  } else {
    writeCompanyPlanLocalCache(id, {
      planId: nextPlanId,
      planExpiryMs: Date.now() + 400 * 24 * 60 * 60 * 1000,
    });
  }

  try {
    const { bumpLocalCompanyRegistry } = await import("@/lib/applyStripePlanToLocalCompany");
    bumpLocalCompanyRegistry();
  } catch {
    /* optional */
  }

  return true;
}

/** Host `/__pl_access_context` → client SQLite + plan cache (manual refresh / hosted sync off). */
async function fetchPlServerHostPlanFieldsFromDeltaBundle(
  localCompanyId: string,
  hostCompanyId: string
): Promise<PlServerHostPlanFields | null> {
  try {
    const { resolvePlServerDeltaTransport } = await import("@/lib/plServerClientDeltaSync");
    const { gateHttpGet } = await import("@/lib/gates/gateServerFetch");
    const transport = resolvePlServerDeltaTransport(localCompanyId);
    if (!transport?.baseUrl) return null;
    const hostId = String(hostCompanyId || localCompanyId).trim();
    if (!hostId) return null;
    const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_company_delta/${encodeURIComponent(hostId)}`;
    const { status, body } = await gateHttpGet(url, transport.accessToken, { timeoutMs: 25_000 });
    if (!status || status >= 400) return null;
    const parsed = JSON.parse(body) as { company?: Record<string, unknown> };
    return plServerHostPlanFieldsFromCompanyBundle(parsed?.company ?? null);
  } catch {
    return null;
  }
}

async function resolvePlServerHostPlanFieldsForClientRefresh(
  localCompanyId: string,
  summary: PlServerSharedCompanySummary | null | undefined
): Promise<PlServerHostPlanFields | null> {
  const fromSummary = plServerHostPlanFieldsFromSummary(summary);
  if (fromSummary) return fromSummary;
  const hostId = String(summary?.id || localCompanyId).trim();
  const fromDelta = await fetchPlServerHostPlanFieldsFromDeltaBundle(localCompanyId, hostId);
  if (fromDelta) return fromDelta;
  return null;
}

export async function refreshPlServerHostPlanForLocalCompany(
  localCompanyId: string,
  options?: { forceAccessContext?: boolean }
): Promise<SyncCompanyPlanResult> {
  const id = String(localCompanyId || "").trim();
  if (!id) return { ok: false, applied: false, reason: "no_context" };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, applied: false, reason: "offline" };
  }
  try {
    const { refreshPlServerAccessContext, getPlServerSharedCompanies } = await import(
      "@/lib/plServerAccessContext"
    );
    if (options?.forceAccessContext !== false) {
      await refreshPlServerAccessContext({ force: true });
    }
    const hit = matchPlServerSharedCompanyForLocalId(id, getPlServerSharedCompanies());
    if (!hit) return { ok: false, applied: false, reason: "no_shared_summary" };
    const fields = await resolvePlServerHostPlanFieldsForClientRefresh(id, hit);
    if (!fields) return { ok: true, applied: false, reason: "no_plan_fields" };
    const { patchPlServerSharedCompanyPlanInSession } = await import("@/lib/plServerAccessContext");
    patchPlServerSharedCompanyPlanInSession(String(hit.id || id).trim(), fields);
    const applied = await applyPlServerHostPlanToLocalCompany(id, fields);
    return { ok: true, applied };
  } catch {
    return { ok: false, applied: false, reason: "network" };
  }
}

/** Access context: saari shared companies pe host plan SQLite me apply. */
export async function applyPlServerHostPlansFromSharedSummaries(
  rows: ReadonlyArray<PlServerSharedCompanySummary>
): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const hostId = String(row.id || "").trim();
    if (!hostId) continue;
    const fields = plServerHostPlanFieldsFromSummary(row);
    if (!fields) continue;

    const targetIds = new Set<string>([hostId]);
    try {
      const locals = await listLocalCompanies({ includeDeleted: true });
      for (const local of locals) {
        const localId = String(local.id || "").trim();
        if (!localId || localId === hostId) continue;
        if (matchPlServerSharedCompanyForLocalId(localId, [row])) {
          targetIds.add(localId);
        }
      }
    } catch {
      /* sqlite optional */
    }

    for (const id of targetIds) {
      try {
        const existing = await getLocalCompanyById(id, { includeDeleted: true });
        if (!existing) {
          const { plServerClientLocalCompanyRow } = await import("@/lib/plServerClientCompanyDelta");
          await upsertLocalCompany(
            plServerClientLocalCompanyRow(id, String(row.name || id), row.ownerEmail ?? null, {
              planId: fields.planId,
              planExpiryMs: fields.planExpiryMs,
              offlineLicenseValidUntilMs: fields.offlineLicenseValidUntilMs,
            })
          );
        }
      } catch {
        continue;
      }
      if (await applyPlServerHostPlanToLocalCompany(id, fields)) applied += 1;
    }
  }
  return applied;
}

/** Mirror export: company JSON me effective host plan chipkao. */
export async function withHostPlanFieldsOnCompanyExport(
  company: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const plan = await resolveHostPlanFieldsForPlShareAsync({
    id: typeof company.id === "string" ? company.id : undefined,
    ownerId: company.ownerId,
    ownerEmail: company.ownerEmail,
    planId: company.planId,
    planExpiryMs: company.planExpiryMs,
    offlineLicenseValidUntilMs: company.offlineLicenseValidUntilMs,
    isOwned: company.isOwned,
  });
  return {
    ...company,
    planId: plan.planId,
    ...(plan.planExpiryMs != null ? { planExpiryMs: plan.planExpiryMs } : {}),
    ...(plan.offlineLicenseValidUntilMs != null
      ? { offlineLicenseValidUntilMs: plan.offlineLicenseValidUntilMs }
      : {}),
    plServerPlanSyncedAtMs: Date.now(),
  };
}

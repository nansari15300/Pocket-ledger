"use client";

/**
 * Server → local only: Firebase Admin plan + offline license window (20d chunk, sub cap).
 * `authoritativeCompanyId` alag ho to bhi SQLite row sahi patch hoti hai.
 */
import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import { bumpLocalCompanyRegistry } from "@/lib/applyStripePlanToLocalCompany";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { clearCompanyPlanLocalCache, writeCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";

/** ~7 min */
export const PLAN_SERVER_SYNC_INTERVAL_MS = 7 * 60 * 1000;

/** Optional “plans doc verify” stale — banner alag 20-din wala primary */
export const PLAN_SYNC_STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** 20 din server touch nahi → user ko online sync dikhane ka banner */
export const OFFLINE_PLAN_SYNC_WARNING_MS = 20 * 24 * 60 * 60 * 1000;

const SYNC_AT_KEY = (localCompanyId: string) =>
  `pocket-ledger:planAuthoritativeSyncAt:${localCompanyId.trim()}`;

export type ServerAuthoritativePlanPayload = {
  companyId: string;
  authoritativeCompanyId?: string;
  localCompanyId?: string;
  planId: string;
  planExpiryMs: number | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  lastStripeCheckoutSessionId?: string | null;
  offlineLicenseValidUntilMs?: number;
};

export function writePlanAuthoritativeSyncTimestamp(localCompanyId: string, atMs: number = Date.now()): void {
  if (typeof window === "undefined" || !localCompanyId?.trim()) return;
  try {
    window.localStorage.setItem(SYNC_AT_KEY(localCompanyId), String(atMs));
  } catch {
    /* ignore */
  }
}

export function readPlanAuthoritativeSyncTimestamp(localCompanyId: string): number | null {
  if (typeof window === "undefined" || !localCompanyId?.trim()) return null;
  try {
    const raw = window.localStorage.getItem(SYNC_AT_KEY(localCompanyId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export type PlanSyncBannerState = {
  lastSuccessAtMs: number | null;
  isStale: boolean;
  needsOnlinePlanSync: boolean;
  offlineLicenseValidUntilMs: number | null;
  offlineLicenseExpired: boolean;
};

/** Profile banner: 3d tech stale + 20d mandatory online + server offline window */
export function recomputePlanSyncBannerState(
  localCompanyId: string | null,
  companyShape: { offlineLicenseValidUntilMs?: number } | null
): PlanSyncBannerState {
  if (!localCompanyId?.trim()) {
    return {
      lastSuccessAtMs: null,
      isStale: false,
      needsOnlinePlanSync: false,
      offlineLicenseValidUntilMs: null,
      offlineLicenseExpired: false,
    };
  }
  const lastSuccessAtMs = readPlanAuthoritativeSyncTimestamp(localCompanyId);
  const online = typeof navigator !== "undefined" && navigator.onLine;
  const isStale =
    online &&
    lastSuccessAtMs != null &&
    Date.now() - lastSuccessAtMs > PLAN_SYNC_STALE_AFTER_MS;
  const needsOnlinePlanSync =
    lastSuccessAtMs != null && Date.now() - lastSuccessAtMs > OFFLINE_PLAN_SYNC_WARNING_MS;
  const rawUntil = companyShape?.offlineLicenseValidUntilMs;
  const offlineLicenseValidUntilMs =
    typeof rawUntil === "number" && Number.isFinite(rawUntil) ? rawUntil : null;
  const offlineLicenseExpired =
    offlineLicenseValidUntilMs != null && Date.now() > offlineLicenseValidUntilMs;
  return {
    lastSuccessAtMs,
    isStale,
    needsOnlinePlanSync,
    offlineLicenseValidUntilMs,
    offlineLicenseExpired,
  };
}

export type SyncCompanyPlanResult = { ok: boolean; applied: boolean; reason?: string };

/** Fetch timeout helper — static `serve`/APK par broken `/api/*` kabhi‑kabhi lambi pending rakhta hai UI block feel. */
const PLAN_SYNC_FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const tid = typeof setTimeout !== "undefined" ? setTimeout(() => ctrl.abort(), ms) : undefined;
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    if (tid !== undefined) clearTimeout(tid);
  }
}

/**
 * APK/static export bundle me `/api/*` hota nahin — bina billing host ke POST bar‑bar waste + hang‑risk.
 * Prod static me `NEXT_PUBLIC_BILLING_API_ORIGIN=https://your-next.app` set karo jahan ye API live ho.
 */
function shouldSkipPlanServerSyncDueToStaticExportWithoutApi(): boolean {
  if (process.env.NEXT_PUBLIC_STATIC_BUILD !== "1") return false;
  const origin = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BILLING_API_ORIGIN?.trim() : "";
  return !origin;
}

/** Plan sync POST: flaky dev server / billing proxy par 5xx ya TCP reset — bounded retry. */
const PLAN_SYNC_FETCH_MAX_ATTEMPTS = 3;

export async function syncCompanyPlanFromServer(opts: {
  /** Firestore `companies/{id}` */
  firebaseCompanyId: string;
  /** SQLite row id (selected company) — missing par firebase id */
  localCompanyId: string;
  getIdToken: () => Promise<string>;
}): Promise<SyncCompanyPlanResult> {
  if (shouldSkipPlanServerSyncDueToStaticExportWithoutApi()) {
    return { ok: false, applied: false, reason: "static_no_billing_api" };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, applied: false, reason: "offline" };
  }
  const firebaseCompanyId = opts.firebaseCompanyId.trim();
  const localCompanyId = opts.localCompanyId.trim();
  if (!firebaseCompanyId || !localCompanyId) {
    return { ok: false, applied: false, reason: "missing_ids" };
  }

  let token: string;
  try {
    token = await opts.getIdToken();
  } catch {
    return { ok: false, applied: false, reason: "token_error" };
  }

  const syncPlanPath = "/api/company/sync-plan";
  const primaryUrl = getBillingApiUrl(syncPlanPath);
  const fetchOpts: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ companyId: firebaseCompanyId, localCompanyId }),
  };

  /** Transient failures (ECONNRESET, aborted compile) pe dubara POST; deterministic errors (401/403) pe break. */
  let res!: Response;
  for (let attempt = 1; attempt <= PLAN_SYNC_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetchWithTimeout(primaryUrl, fetchOpts, PLAN_SYNC_FETCH_TIMEOUT_MS);
      if (res.status < 500 || attempt === PLAN_SYNC_FETCH_MAX_ATTEMPTS) break;
    } catch (e: unknown) {
      const aborted =
        typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
      if (attempt === PLAN_SYNC_FETCH_MAX_ATTEMPTS) {
        return { ok: false, applied: false, reason: aborted ? "timeout" : "network" };
      }
    }
    await new Promise((r) => setTimeout(r, 280 * attempt));
  }

  // NEXT_PUBLIC_BILLING_API_ORIGIN galat host par ho to 404 — dev me API yahin Next par ho to same-origin dobara try karo
  const triedRemote = typeof primaryUrl === "string" && /^https?:\/\//i.test(primaryUrl);
  if (res.status === 404 && triedRemote && typeof window !== "undefined") {
    try {
      res = await fetchWithTimeout(syncPlanPath, fetchOpts, PLAN_SYNC_FETCH_TIMEOUT_MS);
    } catch (e: unknown) {
      const aborted = typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
      return { ok: false, applied: false, reason: aborted ? "timeout" : "network" };
    }
  }

  let errMsg = `http_${res.status}`;
  let data: ServerAuthoritativePlanPayload & { error?: string } | null = null;
  try {
    data = (await res.json()) as ServerAuthoritativePlanPayload & { error?: string };
    if (typeof data?.error === "string") errMsg = data.error;
  } catch {
    /* ignore */
  }

  if (!res.ok || !data?.companyId) {
    return { ok: false, applied: false, reason: errMsg };
  }

  const planId = String(data.planId || "basic").trim() || "basic";
  const planExpiryMs =
    typeof data.planExpiryMs === "number" && Number.isFinite(data.planExpiryMs) ? data.planExpiryMs : null;

  if (planId === "basic") {
    clearCompanyPlanLocalCache(localCompanyId);
  } else if (planExpiryMs != null) {
    writeCompanyPlanLocalCache(localCompanyId, {
      planId,
      planExpiryMs,
      lastStripeCheckoutSessionId: data.lastStripeCheckoutSessionId ?? undefined,
    });
  }

  const local = await getLocalCompanyById(localCompanyId);
  if (!local) {
    writePlanAuthoritativeSyncTimestamp(localCompanyId);
    return { ok: true, applied: false, reason: "no_local_sqlite_row" };
  }

  const offlineUntil =
    typeof data.offlineLicenseValidUntilMs === "number" && Number.isFinite(data.offlineLicenseValidUntilMs)
      ? data.offlineLicenseValidUntilMs
      : undefined;

  const merged: Record<string, unknown> = {
    ...local,
    planId,
    planUpgradedAtMs: Date.now(),
    authoritativeCompanyId: firebaseCompanyId,
    ...(offlineUntil != null ? { offlineLicenseValidUntilMs: offlineUntil } : {}),
    ...(data.stripeCustomerId != null && data.stripeCustomerId !== ""
      ? { stripeCustomerId: data.stripeCustomerId }
      : {}),
    ...(data.stripeSubscriptionId != null && data.stripeSubscriptionId !== ""
      ? { stripeSubscriptionId: data.stripeSubscriptionId }
      : {}),
    ...(data.lastStripeCheckoutSessionId
      ? { lastStripeCheckoutSessionId: data.lastStripeCheckoutSessionId }
      : {}),
  };
  if (planId === "basic") delete merged.planExpiryMs;
  else if (planExpiryMs != null) merged.planExpiryMs = planExpiryMs;

  await upsertLocalCompany(merged as LocalCompanyDoc);

  writePlanAuthoritativeSyncTimestamp(localCompanyId);
  bumpLocalCompanyRegistry();
  return { ok: true, applied: true };
}

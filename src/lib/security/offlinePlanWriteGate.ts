"use client";

/**
 * Paid plan expiry ke baad local mutations band — SQLite tamper se "Pro" fake karke likhna possible rahega
 * jab tak signed JWT cache align na ho; JWT OK ho to `plan_exp` claim authoritative.
 */
import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import {
  readCompanyPlanLocalCache,
  resolveEffectivePlanIdForVoucherQuota,
} from "@/lib/companyPlanLocalCache";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";

/** Firestore / cloud mirror company — inhi par plan governance + tamper-aware gate lagta hai. */
function shouldEnforcePlanWriteGate(reg: LocalCompanyDoc): boolean {
  const c = reg as Record<string, unknown>;
  if (String(c.storageOption || "").toLowerCase() === "firebase") return true;
  if (c.syncedFromCloud === true) return true;
  if (String(c.authoritativeCompanyId || "").trim().length > 0) return true;
  if (String(c.syncPolicy || "").toLowerCase() === "online") return true;
  return false;
}

function mergePlanExpiryMsForGate(
  reg: Record<string, unknown>,
  cache: ReturnType<typeof readCompanyPlanLocalCache>
): number | null {
  // JWT verify OK: server-signed `plan_exp` — SQLite planExpiryMs edit bypass kam ho.
  if (
    cache?.entitlementSignatureOk === true &&
    typeof cache.entitlementPlanExpMsFromJwt === "number" &&
    Number.isFinite(cache.entitlementPlanExpMsFromJwt)
  ) {
    return cache.entitlementPlanExpMsFromJwt;
  }
  const a = typeof reg.planExpiryMs === "number" && Number.isFinite(reg.planExpiryMs) ? reg.planExpiryMs : null;
  const b =
    cache && typeof cache.planExpiryMs === "number" && Number.isFinite(cache.planExpiryMs) ? cache.planExpiryMs : null;
  if (a != null && b != null) return Math.min(a, b);
  return a ?? b ?? null;
}

function effectivePlanIdForGate(companyId: string, reg: Record<string, unknown>, cache: ReturnType<typeof readCompanyPlanLocalCache>): PlanId {
  if (cache?.entitlementSignatureOk === true && cache.entitlementPlanIdFromJwt?.trim()) {
    return normalizePlanIdForClient(cache.entitlementPlanIdFromJwt.trim());
  }
  return resolveEffectivePlanIdForVoucherQuota(companyId, {
    planId: reg.planId as string | null | undefined,
    planExpiryMs: reg.planExpiryMs,
  });
}

export type PlanMutationBlockedReason =
  | "plan_subscription_expired_read_only"
  | "signed_entitlement_required"
  | "entitlement_device_mismatch";

export class PlanMutationBlockedError extends Error {
  readonly code = "PLAN_MUTATION_BLOCKED" as const;
  readonly blockReason: PlanMutationBlockedReason;

  constructor(blockReason: PlanMutationBlockedReason, message: string) {
    super(message);
    this.name = "PlanMutationBlockedError";
    this.blockReason = blockReason;
  }
}

/** Voucher / ledger writes se pehle — cloud-linked company + expired paid = throw. */
export async function assertCompanyAllowsLedgerMutations(localCompanyId: string): Promise<void> {
  const cid = String(localCompanyId || "").trim();
  if (!cid) return;
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg || (reg as { isDeleted?: boolean }).isDeleted === true) return;
  if (!shouldEnforcePlanWriteGate(reg)) return;

  const cache = readCompanyPlanLocalCache(cid);
  const regAny = reg as Record<string, unknown>;
  const planId = effectivePlanIdForGate(cid, regAny, cache);
  const expiryMs = mergePlanExpiryMsForGate(regAny, cache);
  const now = Date.now();

  const requireSigned =
    typeof process !== "undefined" &&
    String(process.env.NEXT_PUBLIC_REQUIRE_SIGNED_PLAN_ENTITLEMENT || "").trim() === "1";
  if (requireSigned && cache?.entitlementSignatureOk !== true) {
    throw new PlanMutationBlockedError(
      "signed_entitlement_required",
      "Plan verification required: connect once while online so the app can refresh your subscription signature."
    );
  }

  if (cache?.entitlementSignatureOk === true && cache.entitlementDeviceMatch === false) {
    throw new PlanMutationBlockedError(
      "entitlement_device_mismatch",
      "This subscription signature is bound to another device profile. Sign in and sync plan on this device, or contact support."
    );
  }

  if (planId !== "basic" && expiryMs != null && now > expiryMs) {
    throw new PlanMutationBlockedError(
      "plan_subscription_expired_read_only",
      "Your paid plan has expired — you can view data offline, but creating or editing vouchers requires an active subscription. Go online to renew or sync."
    );
  }
}

export function isPlanMutationBlockedError(e: unknown): e is PlanMutationBlockedError {
  return e instanceof PlanMutationBlockedError;
}

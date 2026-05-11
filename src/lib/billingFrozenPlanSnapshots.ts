import { normalizePlanIdForClient, type PlanId } from "@/config/plans";
import {
  classifyPlanChange,
  renewColumnFrozenUsageAndCreditDaysLeft,
  usageNprAccruedSinceCurrentTierStart,
} from "@/lib/subscriptionPlanMath";

const MS_YEAR = 365 * 86400000;

/**
 * Firestore `companies.billingFrozenUsageLedger[]` — tier chhodte waqt ka readonly snapshot (refresh ke baad bhi same).
 * Active plan par live `renewColumnFrozenUsageAndCreditDaysLeft` chale; frozen rows kabhi dubara derive mat karo.
 */
export type BillingFrozenPlanSnapshot = {
  planId: string;
  frozenUsageNpr: number;
  frozenCreditDaysLeft: number;
  frozenCreditNpr: number;
  frozenAtMs: number;
};

/** Client / server: Firestore array ko safe parse. */
export function parseBillingFrozenPlanLedger(raw: unknown): BillingFrozenPlanSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: BillingFrozenPlanSnapshot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const planRaw = typeof o.planId === "string" ? o.planId : null;
    if (!planRaw) continue;
    const planId = normalizePlanIdForClient(planRaw);
    const frozenUsageNpr =
      typeof o.frozenUsageNpr === "number" && Number.isFinite(o.frozenUsageNpr) ? o.frozenUsageNpr : 0;
    const frozenCreditDaysLeft =
      typeof o.frozenCreditDaysLeft === "number" && Number.isFinite(o.frozenCreditDaysLeft)
        ? o.frozenCreditDaysLeft
        : 0;
    const frozenCreditNpr =
      typeof o.frozenCreditNpr === "number" && Number.isFinite(o.frozenCreditNpr) ? o.frozenCreditNpr : 0;
    const frozenAtMs = typeof o.frozenAtMs === "number" && Number.isFinite(o.frozenAtMs) ? o.frozenAtMs : 0;
    out.push({ planId, frozenUsageNpr, frozenCreditDaysLeft, frozenCreditNpr, frozenAtMs });
  }
  return out;
}

export function parseBillingDowngradeBlockedPlanIds(raw: unknown): PlanId[] {
  if (!Array.isArray(raw)) return [];
  const ids: PlanId[] = [];
  for (const x of raw) {
    if (typeof x !== "string" || !x.trim()) continue;
    ids.push(normalizePlanIdForClient(x));
  }
  return ids;
}

export function findFrozenSnapshotForPlan(
  ledger: BillingFrozenPlanSnapshot[],
  planId: PlanId
): BillingFrozenPlanSnapshot | undefined {
  const n = normalizePlanIdForClient(planId);
  return ledger.find((e) => normalizePlanIdForClient(e.planId) === n);
}

/**
 * Company: kab se **abhi wala** paid tier chal raha — upgrade apply se **pehle** read karo; frozen chhoota tier ka usage ramp isi se.
 * `planUpgradedAtMs` numeric mirror (client writes) bhi support.
 */
export function resolveCompanyPlanTierStartedAtMs(cdata: {
  planUpgradedAt?: { toMillis?: () => number } | null;
  planUpgradedAtMs?: unknown;
}): number | null {
  const ts = cdata.planUpgradedAt;
  if (ts && typeof ts.toMillis === "function") {
    const m = ts.toMillis();
    if (Number.isFinite(m)) return m;
  }
  if (typeof cdata.planUpgradedAtMs === "number" && Number.isFinite(cdata.planUpgradedAtMs)) {
    return cdata.planUpgradedAtMs;
  }
  return null;
}

/**
 * Paid → higher paid: purane SKU par snapshot + Advance downgrade lock (product rule).
 * `oldPlanStartedAtMs` = jis waqt user **oldPlanId** par aaya (`planUpgradedAt` pre-upgrade) — frozen Usage usi ramp se; warna legacy trailing-year.
 */
export function buildMergedFrozenStateAfterPaidUpgrade(args: {
  existingLedgerRaw: unknown;
  existingBlockedRaw: unknown;
  nowMs: number;
  oldPlanId: PlanId;
  oldExpiryMs: number | null;
  oldYearly: number;
  /** Firestore `planUpgradedAt` (tier switch) millis — chhoda hua tier par kitna NPR “use” hua. */
  oldPlanStartedAtMs: number | null;
  targetPlanId: PlanId;
}): { billingFrozenUsageLedger: BillingFrozenPlanSnapshot[]; billingBlockedDowngradePlanIds: string[] } | null {
  const kind = classifyPlanChange(args.oldPlanId, args.targetPlanId);
  if (kind !== "upgrade" || args.oldPlanId === "basic") return null;

  const remainingMs =
    args.oldExpiryMs != null && Number.isFinite(args.oldExpiryMs)
      ? Math.max(0, args.oldExpiryMs - args.nowMs)
      : 0;
  const renewLedger = renewColumnFrozenUsageAndCreditDaysLeft({
    nowMs: args.nowMs,
    currentExpiryMs: args.oldExpiryMs,
    planYearly: args.oldYearly,
    remainingMs,
  });
  const frozenUsageNpr =
    args.oldPlanStartedAtMs != null && Number.isFinite(args.oldPlanStartedAtMs)
      ? usageNprAccruedSinceCurrentTierStart({
          nowMs: args.nowMs,
          planUpgradedAtMs: args.oldPlanStartedAtMs,
          planYearly: args.oldYearly,
        })
      : renewLedger.frozenUsageNpr;
  const { creditDaysLeft } = renewLedger;
  const remainingValueNpr = (remainingMs / MS_YEAR) * args.oldYearly;
  const frozenCreditNpr = Math.round(Math.min(args.oldYearly, Math.max(0, remainingValueNpr)) * 100) / 100;

  const withoutOld = parseBillingFrozenPlanLedger(args.existingLedgerRaw).filter(
    (e) => normalizePlanIdForClient(e.planId) !== args.oldPlanId
  );
  const snap: BillingFrozenPlanSnapshot = {
    planId: args.oldPlanId,
    frozenUsageNpr,
    frozenCreditDaysLeft: creditDaysLeft,
    frozenCreditNpr,
    frozenAtMs: args.nowMs,
  };
  const billingFrozenUsageLedger = [...withoutOld, snap];

  const blocked = parseBillingDowngradeBlockedPlanIds(args.existingBlockedRaw);
  const billingBlockedDowngradePlanIds =
    args.oldPlanId === "advance"
      ? [...new Set([...blocked, "advance"])]
      : [...new Set(blocked)];

  return { billingFrozenUsageLedger, billingBlockedDowngradePlanIds };
}

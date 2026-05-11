import type { PlanId } from "@/config/plans";
import { planTierIndex } from "@/config/plans";

/** Keys for billing dropdowns (monthly … multi-year). */
export type SubscriptionTermKey =
  | "monthly"
  | "quarter"
  | "half_year"
  | "year_1"
  | "year_2"
  | "year_3"
  | "year_4"
  | "year_5"
  | "year_6"
  | "year_7"
  | "year_8"
  | "year_9"
  | "year_10"
  /** Paid → paid, **charge 0**: upar tier par bachi value → nayi yearly/daily rate par din; neeche/barabar tier par calendar end same (`BILLING_TERM_OPTIONS` me nahi). */
  | "plan_change_only";

export const BILLING_TERM_OPTIONS: { value: SubscriptionTermKey; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "half_year", label: "Half year" },
  { value: "year_1", label: "1 year" },
  { value: "year_2", label: "2 years" },
  { value: "year_3", label: "3 years" },
  { value: "year_4", label: "4 years" },
  { value: "year_5", label: "5 years" },
  { value: "year_6", label: "6 years" },
  { value: "year_7", label: "7 years" },
  { value: "year_8", label: "8 years" },
  { value: "year_9", label: "9 years" },
  { value: "year_10", label: "10 years" },
];

/** Billing upgrade dropdown — `BILLING_TERM_OPTIONS` me nahi taaki `/api/payments/initiate` recurring is term ko na le. */
export const PLAN_CHANGE_ONLY_SELECT_OPTION = {
  value: "plan_change_only" as const,
  label: "Just change plan",
};

const MS_DAY = 86400000;
/** One “year” for proration (365d). */
const MS_YEAR = 365 * MS_DAY;

export function termDurationMs(term: SubscriptionTermKey): number {
  if (term === "plan_change_only") return 0;
  if (term === "monthly") return 30 * MS_DAY;
  if (term === "quarter") return 91 * MS_DAY;
  if (term === "half_year") return 182 * MS_DAY;
  const m = /^year_(\d+)$/.exec(term);
  const n = m ? Math.min(10, Math.max(1, parseInt(m[1], 10))) : 1;
  return n * 365 * MS_DAY;
}

/** Gross NPR for this term using yearly/ monthly list prices (before credit). */
export function grossPriceNpr(term: SubscriptionTermKey, monthly: number, yearly: number): number {
  if (term === "plan_change_only") return 0;
  if (term === "monthly") return monthly;
  if (term === "quarter") return Math.round((yearly / 4) * 100) / 100;
  if (term === "half_year") return Math.round((yearly / 2) * 100) / 100;
  const m = /^year_(\d+)$/.exec(term);
  const n = m ? Math.min(10, Math.max(1, parseInt(m[1], 10))) : 1;
  return Math.round(yearly * n * 100) / 100;
}

export type PlanChangeKind = "upgrade" | "renew" | "same_tier" | "downgrade";

export function classifyPlanChange(currentPlanId: PlanId | undefined, targetPlanId: PlanId): PlanChangeKind {
  const a = planTierIndex(currentPlanId);
  const b = planTierIndex(targetPlanId);
  if (b > a) return "upgrade";
  if (b === a) return "renew";
  if (b < a) return "downgrade";
  return "same_tier";
}

/** Upgrade/renew: credit unused time at current yearly rate; net = gross - credit (min 0). */
export function quotePaidPlanPurchase(args: {
  nowMs: number;
  currentExpiryMs: number | null;
  currentYearly: number;
  targetMonthly: number;
  targetYearly: number;
  term: SubscriptionTermKey;
}): { grossNpr: number; creditNpr: number; netNpr: number; newExpiryMs: number } {
  // “Just change plan”: **charge 0** — naya paid term add nahi.
  if (args.term === "plan_change_only") {
    const prevExp = args.currentExpiryMs ?? args.nowMs;
    const remainingMs = Math.max(0, prevExp - args.nowMs);
    const goingToHigherPaidTier =
      args.targetYearly > args.currentYearly && args.currentYearly > 0 && args.targetYearly > 0;

    let newExpiryMs: number;
    if (goingToHigherPaidTier && remainingMs > 0) {
      // Upar plan: value → target daily rate; **floor mat** — poore din par snap karke 2–4 din ghatak sakta tha; ms round se zyada fair.
      const valueNpr = (remainingMs / MS_YEAR) * args.currentYearly;
      const dailyTarget = args.targetYearly / 365;
      const equivDaysPrecise = dailyTarget > 0 ? valueNpr / dailyTarget : 0;
      newExpiryMs = Math.round(args.nowMs + Math.max(0, equivDaysPrecise) * MS_DAY);
    } else {
      // Neeche paid tier: client/server ab `plan-change-checkout` se reject — sirf `/api/company/downgrade-plan`.
      // Yahan renew/same-tier zero-net branches ke liye calendar same rehta hai.
      newExpiryMs = Math.max(args.nowMs, prevExp);
    }

    return {
      grossNpr: 0,
      creditNpr: 0,
      netNpr: 0,
      newExpiryMs,
    };
  }

  const grossNpr = grossPriceNpr(args.term, args.targetMonthly, args.targetYearly);
  const prevExp = args.currentExpiryMs ?? args.nowMs;
  const remainingMs = Math.max(0, prevExp - args.nowMs);
  const creditNpr = Math.min(grossNpr, (remainingMs / MS_YEAR) * args.currentYearly);
  const netNpr = Math.max(0, Math.round((grossNpr - creditNpr) * 100) / 100);
  const newExpiryMs = Math.max(args.nowMs, prevExp) + termDurationMs(args.term);
  return { grossNpr, creditNpr, netNpr, newExpiryMs };
}

/** Downgrade: convert remaining value into time at target plan’s yearly rate (expiry **ms** rounded — poora din floor se loss avoid). */
export function quoteDowngradeNewExpiry(args: {
  nowMs: number;
  currentExpiryMs: number | null;
  currentYearly: number;
  targetYearly: number;
}): { newExpiryMs: number | null; extraDays: number } {
  if (args.targetYearly <= 0) {
    return { newExpiryMs: null, extraDays: 0 };
  }
  const prevExp = args.currentExpiryMs ?? args.nowMs;
  const remainingMs = Math.max(0, prevExp - args.nowMs);
  if (remainingMs <= 0) {
    return { newExpiryMs: args.nowMs, extraDays: 0 };
  }
  const valueNpr = (remainingMs / MS_YEAR) * args.currentYearly;
  const dailyTarget = args.targetYearly / 365;
  if (dailyTarget <= 0) {
    return { newExpiryMs: args.nowMs, extraDays: 0 };
  }
  const equivDaysPrecise = valueNpr / dailyTarget;
  const newExpiryMs = Math.round(args.nowMs + Math.max(0, equivDaysPrecise) * MS_DAY);
  // UI / history: fractional din — expiry ms hi source of truth (`daysLeftRounded` alag jagah).
  const extraDays = Math.max(0, (newExpiryMs - args.nowMs) / MS_DAY);
  return { newExpiryMs, extraDays };
}

export function daysLeftRounded(nowMs: number, expiryMs: number | null): number {
  if (expiryMs == null || !Number.isFinite(expiryMs)) return 0;
  return Math.max(0, Math.round((expiryMs - nowMs) / MS_DAY));
}

/**
 * Upgrade UI — **Used** pill: expiry se chipka hua **365d window** me se kitna hissa beet chuka, sab **current (lower) plan ki yearly** par.
 * Upper tier ka list price yahan nahi — user ne jo kam yearly pay ki thi usi par “used” NPR.
 */
export function usedNprTrailingYearAtCurrentPlan(args: {
  remainingMs: number;
  currentYearly: number;
}): { usedNpr: number; usedMs: number } {
  const rem = Math.max(0, args.remainingMs);
  const cappedRem = Math.min(rem, MS_YEAR);
  const usedMs = Math.max(0, MS_YEAR - cappedRem);
  const usedNpr =
    args.currentYearly > 0
      ? Math.round(((usedMs / MS_YEAR) * args.currentYearly) * 100) / 100
      : 0;
  return { usedNpr, usedMs };
}

/** Carried credit NPR → chune hue plan ki **list yearly** par kitne din (upgrade pink pill). */
export function creditDaysEquivalentAtTargetYearly(creditNpr: number, targetYearly: number): number {
  if (targetYearly <= 0 || creditNpr <= 0) return 0;
  return (creditNpr / targetYearly) * 365;
}

/**
 * **Renew column** (active tier): jo NPR is plan par “use” ho chuka = freeze (`usedNprTrailingYearAtCurrentPlan`);
 * Credit “days left” = calendar − usi tier par usage ke din-equivalent — Advance→Pro→Pro+ ladder par har step yahi rule.
 */
export function renewColumnFrozenUsageAndCreditDaysLeft(args: {
  nowMs: number;
  currentExpiryMs: number | null;
  planYearly: number;
  remainingMs: number;
}): { frozenUsageNpr: number; creditDaysLeft: number } {
  const { usedNpr } = usedNprTrailingYearAtCurrentPlan({
    remainingMs: args.remainingMs,
    currentYearly: args.planYearly,
  });
  const creditDaysLeft = creditPillDaysLeftNetAdjusted({
    nowMs: args.nowMs,
    currentExpiryMs: args.currentExpiryMs,
    netNpr: usedNpr,
    targetYearly: args.planYearly,
  });
  return { frozenUsageNpr: usedNpr, creditDaysLeft };
}

/**
 * Paid tier par aate hi (Just change plan / upgrade) Usage **0** — neeche wale tier par usage freeze.
 * Yahan: `planUpgradedAt` se ab tak ke **calendar din** × (yearly/365) NPR; din ke sath badhta hai.
 */
export function usageNprAccruedSinceCurrentTierStart(args: {
  nowMs: number;
  planUpgradedAtMs: number | null;
  planYearly: number;
}): number {
  if (args.planYearly <= 0) return 0;
  if (args.planUpgradedAtMs == null || !Number.isFinite(args.planUpgradedAtMs)) return 0;
  const elapsed = Math.max(0, args.nowMs - args.planUpgradedAtMs);
  const daily = args.planYearly / 365;
  const npr = (elapsed / MS_DAY) * daily;
  return Math.min(args.planYearly, Math.round(npr * 100) / 100);
}

/** **Upgrade target column**: carried credit ke din — `creditDaysEquivalentAtTargetYearly` ka alias (intent clear). */
export function upgradeTargetCreditDaysCarried(creditNpr: number, targetYearly: number): number {
  return creditDaysEquivalentAtTargetYearly(creditNpr, targetYearly);
}

/**
 * Profile dropdown: `round` kabhi 364 chhod deta jab ~364.5+ din bache hon — **ceil** se poora din count.
 * Sirf tab jab `expiryMs > nowMs`; warna `0` (caller `expired` check kare).
 */
export function daysLeftProfileCeil(nowMs: number, expiryMs: number | null): number {
  if (expiryMs == null || !Number.isFinite(expiryMs)) return 0;
  const raw = (expiryMs - nowMs) / MS_DAY;
  if (raw <= 0) return 0;
  return Math.ceil(raw);
}

/** Expiry − now in fractional calendar days — rounded integer se zyada precise. */
export function daysLeftPrecise(nowMs: number, expiryMs: number | null): number {
  if (expiryMs == null || !Number.isFinite(expiryMs)) return 0;
  return Math.max(0, (expiryMs - nowMs) / MS_DAY);
}

/**
 * Usage pill `≈ X days` — net NPR ko target yearly par map (`formatUsageLineSuffix` jaisa base).
 * Credit pill isi ko calendar remaining se subtract karke "balance" din dikhata hai.
 */
export function netNprAsYearlyEquivalentDays(netNpr: number, targetYearly: number): number {
  if (targetYearly <= 0 || netNpr <= 0) return 0;
  return (netNpr / targetYearly) * 365;
}

/**
 * Credit pill: **rounded** calendar days (`daysLeftRounded`) − Usage pill jaisa net din-equivalent.
 * Isse `≈ 0.04 days` + Credit `364.96` = **365** jaisa sum tally (precise ms se fractional gap avoid).
 */
export function creditPillDaysLeftNetAdjusted(args: {
  nowMs: number;
  currentExpiryMs: number | null;
  netNpr: number;
  targetYearly: number;
}): number {
  const roundedCal = daysLeftRounded(args.nowMs, args.currentExpiryMs);
  const netEq = netNprAsYearlyEquivalentDays(args.netNpr, args.targetYearly);
  return Math.max(0, roundedCal - netEq);
}

/**
 * Profile Credit pill: **`daysLeftProfileCeil`** − `netNprAsYearlyEquivalentDays` — billing table alag (`creditPillDaysLeftNetAdjusted` round use karta hai).
 * Example: ceil 365 − usage ≈ 0.06 din → **364.94** days left (Usage line ke saath live tally).
 */
export function creditPillDaysLeftProfileNetAdjusted(args: {
  nowMs: number;
  currentExpiryMs: number | null;
  netNpr: number;
  targetYearly: number;
}): number {
  const ceilCal = daysLeftProfileCeil(args.nowMs, args.currentExpiryMs);
  const netEq = netNprAsYearlyEquivalentDays(args.netNpr, args.targetYearly);
  return Math.max(0, ceilCal - netEq);
}

/**
 * Upgrade UI: chhote plan par jo din/value bacha hai, uska NPR target plan ki daily rate par kitne din ke barabar —
 * "same money shifts into bigger tier" explain karne ke liye (`quotePaidPlanPurchase` credit isi value par).
 */
export function equivalentDaysOnTargetFromRemainingValue(args: {
  nowMs: number;
  currentExpiryMs: number | null;
  currentYearly: number;
  targetYearly: number;
}): number {
  if (args.targetYearly <= 0) return 0;
  const prevExp = args.currentExpiryMs ?? args.nowMs;
  const remainingMs = Math.max(0, prevExp - args.nowMs);
  if (remainingMs <= 0) return 0;
  const valueNpr = (remainingMs / MS_YEAR) * args.currentYearly;
  const dailyTarget = args.targetYearly / 365;
  if (dailyTarget <= 0) return 0;
  const newExpiryMs = Math.round(args.nowMs + (valueNpr / dailyTarget) * MS_DAY);
  return Math.max(0, (newExpiryMs - args.nowMs) / MS_DAY);
}

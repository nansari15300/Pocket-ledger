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
  | "year_10";

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

const MS_DAY = 86400000;
/** One “year” for proration (365d). */
const MS_YEAR = 365 * MS_DAY;

export function termDurationMs(term: SubscriptionTermKey): number {
  if (term === "monthly") return 30 * MS_DAY;
  if (term === "quarter") return 91 * MS_DAY;
  if (term === "half_year") return 182 * MS_DAY;
  const m = /^year_(\d+)$/.exec(term);
  const n = m ? Math.min(10, Math.max(1, parseInt(m[1], 10))) : 1;
  return n * 365 * MS_DAY;
}

/** Gross NPR for this term using yearly/ monthly list prices (before credit). */
export function grossPriceNpr(term: SubscriptionTermKey, monthly: number, yearly: number): number {
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
  const grossNpr = grossPriceNpr(args.term, args.targetMonthly, args.targetYearly);
  const prevExp = args.currentExpiryMs ?? args.nowMs;
  const remainingMs = Math.max(0, prevExp - args.nowMs);
  const creditNpr = Math.min(grossNpr, (remainingMs / MS_YEAR) * args.currentYearly);
  const netNpr = Math.max(0, Math.round((grossNpr - creditNpr) * 100) / 100);
  const newExpiryMs = Math.max(args.nowMs, prevExp) + termDurationMs(args.term);
  return { grossNpr, creditNpr, netNpr, newExpiryMs };
}

/** Downgrade: convert remaining value into days at target plan’s yearly rate. */
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
  const extraDays = Math.max(0, Math.floor(valueNpr / dailyTarget));
  const newExpiryMs = args.nowMs + extraDays * MS_DAY;
  return { newExpiryMs, extraDays };
}

export function daysLeftRounded(nowMs: number, expiryMs: number | null): number {
  if (expiryMs == null || !Number.isFinite(expiryMs)) return 0;
  return Math.max(0, Math.round((expiryMs - nowMs) / MS_DAY));
}

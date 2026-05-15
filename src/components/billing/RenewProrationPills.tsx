"use client";

import type { Plan } from "@/config/plans";
import {
  PROFILE_PRORATION_PILL_CREDIT_CLASS,
  PROFILE_PRORATION_PILL_USAGE_CLASS,
  creditPillAdjustedDayWord,
  formatCreditPillDaysLeftDisplay,
  formatUsageLineSuffixProfile,
} from "@/lib/billingProrationPillDisplay";
import {
  creditDaysEquivalentAtTargetYearly,
  quotePaidPlanPurchase,
  renewColumnFrozenUsageAndCreditDaysLeft,
  type SubscriptionTermKey,
} from "@/lib/subscriptionPlanMath";
import { cn } from "@/lib/utils";

type RenewProrationPillsProps = {
  /** Live catalog row — selected company plan (billing renew column jaisa). */
  plan: Plan;
  /** Billing `expiryMs`: null agar expiry unknown. */
  currentExpiryMs: number | null;
  /** Profile me fixed 1-year renew quote; billing table user term change se alag. */
  term?: SubscriptionTermKey;
  className?: string;
};

/**
 * Profile renew: billing table jaisa — **Usage** = isi tier par freeze; pink pill = **Balance** (bacha NPR + din left).
 */
export function RenewProrationPills({
  plan,
  currentExpiryMs,
  term = "year_1",
  className,
}: RenewProrationPillsProps) {
  if (plan.isFree) return null;

  const nowMs = Date.now();
  const q = quotePaidPlanPurchase({
    nowMs,
    currentExpiryMs,
    currentYearly: plan.price.yearly,
    targetMonthly: plan.price.monthly,
    targetYearly: plan.price.yearly,
    term,
  });
  const remainingMs =
    currentExpiryMs != null && Number.isFinite(currentExpiryMs) ? Math.max(0, currentExpiryMs - nowMs) : 0;
  const ledger = renewColumnFrozenUsageAndCreditDaysLeft({
    nowMs,
    currentExpiryMs,
    planYearly: plan.price.yearly,
    remainingMs,
  });
  // Balance रु = `q.creditNpr` (internal name) — din isi se map; `ledger.creditDaysLeft` alag accounting tha.
  const creditDaysFromQuote = creditDaysEquivalentAtTargetYearly(q.creditNpr, plan.price.yearly);

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-[5px]", className)}>
      <div className={PROFILE_PRORATION_PILL_CREDIT_CLASS}>
        <span>
          Balance ≈ रु {q.creditNpr.toFixed(2)} · {formatCreditPillDaysLeftDisplay(creditDaysFromQuote)}{" "}
          {creditPillAdjustedDayWord(creditDaysFromQuote)} left
        </span>
      </div>
      <div className={PROFILE_PRORATION_PILL_USAGE_CLASS}>
        <span>
          Usage: रु {ledger.frozenUsageNpr.toFixed(2)}
          {formatUsageLineSuffixProfile(ledger.frozenUsageNpr, plan.price.yearly, q.grossNpr)}
        </span>
      </div>
    </div>
  );
}

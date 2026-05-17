"use client";

import type { Plan } from "@/config/plans";
import {
  computeYearlySaveAmount,
  convertPlanGrossForCountry,
  formatRegionalMoney,
  type BillingPricingSettings,
} from "@/lib/billingRegionalPricing";
import type { FxRatesSnapshot } from "@/lib/liveFxRates";
import { cn } from "@/lib/utils";

export type PlanPricingLine = "monthly" | "yearly" | "save";

type PlanPricingLineCellProps = {
  plan: Plan;
  country: string;
  fx: FxRatesSnapshot | null;
  pricingSettings: BillingPricingSettings;
  line: PlanPricingLine;
  className?: string;
};

/** Ek row: sirf monthly, yearly, ya save — billing table ke 3 price rows. */
export function PlanPricingLineCell({
  plan,
  country,
  fx,
  pricingSettings,
  line,
  className,
}: PlanPricingLineCellProps) {
  const monthly = convertPlanGrossForCountry(plan, "monthly", country, fx, pricingSettings);
  // `SubscriptionTermKey` — 1-year gross = `year_1` (legacy `"yearly"` nahi)
  const yearly = convertPlanGrossForCountry(plan, "year_1", country, fx, pricingSettings);
  const saveAmt = computeYearlySaveAmount(monthly.amount, yearly.amount);

  const monthlyStr =
    monthly.amount > 0
      ? formatRegionalMoney(monthly.amount, monthly.symbol, monthly.currency)
      : "—";
  const yearlyStr =
    yearly.amount > 0
      ? formatRegionalMoney(yearly.amount, yearly.symbol, yearly.currency)
      : "—";
  const saveStr =
    saveAmt > 0
      ? `Save ${formatRegionalMoney(saveAmt, monthly.symbol, monthly.currency)}`
      : "—";

  if (plan.isFree) {
    if (line === "monthly") {
      return (
        <span className={cn("font-semibold tabular-nums line-through decoration-2 text-muted-foreground", className)}>
          {monthlyStr}
        </span>
      );
    }
    if (line === "yearly") {
      return (
        <span className={cn("font-semibold tabular-nums line-through decoration-2 text-muted-foreground", className)}>
          {yearlyStr}
        </span>
      );
    }
    return <span className={cn("text-xl font-bold text-primary", className)}>Free</span>;
  }

  if (line === "monthly") {
    return <span className={cn("font-semibold tabular-nums", className)}>{monthlyStr}</span>;
  }
  if (line === "yearly") {
    return <span className={cn("font-semibold tabular-nums", className)}>{yearlyStr}</span>;
  }
  return (
    <span className={cn("font-semibold tabular-nums text-green-700 dark:text-green-500", className)}>
      {saveStr}
    </span>
  );
}

/** Mobile: teen lines ek saath */
export function PlanPricingBreakdown({
  plan,
  country,
  fx,
  pricingSettings,
  align = "left",
}: {
  plan: Plan;
  country: string;
  fx: FxRatesSnapshot | null;
  pricingSettings: BillingPricingSettings;
  align?: "left" | "center";
}) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  return (
    <div className={cn("space-y-1 text-sm", alignClass)}>
      <p>
        <span className="text-muted-foreground">Monthly: </span>
        <PlanPricingLineCell plan={plan} country={country} fx={fx} pricingSettings={pricingSettings} line="monthly" />
      </p>
      <p>
        <span className="text-muted-foreground">Yearly: </span>
        <PlanPricingLineCell plan={plan} country={country} fx={fx} pricingSettings={pricingSettings} line="yearly" />
      </p>
      <p>
        <PlanPricingLineCell plan={plan} country={country} fx={fx} pricingSettings={pricingSettings} line="save" />
      </p>
    </div>
  );
}

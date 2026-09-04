"use client";

import { cn } from "@/lib/utils";
import { financialSummaryRowClass } from "./financialSummaryCardStyles";

type FinancialSummaryAmountRowProps = {
  label: string;
  amount: number;
  formatAmount: (n: number) => string;
  className?: string;
  labelClassName?: string;
  amountClassName?: string;
  /** Skip render when amount is zero (default true). */
  hideZero?: boolean;
};

export function FinancialSummaryAmountRow({
  label,
  amount,
  formatAmount,
  className,
  labelClassName,
  amountClassName,
  hideZero = true,
}: FinancialSummaryAmountRowProps) {
  if (hideZero && Math.abs(amount) <= 0.005) return null;

  return (
    <div className={cn(financialSummaryRowClass, className)}>
      <span className={labelClassName}>{label}</span>
      <span className={cn("tabular-nums", amountClassName)}>{formatAmount(amount)}</span>
    </div>
  );
}

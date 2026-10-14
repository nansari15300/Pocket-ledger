"use client";

import { cn } from "@/lib/utils";
import { SALE_PURCHASE_TOTALS_SUMMARY_AMOUNT } from "@/lib/salePurchaseDiscountDefault";

type Props = {
  value: number;
  className?: string;
  /** TDS row — amount se pehle minus (deduction). */
  tdsDeduction?: boolean;
};

export function SalePurchaseTotalsSummaryAmount({ value, className, tdsDeduction }: Props) {
  const n = Number(value) || 0;
  const text = n.toFixed(2);
  const display = tdsDeduction ? `−${text}` : text;
  return (
    <span className={cn(SALE_PURCHASE_TOTALS_SUMMARY_AMOUNT, className)} title={display}>
      {tdsDeduction ? <span className="mr-px">−</span> : null}
      {text}
    </span>
  );
}

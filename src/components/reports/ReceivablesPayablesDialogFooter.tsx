"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RpDialogBalance = {
  amount: number;
  side: "receivable" | "payable" | "equal";
};

type ReceivablesPayablesDialogFooterProps = {
  receivableSum: number;
  payableSum: number;
  balance: RpDialogBalance;
  formatAmount: (amount: number) => ReactNode;
};

/** R/P dialog: totals + balance — dialog ke neeche fixed, scroll se alag (PC / mobile / Capacitor). */
export function ReceivablesPayablesDialogFooter({
  receivableSum,
  payableSum,
  balance,
  formatAmount,
}: ReceivablesPayablesDialogFooterProps) {
  return (
    <div
      className={cn(
        "shrink-0 border-t bg-background px-2 sm:px-4 py-2 space-y-2",
        "shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.45)]",
        "z-10"
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="p-2 border rounded-lg font-bold flex justify-between bg-emerald-50/90 dark:bg-emerald-950/35">
          <span>Total Receivable</span>
          <span className="text-green-700 dark:text-green-400 tabular-nums">{formatAmount(receivableSum)}</span>
        </div>
        <div className="p-2 border rounded-lg font-bold flex justify-between bg-emerald-50/90 dark:bg-emerald-950/35">
          <span>Total Payable</span>
          <span className="text-red-600 dark:text-red-400 tabular-nums">{formatAmount(payableSum)}</span>
        </div>
      </div>
      {balance.side !== "equal" && balance.amount > 0 && (
        <div className="rounded-lg border border-border bg-gradient-to-br from-green-50/90 via-muted/40 to-red-50/90 dark:from-green-950/35 dark:via-background dark:to-red-950/35 p-3 shadow-sm">
          {balance.side === "receivable" && (
            <div className="flex w-full flex-wrap items-baseline justify-start gap-x-2 gap-y-0">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
              <span className="text-base font-bold text-green-600 dark:text-green-400 tabular-nums">
                {formatAmount(balance.amount)} <span className="text-xs font-normal">Dr</span>
              </span>
            </div>
          )}
          {balance.side === "payable" && (
            <div className="flex w-full flex-wrap items-baseline justify-end gap-x-2 gap-y-0">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
              <span className="text-base font-bold text-red-600 dark:text-red-400 tabular-nums">
                {formatAmount(balance.amount)} <span className="text-xs font-normal">Cr</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

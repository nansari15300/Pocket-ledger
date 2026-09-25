"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { RP_DIALOG_DIM_GREEN_BORDER } from "@/components/reports/ReceivablesPayablesDialogEntityList";

export type RpDialogBalance = {
  amount: number;
  side: "receivable" | "payable" | "equal";
};

type ReceivablesPayablesDialogFooterProps = {
  receivableSum: number;
  payableSum: number;
  balance: RpDialogBalance;
  formatAmount: (amount: number) => ReactNode;
  /** Same flag as the dialog. Passed so the one-row footer matches mobile view immediately. */
  isMobile?: boolean;
};

const FOOTER_SHELL = cn(
  "shrink-0 border-t bg-background px-2 sm:px-4 py-2",
  "shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.45)]",
  "z-10"
);

const MOBILE_FOOTER_SHELL = "shrink-0 w-full pt-0 pb-0 z-20";

function MobileFooterTotalsCard({
  receivableSum,
  payableSum,
  balance,
  formatAmount,
  balanceIsDr,
  balanceIsCr,
  showBalanceSuffix,
}: {
  receivableSum: number;
  payableSum: number;
  balance: RpDialogBalance;
  formatAmount: (amount: number) => ReactNode;
  balanceIsDr: boolean;
  balanceIsCr: boolean;
  showBalanceSuffix: boolean;
}) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-3 divide-x divide-emerald-200/80 dark:divide-emerald-800/50 rounded-none rounded-b-lg rounded-t-none bg-emerald-50/90 dark:bg-emerald-950/35 border-t border-x-0 border-b-0 overflow-hidden",
        RP_DIALOG_DIM_GREEN_BORDER
      )}
    >
      <MobileFooterStat label="Receivable">
        <span className="text-green-700 dark:text-green-400">{formatAmount(receivableSum)}</span>
      </MobileFooterStat>
      <MobileFooterStat label="Payable">
        <span className="text-red-600 dark:text-red-400">{formatAmount(payableSum)}</span>
      </MobileFooterStat>
      <MobileFooterStat label="Balance">
        <span
          className={cn(
            balanceIsDr && "text-green-600 dark:text-green-400",
            balanceIsCr && "text-red-600 dark:text-red-400",
            !balanceIsDr && !balanceIsCr && "text-foreground"
          )}
        >
          {formatAmount(showBalanceSuffix ? balance.amount : 0)}
          {showBalanceSuffix ? (
            <span className="text-[10px] font-normal"> {balanceIsDr ? "Dr" : "Cr"}</span>
          ) : null}
        </span>
      </MobileFooterStat>
    </div>
  );
}

function MobileFooterStat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 px-1 py-1.5 text-center">
      <div className="text-[11px] font-semibold text-muted-foreground leading-none">
        {label}
      </div>
      <div className="mt-1 text-[11px] font-bold leading-tight tabular-nums [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

/** R/P dialog: totals + balance — dialog ke neeche fixed, scroll se alag (PC / mobile / Capacitor). */
export function ReceivablesPayablesDialogFooter({
  receivableSum,
  payableSum,
  balance,
  formatAmount,
  isMobile: isMobileProp,
}: ReceivablesPayablesDialogFooterProps) {
  const detectedMobile = useIsMobile();
  const isMobile = isMobileProp ?? detectedMobile;
  const balanceIsDr = balance.side === "receivable";
  const balanceIsCr = balance.side === "payable";
  const showBalanceSuffix = balance.side !== "equal" && balance.amount > 0;

  if (isMobile) {
    return (
      <div className={MOBILE_FOOTER_SHELL}>
        <MobileFooterTotalsCard
          receivableSum={receivableSum}
          payableSum={payableSum}
          balance={balance}
          formatAmount={formatAmount}
          balanceIsDr={balanceIsDr}
          balanceIsCr={balanceIsCr}
          showBalanceSuffix={showBalanceSuffix}
        />
      </div>
    );
  }

  return (
    <div className={cn(FOOTER_SHELL, "space-y-2")}>
      <div className="grid grid-cols-2 gap-2">
        <div
          className={cn(
            "p-2 rounded-lg font-bold flex justify-between bg-emerald-50/90 dark:bg-emerald-950/35",
            RP_DIALOG_DIM_GREEN_BORDER
          )}
        >
          <span>Total Receivable</span>
          <span className="text-green-700 dark:text-green-400 tabular-nums">{formatAmount(receivableSum)}</span>
        </div>
        <div
          className={cn(
            "p-2 rounded-lg font-bold flex justify-between bg-emerald-50/90 dark:bg-emerald-950/35",
            RP_DIALOG_DIM_GREEN_BORDER
          )}
        >
          <span>Total Payable</span>
          <span className="text-red-600 dark:text-red-400 tabular-nums">{formatAmount(payableSum)}</span>
        </div>
      </div>
      {balance.side !== "equal" && balance.amount > 0 && (
        <div
          className={cn(
            "rounded-lg bg-gradient-to-br from-green-50/90 via-muted/40 to-red-50/90 dark:from-green-950/35 dark:via-background dark:to-red-950/35 p-3 shadow-sm",
            RP_DIALOG_DIM_GREEN_BORDER
          )}
        >
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

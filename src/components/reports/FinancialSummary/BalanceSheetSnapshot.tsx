"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDate } from "@/hooks/useDate";
import type { FinancialSummary } from "@/lib/reports/financialSummary";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { FinancialSummaryAmountRow } from "./FinancialSummaryAmountRow";
import {
  financialSummaryCardClass,
  financialSummaryCardProps,
  financialSummarySectionTitleClass,
  financialSummaryTotalRowClass,
} from "./financialSummaryCardStyles";

type BalanceSheetSnapshotProps = {
  assets: FinancialSummary["assets"];
  liabilities: FinancialSummary["liabilities"];
  equity: FinancialSummary["equity"];
  isBalanced: boolean;
  balanceDifference: number;
};

export function BalanceSheetSnapshot({
  assets,
  liabilities,
  equity,
  isBalanced,
  balanceDifference,
}: BalanceSheetSnapshotProps) {
  const { formatCurrencyForPrint } = useDate();
  const fmt = (n: number): string => formatCurrencyForPrint(n, { noSuffix: true });
  const totalLiabEquity = liabilities.total + equity.total;

  const equationStrip = (() => {
    if (isBalanced) {
      return {
        tone: "green" as const,
        label: "Assets = Liabilities + Equity — Balanced",
        icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
      };
    }
    const isPlus = balanceDifference > 0;
    const sign = isPlus ? "+" : "−";
    return {
      tone: isPlus ? ("green" as const) : ("red" as const),
      label: `Assets = Liabilities + Equity — Difference: ${sign}${fmt(Math.abs(balanceDifference))}`,
      icon: isPlus ? (
        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      ),
    };
  })();

  return (
    <Card className={financialSummaryCardClass} {...financialSummaryCardProps}>
      <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base uppercase tracking-wide">Balance Sheet Snapshot</CardTitle>
        <div
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium leading-snug",
            equationStrip.tone === "green"
              ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
              : "bg-red-100 text-red-900 ring-1 ring-red-200"
          )}
        >
          {equationStrip.icon}
          <span className="truncate sm:whitespace-normal">{equationStrip.label}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className={cn(financialSummarySectionTitleClass, "text-emerald-700 mb-0")}>Assets</h3>
            <FinancialSummaryAmountRow label="Cash & Bank" amount={assets.cashAndBank} formatAmount={fmt} />
            <FinancialSummaryAmountRow label="Receivables" amount={assets.receivables} formatAmount={fmt} />
            <FinancialSummaryAmountRow label="Inventory" amount={assets.inventory} formatAmount={fmt} />
            <FinancialSummaryAmountRow label="Other Assets" amount={assets.other} formatAmount={fmt} />
            <div className={financialSummaryTotalRowClass}>
              <span>Total Assets</span>
              <span className="tabular-nums text-emerald-600">{fmt(assets.total)}</span>
            </div>
          </div>
          <div>
            <h3 className={cn(financialSummarySectionTitleClass, "text-red-700 mb-0")}>
              Liabilities &amp; Equity
            </h3>
            <FinancialSummaryAmountRow label="Payables" amount={liabilities.payables} formatAmount={fmt} />
            <FinancialSummaryAmountRow label="Loans" amount={liabilities.loans} formatAmount={fmt} />
            <FinancialSummaryAmountRow
              label="Other Liabilities"
              amount={liabilities.other}
              formatAmount={fmt}
            />
            <FinancialSummaryAmountRow label="Capital" amount={equity.capital} formatAmount={fmt} />
            <FinancialSummaryAmountRow
              label="Retained Earnings"
              amount={equity.retainedEarnings}
              formatAmount={fmt}
            />
            <FinancialSummaryAmountRow label="Current Profit" amount={equity.currentProfit} formatAmount={fmt} />
            <div className={financialSummaryTotalRowClass}>
              <span>Total L + E</span>
              <span className="tabular-nums text-red-600">{fmt(totalLiabEquity)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

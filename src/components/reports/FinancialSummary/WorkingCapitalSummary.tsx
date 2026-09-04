"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDate } from "@/hooks/useDate";
import type { FinancialSummary } from "@/lib/reports/financialSummary";
import { cn } from "@/lib/utils";
import {
  financialSummaryCardClass,
  financialSummaryCardProps,
  financialSummaryRowClass,
  financialSummaryTotalRowClass,
} from "./financialSummaryCardStyles";

type WorkingCapitalSummaryProps = {
  workingCapital: FinancialSummary["workingCapital"];
};

export function WorkingCapitalSummary({ workingCapital }: WorkingCapitalSummaryProps) {
  const { formatCurrencyForPrint } = useDate();
  const fmt = (n: number): string => formatCurrencyForPrint(n, { noSuffix: true });

  const rows = [
    { label: "Cash + Bank", value: workingCapital.cashAndBank },
    { label: "Receivables", value: workingCapital.receivables },
    { label: "Inventory", value: workingCapital.inventory },
    { label: "Less: Payables", value: -workingCapital.payables, muted: true },
  ];

  return (
    <Card className={financialSummaryCardClass} {...financialSummaryCardProps}>
      <CardHeader>
        <CardTitle className="text-base uppercase tracking-wide">Working Capital</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.map((row) => (
          <div key={row.label} className={financialSummaryRowClass}>
            <span className={cn(row.muted && "text-muted-foreground")}>{row.label}</span>
            <span className="tabular-nums">{fmt(row.value)}</span>
          </div>
        ))}
        <div className={cn(financialSummaryTotalRowClass, "font-bold border-t-2")}>
          <span>Net Working Capital</span>
          <span
            className={cn(
              "tabular-nums",
              workingCapital.net >= 0 ? "text-emerald-600" : "text-red-600"
            )}
          >
            {fmt(workingCapital.net)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

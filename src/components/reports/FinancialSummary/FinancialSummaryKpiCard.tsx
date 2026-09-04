"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import {
  computePercentChange,
  type PercentChangeResult,
} from "@/lib/reports/financialSummaryPresets";
import { financialSummaryCardClass, financialSummaryCardProps } from "./financialSummaryCardStyles";

export type FinancialSummaryKpiCardProps = {
  title: string;
  value: number;
  previousValue?: number;
  icon?: React.ReactNode;
  format?: "currency" | "number" | "percentage";
  /** When true, a rise is good (revenue). When false, a rise is bad (payables). */
  riseIsPositive?: boolean;
  loading?: boolean;
  className?: string;
};

function formatPercentChange(result: PercentChangeResult): string {
  if (result.kind === "none") return "—";
  if (result.kind === "new") return "New";
  const sign = result.value >= 0 ? "+" : "";
  return `${sign}${result.value.toFixed(1)}%`;
}

function ChangeIndicator({
  result,
  riseIsPositive,
}: {
  result: PercentChangeResult;
  riseIsPositive: boolean;
}) {
  if (result.kind === "none") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  if (result.kind === "new") {
    return <span className="text-xs font-medium text-emerald-600">New</span>;
  }

  const rising = result.value >= 0;
  const positiveTone = riseIsPositive ? rising : !rising;
  const Icon = rising ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        positiveTone ? "text-emerald-600" : "text-red-600"
      )}
    >
      <Icon className="h-3 w-3" />
      {formatPercentChange(result)} vs previous period
    </span>
  );
}

export function FinancialSummaryKpiCard({
  title,
  value,
  previousValue,
  icon,
  format = "currency",
  riseIsPositive = true,
  loading = false,
  className,
}: FinancialSummaryKpiCardProps) {
  const { formatCurrency } = useDate();
  const change = computePercentChange(value, previousValue);

  const displayValue =
    format === "currency"
      ? formatCurrency(value, { noSuffix: true })
      : format === "percentage"
        ? `${value.toFixed(1)}%`
        : String(value);

  if (loading) {
    return (
      <Card className={cn(financialSummaryCardClass, className)} {...financialSummaryCardProps}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-28" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(financialSummaryCardClass, className)} {...financialSummaryCardProps}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold tabular-nums">{displayValue}</div>
        {previousValue !== undefined ? (
          <ChangeIndicator result={change} riseIsPositive={riseIsPositive} />
        ) : null}
      </CardContent>
    </Card>
  );
}

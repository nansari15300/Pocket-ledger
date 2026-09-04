"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDate } from "@/hooks/useDate";
import type { FinancialSummaryPlRow } from "@/lib/reports/financialSummary";
import { cn } from "@/lib/utils";
import {
  financialSummaryCardClass,
  financialSummaryCardProps,
  financialSummaryRowClass,
  financialSummarySectionTitleClass,
  financialSummaryTotalRowClass,
} from "./financialSummaryCardStyles";

type ProfitLossSummaryProps = {
  incomeRows: FinancialSummaryPlRow[];
  expenseRows: FinancialSummaryPlRow[];
  revenue: number;
  directCost: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;
  financeCost: number;
  netProfit: number;
};

function PlAccordionRow({
  row,
  formatAmount,
  expandedGroups,
  toggleGroup,
  depth = 0,
}: {
  row: FinancialSummaryPlRow;
  formatAmount: (n: number) => string;
  expandedGroups: Set<string>;
  toggleGroup: (id: string) => void;
  depth?: number;
}) {
  const isExpanded = expandedGroups.has(row.id);
  const hasChildren = row.isGroup && row.subRows.length > 0;
  const paddingLeft = 8 + depth * 14;

  return (
    <>
      <div
        className={cn(
          financialSummaryRowClass,
          row.isGroup ? "font-semibold cursor-pointer select-none" : "font-normal"
        )}
        style={{ paddingLeft }}
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={hasChildren ? () => toggleGroup(row.id) : undefined}
        onKeyDown={
          hasChildren
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleGroup(row.id);
                }
              }
            : undefined
        }
      >
        <span className="flex min-w-0 items-center gap-1.5 pr-2">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="inline-block w-3.5 shrink-0" />
          )}
          <span className="truncate">{row.name}</span>
        </span>
        <span className="tabular-nums shrink-0">{formatAmount(row.amount)}</span>
      </div>
      {hasChildren && isExpanded
        ? row.subRows.map((sub) => (
            <PlAccordionRow
              key={sub.id}
              row={sub}
              formatAmount={formatAmount}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              depth={depth + 1}
            />
          ))
        : null}
    </>
  );
}

function PlBranchColumn({
  title,
  total,
  rows,
  tone,
  expandedGroups,
  toggleGroup,
  formatAmount,
}: {
  title: string;
  total: number;
  rows: FinancialSummaryPlRow[];
  tone: "income" | "expense";
  expandedGroups: Set<string>;
  toggleGroup: (id: string) => void;
  formatAmount: (n: number) => string;
}) {
  const visibleRows = rows.filter((row) => Math.abs(row.amount) > 0.005 || row.subRows.length > 0);

  return (
    <div className="min-w-0">
      <h3
        className={cn(
          financialSummarySectionTitleClass,
          tone === "income" ? "text-emerald-700" : "text-red-700"
        )}
      >
        {title}
      </h3>
      <div className={cn(financialSummaryRowClass, "font-semibold bg-emerald-50/30")}>
        <span>Total {title}</span>
        <span className={cn("tabular-nums", tone === "income" ? "text-emerald-600" : "text-red-600")}>
          {formatAmount(total)}
        </span>
      </div>
      {visibleRows.length === 0 ? (
        <div className={cn(financialSummaryRowClass, "text-muted-foreground text-xs italic")}>
          No {title.toLowerCase()} in this period
        </div>
      ) : (
        visibleRows.map((row) => (
          <PlAccordionRow
            key={row.id}
            row={row}
            formatAmount={formatAmount}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
          />
        ))
      )}
    </div>
  );
}

export function ProfitLossSummary({
  incomeRows,
  expenseRows,
  revenue,
  directCost,
  grossProfit,
  operatingExpenses,
  operatingProfit,
  financeCost,
  netProfit,
}: ProfitLossSummaryProps) {
  const { formatCurrencyForPrint } = useDate();
  const fmt = (n: number): string => formatCurrencyForPrint(n, { noSuffix: true });
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() => new Set());

  const toggleGroup = React.useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const totalExpense = round2(directCost + operatingExpenses + financeCost);

  return (
    <Card className={financialSummaryCardClass} {...financialSummaryCardProps}>
      <CardHeader>
        <CardTitle className="text-base uppercase tracking-wide">Profit &amp; Loss Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn(financialSummaryRowClass, "font-bold text-sm")}>
          <span>Revenue</span>
          <span className="tabular-nums">{fmt(revenue)}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <PlBranchColumn
            title="Income"
            total={revenue}
            rows={incomeRows}
            tone="income"
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            formatAmount={fmt}
          />
          <PlBranchColumn
            title="Expenses"
            total={totalExpense}
            rows={expenseRows}
            tone="expense"
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            formatAmount={fmt}
          />
        </div>

        <div className={financialSummaryRowClass}>
          <span>Direct Cost / COGS</span>
          <span className="tabular-nums">{fmt(directCost)}</span>
        </div>
        <div className={financialSummaryTotalRowClass}>
          <span>Gross Profit</span>
          <span className="tabular-nums">{fmt(grossProfit)}</span>
        </div>
        <div className={financialSummaryRowClass}>
          <span>Operating Expenses</span>
          <span className="tabular-nums">{fmt(operatingExpenses)}</span>
        </div>
        <div className={financialSummaryRowClass}>
          <span>Operating Profit</span>
          <span className="tabular-nums">{fmt(operatingProfit)}</span>
        </div>
        <div className={financialSummaryRowClass}>
          <span>Finance Cost</span>
          <span className="tabular-nums">{fmt(financeCost)}</span>
        </div>
        <div className={cn(financialSummaryTotalRowClass, "font-bold border-t-2")}>
          <span>Net Profit</span>
          <span className={cn("tabular-nums", netProfit >= 0 ? "text-emerald-600" : "text-red-600")}>
            {fmt(netProfit)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

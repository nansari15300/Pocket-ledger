"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BalanceSheetCheckEngineInput } from "@/lib/reports/balanceSheetCheckEngine";
import {
  buildBalanceSheetClosingAccountRows,
  closingAccountGrandTotals,
  filterClosingAccountRows,
  groupClosingAccountRows,
  type ClosingAccountSection,
  type ClosingEntityFilter,
} from "@/lib/reports/balanceSheetClosingAccountRows";

const TRACE_TABLE_CLASS = cn(
  "w-full text-xs sm:text-sm",
  "[&_tr]:!border-b-[1px] [&_tr]:!border-t-0 [&_tr]:border-black",
  "[&_thead_tr]:!border-b-[1px] [&_thead_tr]:border-black",
  "[&_tbody_tr:last-child]:!border-b-[1px]"
);
const TRACE_TABLE_ROW_CLASS = "!border-b-[1px] !border-t-0 border-black";
const TRACE_AMOUNT_CLASS = "tabular-nums whitespace-nowrap text-right";
const TRACE_TOTAL_ROW_CLASS = cn(
  "font-bold bg-[var(--bs-diff-trace-total-orange)]",
  TRACE_TABLE_ROW_CLASS
);

function amountOrDash(amount: number, formatAmount: (n: number) => string): string {
  return amount >= 0.005 ? formatAmount(amount) : "—";
}

function signedRunningText(amount: number, formatAmount: (n: number) => string): string {
  if (Math.abs(amount) < 0.005) return "—";
  const suffix = amount > 0 ? " Dr" : " Cr";
  return `${formatAmount(Math.abs(amount))}${suffix}`;
}

export type OtherDifferentClosingAccountsTableProps = {
  checkEngineInput: BalanceSheetCheckEngineInput;
  formatAmount: (n: number) => string;
  liveRevision: number;
  entityFilter?: ClosingEntityFilter;
  /** Full-page panel — no max-height on scroll area */
  fullPage?: boolean;
};

export function OtherDifferentClosingAccountsTable({
  checkEngineInput,
  formatAmount,
  liveRevision,
  entityFilter = "all",
  fullPage = false,
}: OtherDifferentClosingAccountsTableProps) {
  const allRows = useMemo(
    () => buildBalanceSheetClosingAccountRows(checkEngineInput),
    [checkEngineInput, liveRevision]
  );
  const rows = useMemo(
    () => filterClosingAccountRows(allRows, entityFilter),
    [allRows, entityFilter]
  );
  const groups = useMemo(() => groupClosingAccountRows(rows), [rows]);
  const totals = useMemo(() => closingAccountGrandTotals(rows), [rows]);

  const [expandedSections, setExpandedSections] = useState<Set<ClosingAccountSection>>(new Set());

  const toggleSection = (section: ClosingAccountSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-black bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
        No accounts with non-zero closing balance.
      </div>
    );
  }

  return (
    <div
      data-bs-diff-closing-accounts=""
      className="rounded-md border border-black bg-orange-50/20 overflow-hidden"
    >
      <div className="border-b-[1px] border-black bg-[var(--bs-diff-trace-header-blue)] px-3 py-2">
        <p className="text-sm font-semibold">
          {entityFilter === "all"
            ? `All closing accounts (${totals.count})`
            : `${totals.count} account${totals.count === 1 ? "" : "s"}`}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Dr / Cr closing columns — running balance = cumulative Dr − Cr down the filtered list.
        </p>
      </div>

      <div className="px-3 py-2 border-b-[1px] border-black grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] sm:text-xs">
        <div>
          <p className="text-muted-foreground">Total Dr</p>
          <p className="tabular-nums font-semibold">{formatAmount(totals.totalDr)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Total Cr</p>
          <p className="tabular-nums font-semibold">{formatAmount(totals.totalCr)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Net (Dr − Cr)</p>
          <p className="tabular-nums font-semibold">
            {signedRunningText(totals.finalRunning, formatAmount)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Sections</p>
          <p className="font-medium">{groups.length}</p>
        </div>
      </div>

      <div
        className={cn(
          "overflow-y-auto overflow-x-hidden scrollbar-slim-dim",
          fullPage ? "max-h-none" : "max-h-[min(52vh,28rem)]"
        )}
      >
        {groups.map((group) => {
          const expanded = expandedSections.has(group.section);
          return (
            <section key={group.section} className="border-b-[1px] border-black last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs sm:text-sm font-semibold hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-expanded={expanded}
                onClick={() => toggleSection(group.section)}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <span className="text-[11px] font-normal text-muted-foreground tabular-nums shrink-0">
                  {group.rows.length} acct · Dr {formatAmount(group.totalDr)} · Cr{" "}
                  {formatAmount(group.totalCr)}
                </span>
              </button>

              {expanded ? (
                <Table className={TRACE_TABLE_CLASS}>
                  <TableHeader>
                    <TableRow className={TRACE_TABLE_ROW_CLASS}>
                      <TableHead>Account</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead className="text-right min-w-[5.5rem]">Dr balance</TableHead>
                      <TableHead className="text-right min-w-[5.5rem]">Cr balance</TableHead>
                      <TableHead className="text-right min-w-[6.5rem]">Running balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={`${row.section}-${row.accountId}`} className={TRACE_TABLE_ROW_CLASS}>
                        <TableCell className="align-top font-medium">{row.accountName}</TableCell>
                        <TableCell className="align-top text-[11px] text-muted-foreground">
                          {row.group}
                        </TableCell>
                        <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-green-800")}>
                          {amountOrDash(row.dr, formatAmount)}
                        </TableCell>
                        <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-red-700")}>
                          {amountOrDash(row.cr, formatAmount)}
                        </TableCell>
                        <TableCell className={cn(TRACE_AMOUNT_CLASS, "font-medium")}>
                          {signedRunningText(row.runningBalance, formatAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className={TRACE_TOTAL_ROW_CLASS}>
                      <TableCell colSpan={2} className="py-1.5">
                        {group.label} subtotal
                      </TableCell>
                      <TableCell className={cn(TRACE_AMOUNT_CLASS, "py-1.5")}>
                        {formatAmount(group.totalDr)}
                      </TableCell>
                      <TableCell className={cn(TRACE_AMOUNT_CLASS, "py-1.5")}>
                        {formatAmount(group.totalCr)}
                      </TableCell>
                      <TableCell className={cn(TRACE_AMOUNT_CLASS, "py-1.5")}>
                        {signedRunningText(round2(group.totalDr - group.totalCr), formatAmount)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="border-t-[1px] border-black bg-[var(--bs-diff-trace-total-orange)] px-3 py-2 grid grid-cols-[1fr_1fr_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(6.5rem,auto)] gap-2 text-xs sm:text-sm font-bold">
        <span className="col-span-2">Grand total ({totals.count} accounts)</span>
        <span className={cn(TRACE_AMOUNT_CLASS)}>{formatAmount(totals.totalDr)}</span>
        <span className={cn(TRACE_AMOUNT_CLASS)}>{formatAmount(totals.totalCr)}</span>
        <span className={cn(TRACE_AMOUNT_CLASS)}>
          {signedRunningText(totals.finalRunning, formatAmount)}
        </span>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

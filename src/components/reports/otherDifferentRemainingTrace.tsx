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
import { Button } from "@/components/ui/button";
import type { BalanceSheetDiffTraceMainView } from "@/components/reports/opening_trace";
import type { BalanceSheetDifferenceBreakdown } from "@/lib/reports/balanceSheetDifferenceAnalysis";
import type {
  BalanceSheetCheckEngineInput,
  BalanceSheetCheckEngineReport,
} from "@/lib/reports/balanceSheetCheckEngine";
import {
  OtherDifferentRemainingExplanationPanel,
  type RemainingExplanationActions,
} from "@/components/reports/otherDifferentRemainingExplanationPanel";
import { OtherDifferentClosingAccountsPanel } from "@/components/reports/otherDifferentClosingAccountsPanel";

const TRACE_TABLE_CLASS = cn(
  "w-full text-xs sm:text-sm",
  "[&_tr]:!border-b-[1px] [&_tr]:!border-t-0 [&_tr]:border-black",
  "[&_thead_tr]:!border-b-[1px] [&_thead_tr]:border-black",
  "[&_tbody_tr:last-child]:!border-b-[1px]"
);
const TRACE_TABLE_ROW_CLASS = "!border-b-[1px] !border-t-0 border-black";
const TRACE_SECTION_CLASS =
  "rounded-md border border-black bg-orange-50/30 dark:bg-orange-950/20 overflow-hidden";
const TRACE_SECTION_TITLE_CLASS =
  "px-3 py-2 text-sm font-semibold text-orange-950 dark:text-orange-100 border-b-[1px] border-black bg-[var(--bs-diff-trace-header-blue)]";
const TRACE_AMOUNT_CLASS = "tabular-nums whitespace-nowrap text-right";
const TRACE_TOTAL_ROW_CLASS = cn(
  "font-bold bg-[var(--bs-diff-trace-total-orange)]",
  TRACE_TABLE_ROW_CLASS
);
const TRACE_HIGHLIGHT_ROW_CLASS = "font-semibold bg-orange-100/60 dark:bg-orange-900/30";
const OPENING_EXCLUDED_SOURCE = "Opening excluded from Balance Sheet";

function signedAmountText(amount: number, formatAmount: (n: number) => string): string {
  if (Math.abs(amount) < 0.005) return "—";
  return `${amount < 0 ? "−" : ""}${formatAmount(Math.abs(amount))}`;
}

function effectLabel(amount: number): string {
  if (Math.abs(amount) < 0.005) return "—";
  if (amount > 0) return "Adds to gap";
  if (amount < 0) return "Reduces gap";
  return "—";
}

export type OtherDifferentRemainingTraceProps = {
  mainView: BalanceSheetDiffTraceMainView;
  breakdown: BalanceSheetDifferenceBreakdown;
  checkReport: BalanceSheetCheckEngineReport;
  checkEngineInput: BalanceSheetCheckEngineInput;
  openingIsBalanced: boolean;
  formatAmount: (n: number) => string;
  explanationActions: RemainingExplanationActions;
  liveRevision: number;
  reportRunAtMs: number;
};

export function OtherDifferentRemainingTrace({
  mainView,
  breakdown,
  checkReport,
  checkEngineInput,
  openingIsBalanced,
  formatAmount,
  explanationActions,
  liveRevision,
  reportRunAtMs,
}: OtherDifferentRemainingTraceProps) {
  const [openingExcludedExpanded, setOpeningExcludedExpanded] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [closingAccountsOpen, setClosingAccountsOpen] = useState(false);
  const remainingLabel = formatAmount(breakdown.remainingAfterOpening);

  const openingExcludedLines = useMemo(
    () => checkReport.checks.find((check) => check.id === "opening_excluded")?.lines ?? [],
    [checkReport.checks]
  );

  const waterfallRows = useMemo(() => {
    const rows: Array<{
      step: string;
      source: string;
      note?: string;
      effect: number;
      running: number;
      isTotal?: boolean;
    }> = [];

    rows.push({
      step: "1",
      source: "Total Balance Sheet difference (Assets − Liab − Equity − P/L)",
      note: checkReport.equation.difference >= 0 ? "Assets side heavier" : "Liab + Equity + P/L heavier",
      effect: breakdown.totalDifference,
      running: breakdown.totalDifference,
    });

    if (!openingIsBalanced && breakdown.openingDifference >= 0.01) {
      rows.push({
        step: "2",
        source: "Opening mismatch (master Dr − Cr)",
        note: "Explained in Opening trace tab — subtract from total",
        effect: -breakdown.openingDifference,
        running: breakdown.remainingAfterOpening,
      });
    }

    rows.push({
      step: openingIsBalanced ? "2" : "3",
      source: "Remaining after opening (this tab target)",
      note: "Total difference − opening mismatch",
      effect: breakdown.remainingAfterOpening,
      running: breakdown.remainingAfterOpening,
      isTotal: true,
    });

    return rows;
  }, [breakdown, checkReport.equation.difference, openingIsBalanced]);

  const causeLines = breakdown.lines.filter((line) => line.kind !== "opening_mismatch");

  const hasUncategorized = breakdown.uncategorizedDetails.length > 0;
  const hasUnhandled = breakdown.unhandledVouchers.length > 0;

  if (breakdown.remainingAfterOpening < 0.01) {
    return (
      <div
        data-bs-diff-trace-main-view={mainView}
        className="flex min-h-0 flex-1 flex-col overflow-hidden p-4"
      >
        <p className="text-sm text-muted-foreground">
          No remaining difference after opening — Balance Sheet gap is fully explained by opening
          mismatch. Check the <span className="font-medium">Opening trace</span> tab.
        </p>
      </div>
    );
  }

  return (
    <div
      data-bs-diff-trace-main-view={mainView}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {explainOpen ? (
        <OtherDifferentRemainingExplanationPanel
          checkEngineInput={checkEngineInput}
          checkReport={checkReport}
          formatAmount={formatAmount}
          actions={explanationActions}
          onClose={() => setExplainOpen(false)}
          liveRevision={liveRevision}
          reportRunAtMs={reportRunAtMs}
        />
      ) : closingAccountsOpen ? (
        <OtherDifferentClosingAccountsPanel
          checkEngineInput={checkEngineInput}
          formatAmount={formatAmount}
          onClose={() => setClosingAccountsOpen(false)}
          liveRevision={liveRevision}
          reportRunAtMs={reportRunAtMs}
        />
      ) : (
        <>
          <div className="shrink-0 border-b-[1px] border-black px-3 py-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
            Trace where{" "}
            <span className="font-semibold tabular-nums text-red-700">{remainingLabel}</span> comes
            from — same logic as Balance Sheet check: total difference minus opening, then split by
            source.
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-slim-dim p-3 space-y-4">
        <section className={TRACE_SECTION_CLASS}>
          <h3 className={TRACE_SECTION_TITLE_CLASS}>
            Step 1 — How we get {remainingLabel}
          </h3>
          <Table className={TRACE_TABLE_CLASS}>
            <TableHeader>
              <TableRow className={TRACE_TABLE_ROW_CLASS}>
                <TableHead className="w-8 px-2">#</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right min-w-[7rem]">Effect</TableHead>
                <TableHead className="text-right min-w-[7rem]">Running gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waterfallRows.map((row) => (
                <TableRow
                  key={row.step + row.source}
                  className={cn(row.isTotal ? TRACE_HIGHLIGHT_ROW_CLASS : undefined, TRACE_TABLE_ROW_CLASS)}
                >
                  <TableCell className="px-2 text-muted-foreground">{row.step}</TableCell>
                  <TableCell className="align-top">
                    <span className="font-medium">{row.source}</span>
                    {row.note ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {row.note}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={cn(
                      TRACE_AMOUNT_CLASS,
                      row.isTotal ? "text-red-700 font-bold" : row.effect < 0 ? "text-green-700" : "text-red-700"
                    )}
                  >
                    {row.isTotal
                      ? formatAmount(row.effect)
                      : signedAmountText(row.effect, formatAmount)}
                  </TableCell>
                  <TableCell className={cn(TRACE_AMOUNT_CLASS, "font-medium text-red-700")}>
                    {formatAmount(row.running)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className={TRACE_SECTION_CLASS}>
          <h3 className={TRACE_SECTION_TITLE_CLASS}>
            Step 2 — Remaining split by ledger / transaction layer
          </h3>
          <Table className={TRACE_TABLE_CLASS}>
            <TableHeader>
              <TableRow className={TRACE_TABLE_ROW_CLASS}>
                <TableHead>Source</TableHead>
                <TableHead className="text-right min-w-[7rem]">Amount</TableHead>
                <TableHead className="min-w-[6rem]">Effect on gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkReport.remainingBreakdown.map((row) => {
                const isOpeningExcluded = row.source === OPENING_EXCLUDED_SOURCE;
                const canExpandOpeningExcluded =
                  isOpeningExcluded && openingExcludedLines.length > 0;

                return (
                  <React.Fragment key={row.source}>
                    <TableRow className={TRACE_TABLE_ROW_CLASS}>
                      <TableCell className="align-top">
                        {canExpandOpeningExcluded ? (
                          <button
                            type="button"
                            className="inline-flex w-full items-start gap-1.5 text-left font-normal hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                            aria-expanded={openingExcludedExpanded}
                            onClick={() => setOpeningExcludedExpanded((open) => !open)}
                          >
                            {openingExcludedExpanded ? (
                              <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span>{row.source}</span>
                          </button>
                        ) : (
                          row.source
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          TRACE_AMOUNT_CLASS,
                          row.amount < 0 ? "text-green-700" : row.amount > 0 ? "text-red-700" : ""
                        )}
                      >
                        {signedAmountText(row.amount, formatAmount)}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {effectLabel(row.amount)}
                      </TableCell>
                    </TableRow>
                    {canExpandOpeningExcluded && openingExcludedExpanded
                      ? openingExcludedLines.map((line) => {
                          const amount = line.amount ?? 0;
                          const sideSuffix =
                            line.side ?? (amount > 0 ? "Dr" : amount < 0 ? "Cr" : "");
                          return (
                            <TableRow
                              key={line.label}
                              className={cn("bg-muted/25 hover:bg-muted/35", TRACE_TABLE_ROW_CLASS)}
                            >
                              <TableCell className="py-1.5 pl-9 align-top text-[11px] sm:text-xs">
                                <span className="font-medium text-foreground">{line.label}</span>
                                {line.detail ? (
                                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                                    {line.detail}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  TRACE_AMOUNT_CLASS,
                                  "py-1.5 text-[11px] sm:text-xs",
                                  amount < 0 ? "text-green-700" : amount > 0 ? "text-red-700" : ""
                                )}
                              >
                                {Math.abs(amount) >= 0.005 ? (
                                  <>
                                    {signedAmountText(amount, formatAmount)}
                                    {sideSuffix ? ` ${sideSuffix}` : null}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="py-1.5" />
                            </TableRow>
                          );
                        })
                      : null}
                  </React.Fragment>
                );
              })}
              <TableRow className={TRACE_TOTAL_ROW_CLASS}>
                <TableCell>= Remaining after opening</TableCell>
                <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-red-700")}>
                  {formatAmount(checkReport.remainingTotal)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </section>

        {causeLines.length > 0 ? (
          <section className={TRACE_SECTION_CLASS}>
            <h3 className={TRACE_SECTION_TITLE_CLASS}>
              Step 3 — What to check on Balance Sheet
            </h3>
            <Table className={TRACE_TABLE_CLASS}>
              <TableHeader>
                <TableRow className={TRACE_TABLE_ROW_CLASS}>
                  <TableHead>Check</TableHead>
                  <TableHead className="text-right w-16">Count</TableHead>
                  <TableHead className="text-right min-w-[7rem]">Possible impact</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {causeLines.map((line) => (
                  <TableRow key={line.kind + line.label} className={TRACE_TABLE_ROW_CLASS}>
                    <TableCell className="font-medium align-top">{line.label}</TableCell>
                    <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-muted-foreground")}>
                      {line.count != null && line.count > 0 ? line.count : "—"}
                    </TableCell>
                    <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-red-700 font-semibold")}>
                      {line.amount >= 0.01 ? formatAmount(line.amount) : "—"}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground align-top">
                      {line.detail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {breakdown.residualDifference >= 0.01 ? (
                  <TableRow className={cn(TRACE_HIGHLIGHT_ROW_CLASS, TRACE_TABLE_ROW_CLASS)}>
                    <TableCell colSpan={2}>Still unexplained (residual)</TableCell>
                    <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-red-700 font-bold")}>
                      {formatAmount(breakdown.residualDifference)}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      Review party/bank/staff/tax groups (Asset vs Liability) and P/L match.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </section>
        ) : null}

        {hasUncategorized ? (
          <section className={TRACE_SECTION_CLASS}>
            <h3 className={TRACE_SECTION_TITLE_CLASS}>
              Ledgers excluded from Balance Sheet ({breakdown.uncategorizedDetails.length})
            </h3>
            <Table className={TRACE_TABLE_CLASS}>
              <TableHeader>
                <TableRow className={TRACE_TABLE_ROW_CLASS}>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Closing (signed)</TableHead>
                  <TableHead className="text-right">BS impact if mapped</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.uncategorizedDetails.map((row) => (
                  <TableRow key={row.accountName} className={TRACE_TABLE_ROW_CLASS}>
                    <TableCell>{row.accountName}</TableCell>
                    <TableCell className={TRACE_AMOUNT_CLASS}>
                      {signedAmountText(row.signedBalance, formatAmount)}
                    </TableCell>
                    <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-red-700")}>
                      {signedAmountText(row.estimatedBsImpact, formatAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : null}

        {hasUnhandled ? (
          <section className={TRACE_SECTION_CLASS}>
            <h3 className={TRACE_SECTION_TITLE_CLASS}>
              Voucher types not fully checked ({breakdown.unhandledVouchers.length})
            </h3>
            <Table className={TRACE_TABLE_CLASS}>
              <TableHeader>
                <TableRow className={TRACE_TABLE_ROW_CLASS}>
                  <TableHead>Type</TableHead>
                  <TableHead>Voucher #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.unhandledVouchers.map((row) => (
                  <TableRow key={row.id || row.voucherNumber + row.type} className={TRACE_TABLE_ROW_CLASS}>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{row.voucherNumber || "—"}</TableCell>
                    <TableCell className={TRACE_AMOUNT_CLASS}>
                      {formatAmount(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : null}

        <section className={TRACE_SECTION_CLASS}>
          <h3 className={TRACE_SECTION_TITLE_CLASS}>Balance Sheet equation (reference)</h3>
          <Table className={TRACE_TABLE_CLASS}>
            <TableBody>
              <TableRow className={TRACE_TABLE_ROW_CLASS}>
                <TableCell>Assets</TableCell>
                <TableCell className={TRACE_AMOUNT_CLASS}>
                  {formatAmount(checkReport.equation.assets)}
                </TableCell>
              </TableRow>
              <TableRow className={TRACE_TABLE_ROW_CLASS}>
                <TableCell>Liabilities + Equity + Net Profit</TableCell>
                <TableCell className={TRACE_AMOUNT_CLASS}>
                  {formatAmount(checkReport.equation.totalLiabEquityPlusProfit)}
                </TableCell>
              </TableRow>
              <TableRow className={TRACE_TOTAL_ROW_CLASS}>
                <TableCell>Difference (Assets − other side)</TableCell>
                <TableCell className={cn(TRACE_AMOUNT_CLASS, "text-red-700")}>
                  {signedAmountText(checkReport.equation.difference, formatAmount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
          </div>

          <div className="shrink-0 border-t-[1px] border-black bg-orange-50/50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Human accounting explanation — post-opening only, read-only.
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs font-semibold"
                onClick={() => setClosingAccountsOpen(true)}
              >
                All closing accounts
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-8 text-xs font-semibold"
                onClick={() => setExplainOpen(true)}
              >
                Explain {remainingLabel}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

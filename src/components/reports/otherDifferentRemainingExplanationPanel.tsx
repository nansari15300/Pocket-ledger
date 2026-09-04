"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BalanceSheetCheckEngineInput } from "@/lib/reports/balanceSheetCheckEngine";
import {
  buildBalanceSheetRemainingExplanation,
  type RemainingExplanationConfidence,
  type RemainingExplanationFinding,
  type RemainingExplanationReport,
} from "@/lib/reports/balanceSheetRemainingExplanation";
import type { BalanceSheetCheckEngineReport } from "@/lib/reports/balanceSheetCheckEngine";

const TRACE_TABLE_CLASS = cn(
  "w-full text-xs sm:text-sm",
  "[&_tr]:!border-b-[1px] [&_tr]:!border-t-0 [&_tr]:border-black"
);
const TRACE_TABLE_ROW_CLASS = "!border-b-[1px] !border-t-0 border-black";
const TRACE_AMOUNT_CLASS = "tabular-nums whitespace-nowrap text-right";

export type RemainingExplanationActions = {
  onOpenAccount?: (payload: { accountId: string; entityType: string }) => void;
  onOpenVoucher?: (voucherId: string) => void;
  onOpenPl?: () => void;
};

function confidenceLabel(c: RemainingExplanationConfidence): string {
  switch (c) {
    case "confirmed":
      return "Confirmed";
    case "review":
      return "Needs review";
    default:
      return "Normal";
  }
}

function confidenceClass(c: RemainingExplanationConfidence): string {
  switch (c) {
    case "confirmed":
      return "bg-red-100 text-red-800";
    case "review":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function signedAmountText(amount: number, formatAmount: (n: number) => string): string {
  if (Math.abs(amount) < 0.005) return "—";
  return `${amount < 0 ? "−" : ""}${formatAmount(Math.abs(amount))}`;
}

function sideSuffix(signed: number): string {
  if (Math.abs(signed) < 0.005) return "";
  return signed > 0 ? " Dr" : " Cr";
}

function FindingCard({
  finding,
  formatAmount,
  actions,
}: {
  finding: RemainingExplanationFinding;
  formatAmount: (n: number) => string;
  actions: RemainingExplanationActions;
}) {
  const [vouchersOpen, setVouchersOpen] = useState(false);

  return (
    <article
      className={cn(
        "rounded-md border p-3 space-y-2",
        finding.confidence === "confirmed"
          ? "border-red-200 bg-red-50/30"
          : finding.confidence === "review"
            ? "border-amber-200 bg-amber-50/30"
            : "border-black/15 bg-white/80"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{finding.title}</p>
          {finding.accountName ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Account: <span className="font-medium text-foreground">{finding.accountName}</span>
              {finding.currentGroup ? ` · ${finding.currentGroup}` : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide",
              confidenceClass(finding.confidence)
            )}
          >
            {confidenceLabel(finding.confidence)}
          </span>
          {Math.abs(finding.gapContribution) >= 0.01 ? (
            <span className="text-xs tabular-nums font-semibold text-red-700">
              Gap: {signedAmountText(finding.gapContribution, formatAmount)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded border border-black/10 bg-white/70 px-2.5 py-2 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
        {finding.teacherExplanation}
      </div>

      {finding.movementNote ? (
        <p className="text-[11px] text-blue-900 bg-blue-50/60 border border-blue-100 rounded px-2 py-1.5 leading-relaxed">
          {finding.movementNote}
        </p>
      ) : null}

      {(finding.opening != null ||
        finding.debit != null ||
        finding.credit != null ||
        finding.closing != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] sm:text-xs">
          {finding.opening != null && Math.abs(finding.opening) >= 0.005 ? (
            <div>
              <p className="text-muted-foreground">Opening</p>
              <p className="tabular-nums font-medium">
                {formatAmount(Math.abs(finding.opening))}
                {sideSuffix(finding.opening)}
              </p>
            </div>
          ) : null}
          {finding.debit != null && finding.debit >= 0.005 ? (
            <div>
              <p className="text-muted-foreground">Total Debit</p>
              <p className="tabular-nums font-medium">{formatAmount(finding.debit)}</p>
            </div>
          ) : null}
          {finding.credit != null && finding.credit >= 0.005 ? (
            <div>
              <p className="text-muted-foreground">Total Credit</p>
              <p className="tabular-nums font-medium">{formatAmount(finding.credit)}</p>
            </div>
          ) : null}
          {finding.closing != null && Math.abs(finding.closing) >= 0.005 ? (
            <div>
              <p className="text-muted-foreground">Closing</p>
              <p className="tabular-nums font-medium">
                {formatAmount(Math.abs(finding.closing))}
                {sideSuffix(finding.closing)}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {finding.debit != null && finding.credit != null && finding.opening != null && finding.closing != null ? (
        <p className="text-[11px] text-muted-foreground">
          Closing = Opening + Debit − Credit
        </p>
      ) : null}

      {finding.vouchers.length > 0 ? (
        <div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            onClick={() => setVouchersOpen((o) => !o)}
          >
            {vouchersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            What happened? ({finding.vouchers.length} voucher{finding.vouchers.length === 1 ? "" : "s"})
          </button>
          {vouchersOpen ? (
            <Table className={cn(TRACE_TABLE_CLASS, "mt-2")}>
              <TableHeader>
                <TableRow className={TRACE_TABLE_ROW_CLASS}>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Dr</TableHead>
                  <TableHead className="text-right">Cr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finding.vouchers.map((v) => (
                  <TableRow key={v.voucherId || v.voucherNumber + v.dateLabel} className={TRACE_TABLE_ROW_CLASS}>
                    <TableCell>{v.dateLabel}</TableCell>
                    <TableCell>
                      {v.voucherId && actions.onOpenVoucher ? (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => actions.onOpenVoucher?.(v.voucherId)}
                        >
                          {v.voucherNumber || v.type || "Open"}
                        </button>
                      ) : (
                        v.voucherNumber || v.type || "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate" title={v.description}>
                      {v.description}
                    </TableCell>
                    <TableCell className={TRACE_AMOUNT_CLASS}>
                      {v.debit >= 0.005 ? formatAmount(v.debit) : "—"}
                    </TableCell>
                    <TableCell className={TRACE_AMOUNT_CLASS}>
                      {v.credit >= 0.005 ? formatAmount(v.credit) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {finding.accountId && finding.entityType && actions.onOpenAccount ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() =>
              actions.onOpenAccount?.({
                accountId: finding.accountId!,
                entityType: finding.entityType!,
              })
            }
          >
            Open Account
          </Button>
        ) : null}
        {finding.category === "pl_mismatch" && actions.onOpenPl ? (
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={actions.onOpenPl}>
            Open P&L
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function SummaryBlock({
  report,
  formatAmount,
}: {
  report: RemainingExplanationReport;
  formatAmount: (n: number) => string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-md border border-black bg-orange-50/40 p-3 space-y-2">
        <p className="text-sm font-semibold text-orange-950">Remaining difference</p>
        <p className="text-2xl tabular-nums font-bold text-red-700">
          {formatAmount(report.remainingDifference)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Opening mismatch is ignored here — this explains only what remains after opening.
        </p>
      </div>
      <div className="rounded-md border border-black p-3 space-y-2">
        <p className="text-sm font-semibold">Explained (engine layers)</p>
        <Table className={TRACE_TABLE_CLASS}>
          <TableBody>
            {report.layerSummary.map((line) => (
              <TableRow key={line.id} className={TRACE_TABLE_ROW_CLASS}>
                <TableCell className="py-1.5">{line.label}</TableCell>
                <TableCell
                  className={cn(
                    TRACE_AMOUNT_CLASS,
                    "py-1.5",
                    line.amount < 0 ? "text-green-700" : line.amount > 0 ? "text-red-700" : ""
                  )}
                >
                  {signedAmountText(line.amount, formatAmount)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className={cn(TRACE_TABLE_ROW_CLASS, "font-bold bg-[var(--bs-diff-trace-total-orange)]")}>
              <TableCell className="py-1.5">Total explained</TableCell>
              <TableCell className={cn(TRACE_AMOUNT_CLASS, "py-1.5 text-red-700")}>
                {formatAmount(report.totalExplained)}
              </TableCell>
            </TableRow>
            {report.stillUnexplained >= 0.01 ? (
              <TableRow className={TRACE_TABLE_ROW_CLASS}>
                <TableCell className="py-1.5">Still unexplained</TableCell>
                <TableCell className={cn(TRACE_AMOUNT_CLASS, "py-1.5 text-red-700 font-semibold")}>
                  {formatAmount(report.stillUnexplained)}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export type OtherDifferentRemainingExplanationPanelProps = {
  checkEngineInput: BalanceSheetCheckEngineInput;
  checkReport: BalanceSheetCheckEngineReport;
  formatAmount: (n: number) => string;
  actions: RemainingExplanationActions;
  onClose: () => void;
  liveRevision: number;
  reportRunAtMs: number;
};

export function OtherDifferentRemainingExplanationPanel({
  checkEngineInput,
  checkReport,
  formatAmount,
  actions,
  onClose,
  liveRevision,
  reportRunAtMs,
}: OtherDifferentRemainingExplanationPanelProps) {
  const report = useMemo(
    () => buildBalanceSheetRemainingExplanation(checkEngineInput, checkReport),
    [checkEngineInput, checkReport, liveRevision]
  );

  const reviewFindings = report.findings.filter((f) => f.confidence !== "normal");
  const normalFindings = report.findings.filter((f) => f.confidence === "normal");

  return (
    <div
      data-bs-diff-remaining-explanation=""
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div className="shrink-0 border-b-[1px] border-black px-3 py-2.5 bg-[var(--bs-diff-trace-header-blue)] flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Why is {formatAmount(report.remainingDifference)} still different?
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Read-only teacher view — Likely / Needs review / Normal. No automatic fixes.
            <span className="ml-1.5 text-green-700 font-medium">Live from SQLite</span>
            {reportRunAtMs > 0 ? (
              <span className="ml-1 tabular-nums">
                · updated {new Date(reportRunAtMs).toLocaleTimeString()}
              </span>
            ) : null}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={onClose}>
          Back to trace tables
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-slim-dim p-3 space-y-4">
        <SummaryBlock report={report} formatAmount={formatAmount} />

        {report.categorySummary.length > 0 ? (
          <div className="rounded-md border border-black p-3">
            <p className="text-sm font-semibold mb-2">Human breakdown</p>
            <Table className={TRACE_TABLE_CLASS}>
              <TableBody>
                {report.categorySummary.map((line) => (
                  <TableRow key={line.id} className={TRACE_TABLE_ROW_CLASS}>
                    <TableCell className="py-1">{line.label}</TableCell>
                    <TableCell className={cn(TRACE_AMOUNT_CLASS, "py-1")}>
                      {signedAmountText(line.amount, formatAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {reviewFindings.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Review & confirmed findings</p>
            <div className="grid gap-2 xl:grid-cols-2">
              {reviewFindings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  formatAmount={formatAmount}
                  actions={actions}
                />
              ))}
            </div>
          </div>
        ) : null}

        {normalFindings.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">
              Normal — no action needed ({normalFindings.length})
            </p>
            <div className="grid gap-2 xl:grid-cols-2">
              {normalFindings.slice(0, 8).map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  formatAmount={formatAmount}
                  actions={actions}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function useRemainingExplanationReport(
  checkEngineInput: BalanceSheetCheckEngineInput,
  checkReport: BalanceSheetCheckEngineReport
) {
  return useMemo(
    () => buildBalanceSheetRemainingExplanation(checkEngineInput, checkReport),
    [checkEngineInput, checkReport]
  );
}

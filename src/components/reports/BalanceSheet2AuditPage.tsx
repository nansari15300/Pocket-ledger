"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { endOfDay } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Scale,
  XCircle,
} from "lucide-react";
import { useVouchers } from "@/hooks/useVouchers";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { MonthYearFilter } from "@/components/dashboard/MonthYearFilter";
import type { DateRange } from "@/components/ui/ad-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  runBalanceSheet2Audit,
  type BalanceSheet2AuditReport,
} from "@/lib/reports/balanceSheet2Audit";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtSigned = (n: number) => {
  if (Math.abs(n) < 0.005) return "—";
  const s = n < 0 ? " Cr" : n > 0 ? " Dr" : "";
  return `${fmt(Math.abs(n))}${s}`;
};

function safeToDate(date: unknown): Date | null {
  if (!date) return null;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  if (typeof date === "object" && date !== null && "toDate" in date) {
    try {
      const d = (date as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  const d = new Date(String(date));
  return Number.isNaN(d.getTime()) ? null : d;
}

function HealthBadge({
  label,
  status,
}: {
  label: string;
  status: "pass" | "warn" | "fail" | "check";
}) {
  const icon =
    status === "pass" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : status === "fail" ? (
      <XCircle className="h-4 w-4 text-red-600" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-amber-600" />
    );
  const text =
    status === "pass" ? "PASS" : status === "fail" ? "FAIL" : status === "check" ? "CHECK" : "DIFF";
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border bg-background px-4 py-3 min-w-[88px]">
      {icon}
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{text}</span>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone = "neutral",
  subtitle,
}: {
  title: string;
  value: string;
  tone?: "neutral" | "good" | "bad" | "warn";
  subtitle?: string;
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "bad"
        ? "border-red-200 bg-red-50/60"
        : tone === "warn"
          ? "border-amber-200 bg-amber-50/60"
          : "border-border bg-muted/20";
  return (
    <Card className={cn("rounded-2xl shadow-sm", toneClass)}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
        {subtitle ? <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="rounded-2xl overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 border-b"
          >
            <div>
              <h2 className="font-semibold text-base">{title}</h2>
              {description ? (
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              ) : null}
            </div>
            {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function AuditTable({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className={compact ? "text-xs" : "text-sm"}>
        {children}
      </Table>
    </div>
  );
}

export function BalanceSheet2AuditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const {
    vouchers,
    loading,
    processedParties,
    processedStaff,
    processedAccounts,
    processedTaxes,
    processedExpenseAccounts,
    processedExpenseGroups,
    processedGroups,
    processedAccountGroups,
    processedTaxGroups,
    processedStaffGroups,
  } = useVouchers();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [report, setReport] = useState<BalanceSheet2AuditReport | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  useEffect(() => {
    const asOfParam = searchParams.get("asOf");
    if (asOfParam) {
      const parsed = safeToDate(asOfParam);
      if (parsed) {
        setDateRange({ from: parsed, to: parsed });
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (companyId) {
      setReport(null);
      setHasRun(false);
    }
  }, [companyId]);

  const asOfDate = useMemo(() => {
    if (!dateRange?.from) return undefined;
    const to = dateRange.to ?? dateRange.from;
    return endOfDay(to);
  }, [dateRange]);

  const auditInput = useMemo(
    () => ({
      processedAccounts,
      processedParties,
      processedStaff,
      processedTaxes,
      processedExpenseAccounts,
      processedExpenseGroups,
      processedGroups,
      processedAccountGroups,
      processedTaxGroups,
      processedStaffGroups,
      vouchers,
      processedTaxesForLedger: processedTaxes,
      asOfDate,
    }),
    [
      processedAccounts,
      processedParties,
      processedStaff,
      processedTaxes,
      processedExpenseAccounts,
      processedExpenseGroups,
      processedGroups,
      processedAccountGroups,
      processedTaxGroups,
      processedStaffGroups,
      vouchers,
      asOfDate,
    ]
  );

  const runAudit = useCallback(() => {
    const result = runBalanceSheet2Audit(auditInput);
    setReport(result);
    setHasRun(true);
  }, [auditInput]);

  const compareWithBalanceSheet = useCallback(() => {
    const qs = asOfDate ? `?asOf=${encodeURIComponent(asOfDate.toISOString())}` : "";
    router.push(`/reports/balance-sheet${qs}`);
  }, [asOfDate, router]);

  const asOfLabel = asOfDate
    ? dateSystem === "BS"
      ? formatDateBS(asOfDate)
      : dateSystem === "Both"
        ? `${formatDate(asOfDate)} / ${formatDateBS(asOfDate)}`
        : formatDate(asOfDate)
    : "All vouchers (no as-of cutoff)";

  const txnDiff = report?.transactionOnlyDifference ?? 0;
  const txnDiffAbs = Math.abs(txnDiff);
  const bsHealth: "pass" | "warn" | "fail" =
    txnDiffAbs < 0.02 ? "pass" : txnDiffAbs >= 1 ? "fail" : "warn";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-20 p-1 w-full h-full overflow-y-auto bg-gradient-to-b from-slate-50 to-background">
      <div className="max-w-[1400px] mx-auto space-y-4 p-2 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-2 -ml-2 text-muted-foreground"
              onClick={() => router.push("/reports/balance-sheet")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Balance Sheet
            </Button>
            <div className="flex items-center gap-2">
              <Scale className="h-7 w-7 text-indigo-600" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Balance Sheet 2</h1>
                <p className="text-sm text-muted-foreground">Transaction Reconciliation Audit</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonthYearFilter dateRange={dateRange} setDateRange={setDateRange} dateSystem={dateSystem} />
            <Button type="button" onClick={runAudit} className="gap-2">
              <Play className="h-4 w-4" />
              Run Audit
            </Button>
            <Button type="button" variant="outline" onClick={compareWithBalanceSheet}>
              Compare with Balance Sheet
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          As of: <span className="font-medium text-foreground">{asOfLabel}</span>
          {" · "}
          Read-only diagnosis — opening balances excluded from transaction-only tests.
        </p>

        {!hasRun ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              Select an as-of date and click <strong>Run Audit</strong> to start independent reconciliation.
            </CardContent>
          </Card>
        ) : report ? (
          <>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <HealthBadge label="Journal" status={report.journalPass ? "pass" : "fail"} />
              <HealthBadge
                label="Account"
                status={report.crossChecks[1]?.pass ? "pass" : "check"}
              />
              <HealthBadge label="P&L" status="pass" />
              <HealthBadge label="BS" status={bsHealth === "pass" ? "pass" : bsHealth === "fail" ? "fail" : "warn"} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <SummaryCard title="Total Assets (txn)" value={fmt(report.transactionOnly.assets)} />
              <SummaryCard title="Total Liabilities (txn)" value={fmt(report.transactionOnly.liabilities)} />
              <SummaryCard title="Total Equity (txn)" value={fmt(report.transactionOnly.equity)} />
              <SummaryCard title="Net Profit (txn)" value={fmt(report.transactionOnly.netProfit)} />
              <SummaryCard
                title="Transaction-only difference"
                value={fmt(txnDiffAbs)}
                tone={txnDiffAbs < 0.02 ? "good" : "bad"}
                subtitle="Assets − (Liab + Equity + P/L), opening excluded"
              />
            </div>

            <Card
              className={cn(
                "rounded-2xl border-2",
                report.explanationStatus === "exactly_explained"
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-amber-300 bg-amber-50/40"
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Why is there a difference?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Full BS difference</p>
                    <p className="text-lg font-bold tabular-nums text-red-700">{fmt(report.totalDifference)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Opening difference (excluded)</p>
                    <p className="text-lg font-bold tabular-nums">{fmt(Math.abs(report.opening.difference))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Transaction / other difference</p>
                    <p className="text-lg font-bold tabular-nums text-orange-700">
                      {fmt(report.transactionOtherDifference)}
                    </p>
                  </div>
                </div>
                <p className="font-medium">{report.explanationMessage}</p>
                <p className="text-xs text-muted-foreground">
                  Identified contribution: {fmt(Math.abs(report.identifiedContribution))} · Unexplained:{" "}
                  {fmt(Math.abs(report.unexplainedContribution))}
                </p>
              </CardContent>
            </Card>

            <Section
              title="Transaction-only Balance Sheet"
              description="Built from voucher movements only — opening balances not included."
            >
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0 divide-y md:divide-y-0 md:divide-x">
                {(
                  [
                    ["Assets", report.transactionOnlySections.assets],
                    ["Liabilities", report.transactionOnlySections.liabilities],
                    ["Equity", report.transactionOnlySections.equity],
                  ] as const
                ).map(([side, rows]) => (
                  <div key={side} className="p-4">
                    <p className="font-semibold text-sm mb-2">{side}</p>
                    <ul className="space-y-1 text-xs max-h-48 overflow-y-auto">
                      {rows.length === 0 ? (
                        <li className="text-muted-foreground">—</li>
                      ) : (
                        rows.map((r) => (
                          <li key={r.accountId} className="flex justify-between gap-2">
                            <span className="truncate">{r.accountName}</span>
                            <span className="tabular-nums shrink-0">{fmtSigned(r.transactionNet)}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
                <div className="p-4 bg-muted/20">
                  <p className="font-semibold text-sm mb-2">P&amp;L</p>
                  <p className="text-sm">
                    Net Profit: <span className="font-bold tabular-nums">{fmt(report.transactionOnly.netProfit)}</span>
                  </p>
                  <div className="mt-4 pt-3 border-t text-xs space-y-1">
                    <p>
                      Assets: <strong>{fmt(report.transactionOnly.assets)}</strong>
                    </p>
                    <p>
                      Liab + Equity + P/L:{" "}
                      <strong>
                        {fmt(
                          report.transactionOnly.liabilities +
                            report.transactionOnly.equity +
                            report.transactionOnly.netProfit
                        )}
                      </strong>
                    </p>
                    <p className={txnDiffAbs >= 0.01 ? "text-red-700 font-semibold" : "text-emerald-700"}>
                      Difference: {fmt(txnDiffAbs)}
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            <Section
              title="Top difference contributors"
              description="Sorted by absolute contribution — largest problems first."
            >
              <AuditTable compact>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead className="text-right">Net txn</TableHead>
                    <TableHead className="text-right">BS amount</TableHead>
                    <TableHead className="text-right">Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.reconciliationRows.slice(0, 25).map((r) => (
                    <TableRow key={r.accountId}>
                      <TableCell className="font-medium max-w-[200px] truncate">{r.accountName}</TableCell>
                      <TableCell>{r.bsClassification}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtSigned(r.netTransaction)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.bsAmount)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-semibold",
                          Math.abs(r.differenceContribution) >= 0.01 ? "text-red-700" : ""
                        )}
                      >
                        {fmtSigned(r.differenceContribution)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </AuditTable>
            </Section>

            <Section title="Where is the difference coming from?" defaultOpen={txnDiffAbs >= 0.01}>
              <AuditTable compact>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Txn balance</TableHead>
                    <TableHead className="text-right">BS contribution</TableHead>
                    <TableHead className="text-right">Difference contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.reconciliationRows
                    .filter((r) => Math.abs(r.differenceContribution) >= 0.01)
                    .slice(0, 40)
                    .map((r, i) => (
                      <TableRow key={r.accountId}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>{r.accountName}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtSigned(r.netTransaction)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.bsAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-red-700">
                          {fmtSigned(r.differenceContribution)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </AuditTable>
              <div className="px-4 py-3 border-t text-sm flex flex-wrap gap-4 bg-muted/20">
                <span>
                  Total identified: <strong>{fmt(Math.abs(report.identifiedContribution))}</strong>
                </span>
                <span>
                  Unexplained: <strong>{fmt(Math.abs(report.unexplainedContribution))}</strong>
                </span>
              </div>
            </Section>

            <Section title="Account reconciliation" description="Per-account transaction movement vs BS classification.">
              <AuditTable compact>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Txn Dr</TableHead>
                    <TableHead className="text-right">Txn Cr</TableHead>
                    <TableHead className="text-right">Txn net</TableHead>
                    <TableHead className="text-right">Full closing</TableHead>
                    <TableHead>BS side</TableHead>
                    <TableHead className="text-right">Diff contrib</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.accountRows.slice(0, 100).map((r) => (
                    <TableRow key={`${r.entityType}-${r.accountId}`}>
                      <TableCell className="max-w-[160px] truncate">{r.accountName}</TableCell>
                      <TableCell>{r.entityType}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{r.groupName}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtSigned(r.openingBalance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.transactionDebit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.transactionCredit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtSigned(r.transactionNet)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtSigned(r.actualFullClosing)}</TableCell>
                      <TableCell>{r.bsSide}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtSigned(r.differenceContribution)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </AuditTable>
              {report.accountRows.length > 100 ? (
                <p className="text-xs text-muted-foreground px-4 py-2">
                  Showing first 100 of {report.accountRows.length} accounts.
                </p>
              ) : null}
            </Section>

            <Section title="Journal audit" description="Balanced vouchers are not flagged as journal errors — classification is reviewed.">
              <AuditTable compact>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Dr</TableHead>
                    <TableHead className="text-right">Cr</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>BS accounts</TableHead>
                    <TableHead>P&amp;L accounts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.journalRows
                    .filter((j) => j.status !== "balanced")
                    .slice(0, 80)
                    .map((j) => (
                      <TableRow key={j.voucherId}>
                        <TableCell>{j.date}</TableCell>
                        <TableCell>{j.voucherNumber || j.voucherId.slice(0, 8)}</TableCell>
                        <TableCell>{j.type}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(j.debitTotal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(j.creditTotal)}</TableCell>
                        <TableCell className="text-xs">{j.statusLabel}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-xs">{j.bsAccounts.join(", ") || "—"}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-xs">{j.plAccounts.join(", ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </AuditTable>
              {report.journalRows.filter((j) => j.status !== "balanced").length === 0 ? (
                <p className="text-sm text-emerald-700 px-4 py-3">All vouchers pass journal balance or need no review.</p>
              ) : null}
            </Section>

            <Section
              title="Opening balance — excluded from transaction test"
              description="Opening balances are excluded from the Transaction-Only Balance Sheet above."
              defaultOpen={Math.abs(report.opening.difference) >= 0.01}
            >
              <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Opening debit</p>
                  <p className="font-bold tabular-nums">{fmt(report.opening.totalDr)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Opening credit</p>
                  <p className="font-bold tabular-nums">{fmt(report.opening.totalCr)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Opening difference</p>
                  <p className="font-bold tabular-nums text-red-700">{fmt(Math.abs(report.opening.difference))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">System opening balance</p>
                  <p className="font-bold tabular-nums">{fmtSigned(report.opening.storedSystemOb)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Expected system OB</p>
                  <p className="font-bold tabular-nums">{fmtSigned(report.opening.expectedSystemOb)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">System OB drift</p>
                  <p className="font-bold tabular-nums">{fmtSigned(report.opening.systemObDrift)}</p>
                </div>
              </div>
            </Section>

            <Collapsible open={technicalOpen} onOpenChange={setTechnicalOpen}>
              <Card className="rounded-2xl">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
                  >
                    <span className="font-semibold">Technical calculation details</span>
                    {technicalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4 pt-0">
                    {report.crossChecks.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          "rounded-lg border p-3 text-sm",
                          c.pass ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"
                        )}
                      >
                        <p className="font-medium">{c.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{c.detail}</p>
                        <p className="tabular-nums mt-1">
                          Left: {fmt(c.left)} · Right: {fmt(c.right)} ·{" "}
                          {c.pass ? "PASS" : "Calculation mismatch detected"}
                        </p>
                      </div>
                    ))}
                    {report.breakdownCategories.length > 0 ? (
                      <AuditTable compact>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Evidence</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.breakdownCategories.map((b) => (
                            <TableRow key={b.category}>
                              <TableCell>{b.category}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(b.amount)}</TableCell>
                              <TableCell>{b.hasEvidence ? "Yes" : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </AuditTable>
                    ) : null}
                    {report.duplicateAccountIds.length > 0 ? (
                      <p className="text-sm text-amber-800">
                        Duplicate BS row IDs: {report.duplicateAccountIds.join(", ")}
                      </p>
                    ) : null}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Card className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/30">
              <CardHeader>
                <CardTitle className="text-base">Transaction-only reconciliation</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 tabular-nums">
                <p>
                  Voucher Dr = {fmt(report.voucherTotalDebit)} · Voucher Cr = {fmt(report.voucherTotalCredit)} ·
                  Journal difference = {fmt(report.voucherDifference)}
                  {report.journalPass ? " · Journal Double Entry: PASS" : ""}
                </p>
                <p>
                  Transaction Assets = {fmt(report.transactionOnly.assets)} · Transaction Liabilities + Equity + Net
                  Profit ={" "}
                  {fmt(
                    report.transactionOnly.liabilities +
                      report.transactionOnly.equity +
                      report.transactionOnly.netProfit
                  )}
                </p>
                <p className="font-bold">
                  Transaction-only BS difference = {fmt(txnDiffAbs)}
                </p>
                <p>
                  Opening difference = {fmt(Math.abs(report.opening.difference))} · Other difference ={" "}
                  {fmt(report.transactionOtherDifference)}
                </p>
                <p
                  className={cn(
                    "font-semibold pt-2",
                    report.explanationStatus === "exactly_explained" ? "text-emerald-700" : "text-amber-800"
                  )}
                >
                  {report.explanationStatus === "exactly_explained"
                    ? "EXACTLY EXPLAINED"
                    : `PARTIALLY EXPLAINED — ${fmt(Math.abs(report.unexplainedContribution))} REMAINS`}
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}

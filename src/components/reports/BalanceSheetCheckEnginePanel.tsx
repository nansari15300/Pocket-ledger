"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
} from "lucide-react";
import {
  runBalanceSheetCheckEngine,
  type BalanceSheetCheckEngineInput,
  type BalanceSheetCheckEngineReport,
  type BalanceSheetCheckItem,
  type BalanceSheetCheckStatus,
} from "@/lib/reports/balanceSheetCheckEngine";
import {
  BalanceSheetCheckHelpInfo,
  BalanceSheetCheckSectionHelp,
} from "@/components/reports/BalanceSheetCheckHelpInfo";
import { getBsCheckHelp } from "@/lib/reports/balanceSheetCheckEngineHelp";
import type {
  BalanceSheetTeacherFinding,
  BalanceSheetHealthItem,
  FindingConfidence,
} from "@/lib/reports/balanceSheetTeacherDiagnostics";

export type BalanceSheetCheckEnginePanelHandle = {
  runAndOpen: () => void;
};

export type BalanceSheetCheckEngineActions = {
  onScrollTo?: (elementId: string) => void;
  onOpenAccount?: (params: { accountId: string; entityType: string }) => void;
  onOpenVoucher?: (voucherId: string) => void;
  onOpenPl?: () => void;
  onCheckOpening?: () => void;
  onReviewAdjustment?: (voucherId: string) => void;
};

type Props = BalanceSheetCheckEngineActions & {
  input: BalanceSheetCheckEngineInput;
  formatCurrency: (amount: number) => string;
};

const STATUS_SORT: Record<BalanceSheetCheckStatus, number> = {
  fail: 0,
  warn: 1,
  info: 2,
  pass: 3,
};

function statusIcon(status: BalanceSheetCheckStatus) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
    case "fail":
      return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-blue-600 shrink-0" />;
  }
}

function severityIcon(severity: BalanceSheetTeacherFinding["severity"]) {
  switch (severity) {
    case "critical":
      return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-blue-600 shrink-0" />;
  }
}

function defaultExpanded(status: BalanceSheetCheckStatus): boolean {
  return status === "fail" || status === "warn";
}

function actionLabel(kind: NonNullable<BalanceSheetTeacherFinding["action"]>["kind"]): string {
  switch (kind) {
    case "openAccount":
      return "Open Account";
    case "openVoucher":
      return "Open Voucher";
    case "openPl":
      return "Open P&L";
    case "scroll":
      return "Go to section";
    case "checkOpening":
      return "Check Opening Accounts";
    case "reviewAdjustment":
      return "Review Adjustment";
    default:
      return "View";
  }
}

function HealthRow({ item }: { item: BalanceSheetHealthItem }) {
  const icon =
    item.status === "pass" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
    ) : item.status === "fail" ? (
      <XCircle className="h-3.5 w-3.5 text-red-600" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
    );
  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      {icon}
      <span>{item.label}</span>
    </div>
  );
}

function confidenceLabel(c: FindingConfidence): string {
  switch (c) {
    case "confirmed":
      return "Confirmed";
    case "review":
      return "Needs review";
    default:
      return "Info";
  }
}

function TeacherFindingCard({
  finding,
  formatCurrency,
  actions,
}: {
  finding: BalanceSheetTeacherFinding;
  formatCurrency: (amount: number) => string;
  actions: BalanceSheetCheckEngineActions;
}) {
  const handleAction = () => {
    const a = finding.action;
    if (!a) return;
    switch (a.kind) {
      case "openAccount":
        if (a.accountId && a.entityType) {
          actions.onOpenAccount?.({ accountId: a.accountId, entityType: a.entityType });
        }
        break;
      case "openVoucher":
        if (a.voucherId) actions.onOpenVoucher?.(a.voucherId);
        break;
      case "openPl":
        actions.onOpenPl?.();
        break;
      case "scroll":
        if (a.scrollTargetId) actions.onScrollTo?.(a.scrollTargetId);
        break;
      case "checkOpening":
        actions.onCheckOpening?.();
        break;
      case "reviewAdjustment":
        if (a.voucherId) actions.onReviewAdjustment?.(a.voucherId);
        break;
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-2",
        finding.severity === "critical"
          ? "border-red-200 bg-red-50/40"
          : finding.severity === "warning"
            ? "border-amber-200 bg-amber-50/40"
            : "border-black/15 bg-white"
      )}
    >
      <div className="flex items-start gap-2">
        {severityIcon(finding.severity)}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm">{finding.title}</p>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide",
                finding.confidence === "confirmed"
                  ? "bg-red-100 text-red-800"
                  : finding.confidence === "review"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-blue-100 text-blue-800"
              )}
            >
              {confidenceLabel(finding.confidence)}
            </span>
            {finding.amountAffected != null && finding.amountAffected >= 0.01 ? (
              <span className="text-xs tabular-nums font-semibold text-red-700">
                {formatCurrency(finding.amountAffected)}
              </span>
            ) : null}
          </div>
          <p className="text-xs sm:text-sm mt-1 font-medium">What I found</p>
          <p className="text-xs sm:text-sm">{finding.problem}</p>
        </div>
      </div>
      <div className="rounded border border-black/10 bg-white/70 px-2.5 py-2 text-xs space-y-2">
        <div>
          <p className="font-medium text-muted-foreground mb-0.5">Why it matters</p>
          <p className="leading-relaxed">{finding.whyItMatters}</p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground mb-0.5">What to check</p>
          <p className="leading-relaxed">{finding.whatToCheck ?? finding.suggestedFix ?? finding.suggestedAction ?? "—"}</p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground mb-0.5">Suggested fix</p>
          <p className="leading-relaxed text-amber-950">
            {finding.suggestedFix ?? finding.suggestedAction ?? "—"}
          </p>
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Evidence</p>
      {finding.evidence.length > 0 ? (
        <ul className="text-xs space-y-1.5 max-h-40 overflow-y-auto">
          {finding.evidence.map((ev, i) => (
            <li key={i} className="border-b border-black/5 pb-1 last:border-0">
              {ev.accountName ? (
                <span className="font-medium block truncate">{ev.accountName}</span>
              ) : null}
              {ev.voucherNumber ? (
                <span className="font-medium block">
                  Voucher {ev.voucherNumber}
                  {ev.voucherDate ? ` · ${ev.voucherDate}` : ""}
                </span>
              ) : null}
              {ev.detail ? <span className="text-muted-foreground block">{ev.detail}</span> : null}
              {ev.relatedAccounts && ev.relatedAccounts.length > 0 ? (
                <span className="block text-muted-foreground">{ev.relatedAccounts.join(" · ")}</span>
              ) : null}
              {ev.currentGroup ? (
                <span className="block">Current group: {ev.currentGroup}</span>
              ) : null}
              {ev.suggestedGroup ? (
                <span className="block text-blue-800">{ev.suggestedGroup}</span>
              ) : null}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums mt-0.5">
                {ev.openingBalance != null && Math.abs(ev.openingBalance) >= 0.005 ? (
                  <span>OB: {formatCurrency(Math.abs(ev.openingBalance))}</span>
                ) : null}
                {ev.debit != null && ev.debit >= 0.005 ? <span>Dr: {formatCurrency(ev.debit)}</span> : null}
                {ev.credit != null && ev.credit >= 0.005 ? <span>Cr: {formatCurrency(ev.credit)}</span> : null}
                {ev.closingBalance != null && Math.abs(ev.closingBalance) >= 0.005 ? (
                  <span>Closing: {formatCurrency(Math.abs(ev.closingBalance))}</span>
                ) : null}
                {ev.amount != null && Math.abs(ev.amount) >= 0.005 ? (
                  <span>Amount: {formatCurrency(Math.abs(ev.amount))}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {finding.action ? (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={handleAction}>
          {actionLabel(finding.action.kind)}
        </Button>
      ) : null}
    </div>
  );
}

function CheckBlock({
  check,
  formatCurrency,
  onJump,
}: {
  check: BalanceSheetCheckItem;
  formatCurrency: (amount: number) => string;
  onJump?: (scrollTargetId: string) => void;
}) {
  const [open, setOpen] = useState(() => defaultExpanded(check.status));
  const help = getBsCheckHelp(check.id);
  const quickHint = help?.en.whatToDo[0];
  const hasBody =
    (check.lines?.length ?? 0) > 0 ||
    Boolean(check.scrollTargetId) ||
    Boolean(quickHint);

  return (
    <div
      className={cn(
        "rounded border overflow-hidden",
        check.status === "pass"
          ? "border-green-200/80 bg-green-50/30"
          : check.status === "fail"
            ? "border-red-200 bg-red-50/20"
            : check.status === "warn"
              ? "border-amber-200 bg-amber-50/30"
              : "border-black/15 bg-white"
      )}
    >
      <div className="flex items-start gap-1 px-2 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left hover:opacity-90"
          onClick={() => hasBody && setOpen(!open)}
          disabled={!hasBody}
        >
          {statusIcon(check.status)}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">{check.title}</p>
            <p className="text-xs text-muted-foreground">{check.summary}</p>
            {!open && quickHint && check.status !== "pass" ? (
              <p className="text-[11px] text-amber-800 mt-1 line-clamp-2">
                <span className="font-medium">Fix: </span>
                {quickHint}
              </p>
            ) : null}
          </div>
          {check.amount != null && Math.abs(check.amount) >= 0.01 ? (
            <span className="tabular-nums text-sm font-semibold text-red-700 shrink-0">
              {formatCurrency(Math.abs(check.amount))}
            </span>
          ) : null}
          {hasBody ? (
            open ? (
              <ChevronUp className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 mt-0.5" />
            )
          ) : null}
        </button>
        <BalanceSheetCheckHelpInfo checkId={check.id} compact className="mt-0.5 shrink-0" />
      </div>

      {open && hasBody ? (
        <div className="px-3 pb-3 pt-0 border-t border-black/10 mx-2 mb-2">
          {check.scrollTargetId && onJump ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs text-orange-800 underline mb-2"
              onClick={() => onJump(check.scrollTargetId!)}
            >
              Jump to section on page
            </Button>
          ) : null}
          {help?.en.mappingHint && check.status !== "pass" ? (
            <p className="text-[11px] text-blue-800 bg-blue-50/80 border border-blue-100 rounded px-2 py-1.5 mb-2">
              <span className="font-semibold">Mapping: </span>
              {help.en.mappingHint}
            </p>
          ) : null}
          {check.lines && check.lines.length > 0 ? (
            <ul className="space-y-1 max-h-48 overflow-y-auto text-xs sm:text-sm">
              {check.lines.map((line) => (
                <li key={line.label + String(line.amount)} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {line.label}
                      {line.side ? ` (${line.side})` : ""}
                    </span>
                    {line.detail ? (
                      <span className="block text-muted-foreground text-[11px] truncate">{line.detail}</span>
                    ) : null}
                  </span>
                  {line.amount != null && Math.abs(line.amount) >= 0.005 ? (
                    <span className="tabular-nums shrink-0 font-medium">
                      {formatCurrency(Math.abs(line.amount))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  helpId,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  helpId?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-black/15 overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-2 bg-muted/30">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left hover:opacity-90"
          onClick={() => setOpen(!open)}
        >
          <span className="text-sm font-semibold">{title}</span>
          {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
        {helpId ? <BalanceSheetCheckHelpInfo checkId={helpId} compact className="shrink-0" /> : null}
      </div>
      {open ? <div className="p-3">{children}</div> : null}
    </div>
  );
}

function FindingSection({
  title,
  findings,
  formatCurrency,
  actions,
}: {
  title: string;
  findings: BalanceSheetTeacherFinding[];
  formatCurrency: (amount: number) => string;
  actions: BalanceSheetCheckEngineActions;
}) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid gap-2 lg:grid-cols-2">
        {findings.map((f) => (
          <TeacherFindingCard key={f.id} finding={f} formatCurrency={formatCurrency} actions={actions} />
        ))}
      </div>
    </div>
  );
}

function BalanceSheetCheckEngineReportBody({
  report,
  formatCurrency,
  actions,
}: {
  report: BalanceSheetCheckEngineReport;
  formatCurrency: (amount: number) => string;
  actions: BalanceSheetCheckEngineActions;
}) {
  const { teacher } = report;
  const sortedChecks = useMemo(
    () => [...report.checks].sort((a, b) => STATUS_SORT[a.status] - STATUS_SORT[b.status]),
    [report.checks]
  );
  const okChecks = sortedChecks.filter((c) => c.status === "pass" || c.status === "info");

  const healthBanner =
    teacher.healthStatus === "balanced" ? (
      <span className="px-2.5 py-1 rounded font-medium bg-green-100 text-green-800">✓ Balanced</span>
    ) : teacher.healthStatus === "critical" ? (
      <span className="px-2.5 py-1 rounded font-medium bg-red-100 text-red-800">❌ Critical Problems Found</span>
    ) : (
      <span className="px-2.5 py-1 rounded font-medium bg-amber-100 text-amber-900">⚠ Needs Review</span>
    );

  const handleJump = (scrollTargetId: string) => {
    actions.onScrollTo?.(scrollTargetId);
  };

  return (
    <div className="space-y-4 pr-1">
      <div className="rounded-md border border-black/15 p-3 bg-orange-50/50 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-orange-950">Balance Sheet Health</p>
          {healthBanner}
          {!report.isBalanced ? (
            <span className="text-sm tabular-nums text-red-700 font-medium">
              Difference {formatCurrency(report.totalDifference)}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
          {teacher.accountingHealth.map((item) => (
            <HealthRow key={item.label} item={item} />
          ))}
        </div>
      </div>

      {!report.isBalanced || teacher.whyNotBalanced.length > 1 ? (
        <div className="rounded-md border border-orange-200 bg-orange-50/60 p-3 space-y-2">
          <p className="text-sm font-semibold text-orange-950">Why is my Balance Sheet not balanced?</p>
          {teacher.whyNotBalanced.map((line, i) => (
            <p key={i} className="text-xs sm:text-sm leading-relaxed text-orange-950">
              {line}
            </p>
          ))}
          {teacher.unexplainedAmount != null && teacher.unexplainedAmount >= 0.01 ? (
            <p className="text-xs font-medium text-red-800">
              Unable to fully explain {formatCurrency(teacher.unexplainedAmount)} from current deterministic checks.
            </p>
          ) : null}
        </div>
      ) : null}

      {teacher.topProblems.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-orange-950">Top problems</p>
          <div className="grid gap-2 lg:grid-cols-2">
            {teacher.topProblems.map((f) => (
              <TeacherFindingCard key={f.id} finding={f} formatCurrency={formatCurrency} actions={actions} />
            ))}
          </div>
        </div>
      ) : null}

      <FindingSection
        title="Critical"
        findings={teacher.critical.filter((f) => !teacher.topProblems.some((t) => t.id === f.id))}
        formatCurrency={formatCurrency}
        actions={actions}
      />
      <FindingSection
        title="Warnings"
        findings={teacher.warning.filter((f) => !teacher.topProblems.some((t) => t.id === f.id))}
        formatCurrency={formatCurrency}
        actions={actions}
      />
      <FindingSection
        title="Information"
        findings={teacher.info}
        formatCurrency={formatCurrency}
        actions={actions}
      />

      {!teacher.residual.fullyExplained && teacher.residual.unexplained >= 0.01 ? (
        <div className="rounded-md border border-red-200 bg-red-50/50 p-3 text-xs sm:text-sm">
          <p className="font-semibold text-red-900">
            ⚠ {formatCurrency(teacher.residual.unexplained)} remains unexplained
          </p>
          <p className="mt-1 text-red-950">
            Known explained components are listed in reconciliation below. Do not label this residual as
            &quot;classification&quot; without account evidence.
          </p>
        </div>
      ) : teacher.residual.fullyExplained && !report.isBalanced ? (
        <p className="text-xs sm:text-sm text-green-800 font-medium">
          ✓ Balance Sheet difference fully explained by reconciliation components.
        </p>
      ) : null}

      {teacher.recommendedFixOrder.length > 0 ? (
        <div className="rounded-md border border-black/15 p-3 bg-muted/20">
          <p className="text-sm font-semibold mb-2">Recommended fix order</p>
          <ol className="list-decimal pl-4 text-xs sm:text-sm space-y-1">
            {teacher.recommendedFixOrder.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <CollapsibleSection
        defaultOpen
        helpId="reconciliation_table"
        title="How the difference is calculated"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-black/10 p-3 bg-orange-50/40">
            <p className="text-sm font-semibold mb-2 text-orange-900">
              <BalanceSheetCheckSectionHelp
                sectionId="reconciliation_table"
                title="Must equal total difference"
              />
            </p>
            <Table className="text-xs sm:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.reconciliationTable.map((row) => (
                  <TableRow key={row.source}>
                    <TableCell className="py-1.5 align-top">{row.source}</TableCell>
                    <TableCell
                      className={cn(
                        "py-1.5 text-right tabular-nums font-medium align-top whitespace-nowrap",
                        row.amount < 0 ? "text-green-700" : row.amount > 0 ? "text-red-700" : ""
                      )}
                    >
                      {row.amount >= 0 ? "" : "−"}
                      {formatCurrency(Math.abs(row.amount))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold">
                  <TableCell className="py-1.5">TOTAL</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums text-red-700">
                    {formatCurrency(report.reconciliationTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {report.remainingAfterOpening >= 0.01 ? (
            <div className="rounded-md border border-black/10 p-3 bg-orange-50/40">
              <p className="text-sm font-semibold mb-2 text-orange-900">
                <BalanceSheetCheckSectionHelp
                  sectionId="remaining_after_opening"
                  title="Remaining after opening"
                />
              </p>
              <Table className="text-xs sm:text-sm">
                <TableBody>
                  {report.remainingBreakdown.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell className="py-1.5">{row.source}</TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap">
                        {row.amount >= 0 ? "" : "−"}
                        {formatCurrency(Math.abs(row.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell className="py-1.5">= Remaining</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {formatCurrency(report.remainingTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </CollapsibleSection>

      {okChecks.length > 0 ? (
        <CollapsibleSection title={`Technical checks (${okChecks.length})`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {okChecks.map((check) => (
              <CheckBlock
                key={check.id}
                check={check}
                formatCurrency={formatCurrency}
                onJump={handleJump}
              />
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

      {report.topTransactionDrivers.length > 0 ? (
        <CollapsibleSection helpId="transaction_layer" title="Top transaction drivers">
          <ul className="text-xs sm:text-sm space-y-1 max-h-48 overflow-y-auto">
            {report.topTransactionDrivers.map((d) => (
              <li key={d.label} className="flex justify-between gap-3">
                <span className="truncate">{d.label}</span>
                <span className="tabular-nums shrink-0 font-medium">{formatCurrency(d.amount ?? 0)}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {report.topOpeningSpread.length > 0 ? (
        <CollapsibleSection title="Top opening classification spread">
          <ul className="text-xs sm:text-sm space-y-1 max-h-48 overflow-y-auto">
            {report.topOpeningSpread.map((d) => (
              <li key={d.label} className="flex justify-between gap-3">
                <span className="truncate">{d.label}</span>
                <span className="tabular-nums shrink-0 font-medium">{formatCurrency(d.amount ?? 0)}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

export const BalanceSheetCheckEnginePanel = forwardRef<BalanceSheetCheckEnginePanelHandle, Props>(
  function BalanceSheetCheckEnginePanel(
    {
      input,
      formatCurrency,
      onScrollTo,
      onOpenAccount,
      onOpenVoucher,
      onOpenPl,
      onCheckOpening,
      onReviewAdjustment,
    },
    ref
  ) {
  const [report, setReport] = useState<BalanceSheetCheckEngineReport | null>(null);
  const [running, setRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const actions: BalanceSheetCheckEngineActions = {
    onScrollTo,
    onOpenAccount,
    onOpenVoucher,
    onOpenPl,
    onCheckOpening,
    onReviewAdjustment,
  };

  const runChecks = useCallback(() => {
    setRunning(true);
    try {
      const next = runBalanceSheetCheckEngine(input);
      setReport(next);
      setDialogOpen(true);
    } finally {
      setRunning(false);
    }
  }, [input]);

  useImperativeHandle(ref, () => ({ runAndOpen: runChecks }), [runChecks]);

  const handleActionWithClose = useCallback(
    (fn?: () => void) => {
      setDialogOpen(false);
      fn?.();
    },
    []
  );

  const wrappedActions: BalanceSheetCheckEngineActions = useMemo(
    () => ({
      onScrollTo: (id) => handleActionWithClose(() => onScrollTo?.(id)),
      onOpenAccount: (p) => handleActionWithClose(() => onOpenAccount?.(p)),
      onOpenVoucher: (id) => handleActionWithClose(() => onOpenVoucher?.(id)),
      onOpenPl: () => handleActionWithClose(() => onOpenPl?.()),
      onCheckOpening: () => handleActionWithClose(() => onCheckOpening?.()),
      onReviewAdjustment: (id) => handleActionWithClose(() => onReviewAdjustment?.(id)),
    }),
    [handleActionWithClose, onScrollTo, onOpenAccount, onOpenVoucher, onOpenPl, onCheckOpening, onReviewAdjustment]
  );

  return (
    <>
      <div className="!border-t-[1px] border-black px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-semibold text-orange-900">Check Engine</p>
          <p className="text-[10px] sm:text-[11px] text-orange-700">
            Accounting teacher — why, where, what to fix (read-only)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {report ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-orange-800"
              onClick={() => setDialogOpen(true)}
            >
              View last report
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs border-orange-300 bg-white hover:bg-orange-50"
            disabled={running}
            onClick={runChecks}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            {report ? "Re-run checks" : "Run all checks"}
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={cn(
            "flex flex-col gap-0 p-0 overflow-hidden",
            "w-[min(96vw,80vw)] max-w-[80vw]",
            "h-[min(92vh,80vh)] max-h-[80vh]"
          )}
        >
          <DialogHeader className="shrink-0 px-4 py-3 border-b border-black/15 bg-orange-50/80">
            <DialogTitle className="text-base sm:text-lg font-semibold text-orange-950">
              Balance Sheet Check Engine
            </DialogTitle>
            <p className="text-xs sm:text-sm text-muted-foreground font-normal">
              Read-only accounting teacher — no automatic corrections
            </p>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {running ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Running checks…
              </div>
            ) : report ? (
              <BalanceSheetCheckEngineReportBody
                report={report}
                formatCurrency={formatCurrency}
                actions={wrappedActions}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Click &quot;Run all checks&quot; to generate a report.
              </p>
            )}
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-black/15 bg-muted/30">
            <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
            <Button type="button" size="sm" disabled={running} onClick={runChecks}>
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Re-run checks
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

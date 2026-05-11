"use client";

import * as React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { useDashboardRecurringAccrual } from "@/hooks/useDashboardRecurringAccrual";
import { buildCompanyFlowDrCrContext } from "@/lib/dashboardRecurringAccrual";
import usePermissions from "@/hooks/usePermissions";
import { firestore } from "@/lib/firebase";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RecurringDashboardLine } from "@/lib/dashboardRecurringAccrual";
import { X } from "lucide-react";

/** useDate().formatCurrency — JSX return (animated span possible) */
type RecurringDetailsFmt = (n: number) => React.ReactNode;

type RecurringDetailsPanelProps = {
  rows: RecurringDashboardLine[];
  fmt: RecurringDetailsFmt;
  /** Row tap → source body voucher edit (dashboard `AddVoucherDialog`) */
  onLineOpenVoucher?: (bodyVoucherId: string) => void;
};

/** Auto recurring dialog: Dr table + total — mobile tab aur desktop row dono yahi JSX reuse */
function RecurringDetailsDebitPanel({ rows, fmt, onLineOpenVoucher }: RecurringDetailsPanelProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-50/40 dark:bg-slate-950/25">
      {/* max-md: ~40% chhota bar — desktop md: pehle jaisa py-2 + text-sm */}
      <div
        className={cn(
          "shrink-0 border-b border-black bg-slate-200/80 px-3 font-semibold text-slate-800 dark:border-neutral-300 dark:bg-slate-800/75 dark:text-slate-100",
          "max-md:py-1 max-md:text-xs max-md:leading-none",
          "md:py-2 md:text-sm",
        )}
      >
        Debit lines ({rows.length})
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* basis-0: flex item ka default min-height:auto scroll ko rok deta hai — poori bachi height ScrollArea ko */}
        <ScrollArea className="min-h-0 w-full min-w-0 flex-1 basis-0 bg-slate-50/90 dark:bg-slate-900/30">
          <table className="w-full border-collapse text-xs table-fixed">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[32%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead className="sticky top-0 z-[1] border-b border-black bg-slate-100/95 dark:border-neutral-300 dark:bg-slate-800/65">
              <tr>
                <th className="p-2 text-left font-medium text-slate-800 dark:text-slate-100">Account</th>
                <th className="p-2 text-left font-medium text-slate-800 dark:text-slate-100">Voucher no</th>
                <th className="p-2 text-right font-medium text-slate-800 dark:text-slate-100">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const accountTitle = [row.accountLabel, row.narration].filter(Boolean).join(" — ");
                const bodyId = String(row.bodyVoucherId || "").trim();
                const openEdit = onLineOpenVoucher && bodyId ? () => onLineOpenVoucher(bodyId) : undefined;
                return (
                  <tr
                    key={`d-${row.templateDocId}-${i}`}
                    className={cn(
                      "border-b border-black/55 dark:border-neutral-400/90",
                      i % 2 === 0
                        ? "bg-slate-50/90 dark:bg-slate-900/35"
                        : "bg-slate-100/85 dark:bg-slate-800/40",
                      openEdit &&
                        "cursor-pointer select-none hover:bg-slate-200/70 dark:hover:bg-slate-700/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                    )}
                    onClick={openEdit}
                    onKeyDown={
                      openEdit
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openEdit();
                            }
                          }
                        : undefined
                    }
                    tabIndex={openEdit ? 0 : undefined}
                    role={openEdit ? "button" : undefined}
                    aria-label={openEdit ? `Edit voucher ${row.voucherNumber || bodyId}` : undefined}
                  >
                    <td className="max-w-0 min-w-0 p-2 align-middle" title={accountTitle}>
                      <div className="min-w-0 truncate font-medium text-foreground">{row.accountLabel}</div>
                    </td>
                    <td className="max-w-0 min-w-0 p-2 align-middle" title={row.voucherNumber}>
                      <div className="min-w-0 truncate font-mono text-[11px] text-foreground">{row.voucherNumber}</div>
                    </td>
                    <td className="whitespace-nowrap p-2 text-right align-middle font-medium tabular-nums text-green-600">
                      {fmt(row.debit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
        <div className="shrink-0 border-t-2 border-black bg-slate-200/90 dark:border-neutral-300 dark:bg-slate-800/80">
          <table className="w-full border-collapse text-xs table-fixed leading-none">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[32%]" />
              <col className="w-[30%]" />
            </colgroup>
            <tbody>
              <tr className="font-semibold text-slate-900 dark:text-slate-50">
                <td className="px-2 py-1" colSpan={2}>
                  Total debit
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-green-700 dark:text-green-400">
                  {fmt(rows.reduce((s, r) => s + r.debit, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Cr table + total — mobile tab / desktop reuse */
function RecurringDetailsCreditPanel({ rows, fmt, onLineOpenVoucher }: RecurringDetailsPanelProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-rose-50/35 dark:bg-rose-950/20">
      <div
        className={cn(
          "shrink-0 border-b border-black bg-rose-100/85 px-3 font-semibold text-rose-950 dark:border-neutral-300 dark:bg-rose-950/45 dark:text-rose-50",
          "max-md:py-1 max-md:text-xs max-md:leading-none",
          "md:py-2 md:text-sm",
        )}
      >
        Credit lines ({rows.length})
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ScrollArea className="min-h-0 w-full min-w-0 flex-1 basis-0 bg-rose-50/80 dark:bg-rose-950/25">
          <table className="w-full border-collapse text-xs table-fixed">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[32%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead className="sticky top-0 z-[1] border-b border-black bg-rose-50/95 dark:border-neutral-300 dark:bg-rose-950/40">
              <tr>
                <th className="p-2 text-left font-medium text-rose-950 dark:text-rose-50">Account</th>
                <th className="p-2 text-left font-medium text-rose-950 dark:text-rose-50">Voucher no</th>
                <th className="p-2 text-right font-medium text-rose-950 dark:text-rose-50">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const accountTitle = [row.accountLabel, row.narration].filter(Boolean).join(" — ");
                const bodyId = String(row.bodyVoucherId || "").trim();
                const openEdit = onLineOpenVoucher && bodyId ? () => onLineOpenVoucher(bodyId) : undefined;
                return (
                  <tr
                    key={`c-${row.templateDocId}-${i}`}
                    className={cn(
                      "border-b border-black/55 dark:border-neutral-400/90",
                      i % 2 === 0
                        ? "bg-rose-50/75 dark:bg-rose-950/30"
                        : "bg-rose-100/55 dark:bg-rose-900/35",
                      openEdit &&
                        "cursor-pointer select-none hover:bg-rose-200/60 dark:hover:bg-rose-900/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                    )}
                    onClick={openEdit}
                    onKeyDown={
                      openEdit
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openEdit();
                            }
                          }
                        : undefined
                    }
                    tabIndex={openEdit ? 0 : undefined}
                    role={openEdit ? "button" : undefined}
                    aria-label={openEdit ? `Edit voucher ${row.voucherNumber || bodyId}` : undefined}
                  >
                    <td className="max-w-0 min-w-0 p-2 align-middle" title={accountTitle}>
                      <div className="min-w-0 truncate font-medium text-foreground">{row.accountLabel}</div>
                    </td>
                    <td className="max-w-0 min-w-0 p-2 align-middle" title={row.voucherNumber}>
                      <div className="min-w-0 truncate font-mono text-[11px] text-foreground">{row.voucherNumber}</div>
                    </td>
                    <td className="whitespace-nowrap p-2 text-right align-middle font-medium tabular-nums text-red-600">
                      {fmt(row.credit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
        <div className="shrink-0 border-t-2 border-black bg-rose-200/75 dark:border-neutral-300 dark:bg-rose-950/50">
          <table className="w-full border-collapse text-xs table-fixed leading-none">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[32%]" />
              <col className="w-[30%]" />
            </colgroup>
            <tbody>
              <tr className="font-semibold text-rose-950 dark:text-rose-50">
                <td className="px-2 py-1" colSpan={2}>
                  Total credit
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-red-700 dark:text-red-400">
                  {fmt(rows.reduce((s, r) => s + r.credit, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type Props = {
  className?: string;
  placement?: "with-all" | "summary";
  /** `gridCell` = Outstanding jaisa `col-span-1` financial summary grid ke andar */
  layout?: "default" | "gridCell";
  /** Dr/Cr line click → parent voucher edit dialog (e.g. dashboard `AddVoucherDialog`) */
  onOpenBodyVoucher?: (bodyVoucherId: string) => void;
};

/**
 * Auto recurring: company toggle + live accrued (AddVoucher jaisa) + Outstanding-style rows jab ON ho.
 */
export function RecurringAutoSummaryCard({
  className,
  placement = "with-all",
  layout = "default",
  onOpenBodyVoucher,
}: Props) {
  const { company, companyId, triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const { can } = usePermissions();
  const cid = String(companyId || "").trim();
  const recurringCompanyEnabled =
    (company as { recurringVoucherSettings?: { enabled?: boolean } } | null)?.recurringVoucherSettings?.enabled ===
    true;
  const {
    vouchers,
    journalAccountNames,
    processedParties,
    processedStaff,
    processedTaxes,
    expenseAccounts,
    processedAccounts,
    processedItems,
  } = useVouchers();
  const { formatCurrency } = useDate();

  const canToggleRecurring = can("configure_company_settings");
  const [savingToggle, setSavingToggle] = React.useState(false);

  const partyNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of processedParties || []) {
      const id = String((p as { id?: string }).id || "").trim();
      if (id) m.set(id, String((p as { name?: string }).name || id));
    }
    return m;
  }, [processedParties]);

  const staffNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of processedStaff || []) {
      const id = String((s as { id?: string }).id || "").trim();
      if (id) m.set(id, String((s as { name?: string }).name || id));
    }
    return m;
  }, [processedStaff]);

  // Journal flow: party/staff/tax Cr→Cr column; income/bank/item/expense “clear” rules — `dashboardRecurringAccrual` me detail
  const companyFlowCtx = React.useMemo(
    () =>
      buildCompanyFlowDrCrContext({
        partyIds: partyNameById.keys(),
        staffIds: staffNameById.keys(),
        taxIds: (processedTaxes || []).map((t) => String((t as { id?: string }).id || "").trim()).filter(Boolean),
        expenseAccounts: expenseAccounts || [],
        bankCashAccountIds: (processedAccounts || [])
          .filter((a) => {
            const t = String((a as { accountType?: string }).accountType || "");
            return t === "Bank" || t === "Cash";
          })
          .map((a) => String((a as { id?: string }).id || "").trim())
          .filter(Boolean),
        itemIds: (processedItems || []).map((it) => String((it as { id?: string }).id || "").trim()).filter(Boolean),
      }),
    [partyNameById, staffNameById, processedTaxes, expenseAccounts, processedAccounts, processedItems],
  );

  const agg = useDashboardRecurringAccrual({
    companyId: cid || undefined,
    recurringCompanyEnabled,
    vouchers: vouchers as Record<string, unknown>[],
    journalAccountNames,
    partyNameById,
    staffNameById,
    companyFlowCtx,
  });

  const isMobile = useIsMobile();
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  // Popup band karke parent ko body voucher id — Recent table jaisa `AddVoucherDialog`
  const handleLineOpenVoucher = React.useCallback(
    (bodyVoucherId: string) => {
      const id = String(bodyVoucherId || "").trim();
      if (!id || !onOpenBodyVoucher) return;
      setDetailsOpen(false);
      onOpenBodyVoucher(id);
    },
    [onOpenBodyVoucher],
  );
  const lineOpenHandler = onOpenBodyVoucher ? handleLineOpenVoucher : undefined;

  const inGrid = layout === "gridCell";
  const dedicatedTab = placement === "summary";

  const onRecurringToggle = React.useCallback(
    async (checked: boolean) => {
      if (!cid) {
        toast.error("No company selected.");
        return;
      }
      if (!canToggleRecurring) {
        toast.error("You need “Configure Company Settings” permission to change this.");
        return;
      }
      setSavingToggle(true);
      try {
        const prev = ((company as Record<string, unknown>)?.recurringVoucherSettings as Record<string, unknown>) || {};
        const patch = {
          recurringVoucherSettings: {
            ...prev,
            enabled: checked,
          },
        };
        await updateDoc(doc(firestore, "companies", cid), patch);
        try {
          const localRow = await getLocalCompanyById(cid);
          if (localRow) {
            await upsertLocalCompany({
              ...(localRow as Record<string, unknown>),
              ...patch,
              id: cid,
            } as unknown as Parameters<typeof upsertLocalCompany>[0]);
          }
        } catch {
          /* online-only */
        }
        reloadLocalCompanyRegistry();
        triggerSync();
        toast.success(checked ? "Recurring voucher generation is ON." : "Recurring voucher generation is OFF.");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not update company settings.";
        toast.error(msg);
      } finally {
        setSavingToggle(false);
      }
    },
    [cid, company, canToggleRecurring, reloadLocalCompanyRegistry, triggerSync],
  );

  // Net accrued: inflow (Dr) − outflow (Cr); >0 = zyada andar aane wala hissa
  const balanceAccruedNetInDr = agg.totalAccruedDr - agg.totalAccruedCr;
  const showShell = agg.loading || agg.firestoreEnabledCount > 0;

  const hasResolvedRows = agg.templateRows.length > 0;
  const waitingForVouchers = !agg.loading && agg.firestoreEnabledCount > 0 && !hasResolvedRows;
  const emptySchedules = !agg.loading && agg.firestoreEnabledCount === 0 && recurringCompanyEnabled;

  const fmt = (n: number) => formatCurrency(n, { showDrCr: false, noAnimation: true });

  // Purana behaviour: All tab + feature OFF + grid me slot — phir bhi card dikhao (switch se ON)
  const hideEntireCard =
    !inGrid && !dedicatedTab && !recurringCompanyEnabled && !showShell;

  if (hideEntireCard) return null;

  // `min-w-min` + parent grid `minmax(min-content,1fr)` — lamba amount cut/wrap na ho, column width badhe
  const gridOuterClass = cn(
    "col-span-1 min-w-min w-full transition-colors app-chrome-top-ribbon border-2 border-foreground/30 border-rose-300/70 pl-dashboard-ribbon-rose",
    className,
  );
  const defaultOuterClass = cn(
    "min-w-min w-full app-chrome-top-ribbon border-2 border-foreground/30 border-rose-300/70 pl-dashboard-ribbon-rose",
    className,
  );

  return (
    <Card className={inGrid ? gridOuterClass : defaultOuterClass}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
        {/* Switch ke left visible label — user ne "Auto recurring" maanga */}
        <CardTitle className="min-w-0 truncate text-base font-semibold text-card-foreground">Auto recurring</CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={recurringCompanyEnabled}
            disabled={!canToggleRecurring || savingToggle}
            onCheckedChange={(v) => void onRecurringToggle(v)}
            aria-label="Enable recurring voucher generation for this company"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-2 p-4 pt-0">
        {!recurringCompanyEnabled ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Turn the switch on to generate and track scheduled vouchers. You can also change this under Settings →
            Voucher settings.
          </p>
        ) : agg.loading ? (
          <Skeleton className="h-20 w-full" />
        ) : emptySchedules ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            No enabled auto schedule yet. Open a voucher, turn on auto recurring, and save.
          </p>
        ) : waitingForVouchers ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {agg.firestoreEnabledCount} schedule(s) are enabled, but the clone/source vouchers are not in the list yet.
            Refresh the page or wait for sync; amounts will appear here.
          </p>
        ) : (
          <>
            {/* Lambe amounts: nowrap + gap; label chhota ho to truncate, rakam kabhi wrap nahi */}
            <div className="flex min-w-0 items-baseline justify-between gap-2 sm:gap-3">
              <span className="min-w-0 shrink truncate text-xs text-muted-foreground">Inflow to company</span>
              <span className="shrink-0 whitespace-nowrap text-base font-bold tabular-nums text-green-600">
                {fmt(agg.totalAccruedDr)} <span className="text-xs">Dr</span>
              </span>
            </div>
            <div className="flex min-w-0 items-baseline justify-between gap-2 sm:gap-3">
              <span className="min-w-0 shrink truncate text-xs text-muted-foreground">Outflow from company</span>
              <span className="shrink-0 whitespace-nowrap text-base font-bold tabular-nums text-red-600">
                {fmt(agg.totalAccruedCr)} <span className="text-xs">Cr</span>
              </span>
            </div>
            <div className="mt-2 flex min-w-0 items-baseline justify-between gap-2 border-t pt-2 sm:gap-3">
              <span className="min-w-0 shrink truncate text-sm font-bold">
                {balanceAccruedNetInDr > 0
                  ? "Balance (Dr)"
                  : balanceAccruedNetInDr < 0
                    ? "Balance (Cr)"
                    : "Balance"}
              </span>
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap text-lg font-bold tabular-nums",
                  balanceAccruedNetInDr > 0
                    ? "text-green-600"
                    : balanceAccruedNetInDr < 0
                      ? "text-red-600"
                      : "text-muted-foreground",
                )}
              >
                {balanceAccruedNetInDr !== 0 ? (
                  <>
                    {fmt(Math.abs(balanceAccruedNetInDr))}{" "}
                    <span className="text-xs">{balanceAccruedNetInDr > 0 ? "Dr" : "Cr"}</span>
                  </>
                ) : (
                  fmt(0)
                )}
              </span>
            </div>
          </>
        )}

        {recurringCompanyEnabled && !emptySchedules && (
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            {waitingForVouchers ? (
              <span className="text-xs text-muted-foreground">Details — available after vouchers sync.</span>
            ) : (
              <div className="pt-2 text-right">
                <DialogTrigger asChild>
                  <Button variant="link" size="sm" className="h-auto p-0 text-rose-700">
                    View details
                  </Button>
                </DialogTrigger>
              </div>
            )}
            <DialogContent
              hideCloseButton
              className={cn(
                // min-h-0: mobile tabs + ScrollArea ke liye height chain (warna footer / total beech mein atakte)
                // Bahar patla border = ribbon jaisa blue (default dialog `border` grey hata)
                "fixed z-50 flex min-h-0 flex-col gap-0 overflow-hidden border border-blue-500 bg-background p-0 shadow-lg dark:border-blue-600",
                // Mobile: sirf balance strip fixed — Close nahi; ~3rem+safe scroll padding
                "left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none max-md:pb-[calc(3rem+env(safe-area-inset-bottom,0px))]",
                // PC: screen ka ~90% height, centered modal
                "md:left-1/2 md:top-1/2 md:h-[90vh] md:max-h-[90vh] md:w-[min(100vw-16px,64rem)] md:max-w-5xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:pb-0",
              )}
            >
              {/* Neela ribbon: pehle se aur ~20% patla (py / hit-area / font) — layout same */}
              <DialogHeader className="flex shrink-0 flex-row items-center gap-1 space-y-0 border-b border-blue-600/20 bg-blue-500 px-2 py-[0.24rem] dark:border-blue-800/35 dark:bg-blue-600 md:gap-1.5 md:px-3 md:py-[0.28rem]">
                <div className="w-6 shrink-0 md:w-7" aria-hidden />
                <DialogTitle className="flex-1 text-center text-xs font-semibold leading-none text-white md:text-[0.8125rem] md:leading-tight">
                  Auto recurring vouchers
                </DialogTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-[1.4rem] w-[1.4rem] shrink-0 text-white hover:bg-white/20 hover:text-white focus-visible:ring-white/60 md:h-[1.6rem] md:w-[1.6rem]"
                  aria-label="Close dialog"
                  onClick={() => setDetailsOpen(false)}
                >
                  <X className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={2.25} />
                </Button>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {isMobile ? (
                  <Tabs
                    defaultValue="debit"
                    className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden"
                  >
                    {/* Mobile: pehle table+total, neeche tab bar — row 1 = `minmax(0,1fr)` height chain */}
                    <TabsContent
                      value="debit"
                      className="col-start-1 row-start-1 m-0 mt-0 flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    >
                      <RecurringDetailsDebitPanel
                        rows={agg.detailDebitLines}
                        fmt={fmt}
                        onLineOpenVoucher={lineOpenHandler}
                      />
                    </TabsContent>
                    <TabsContent
                      value="credit"
                      className="col-start-1 row-start-1 m-0 mt-0 flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    >
                      <RecurringDetailsCreditPanel
                        rows={agg.detailCreditLines}
                        fmt={fmt}
                        onLineOpenVoucher={lineOpenHandler}
                      />
                    </TabsContent>
                    {/* Selected pill border = header jaisa `border-blue-500` / `dark:border-blue-600` (1px) */}
                    <TabsList className="col-start-1 row-start-2 grid min-h-8 h-auto w-full shrink-0 grid-cols-2 items-stretch gap-1.5 border-t-2 border-black bg-muted/30 px-1.5 py-1.5 dark:border-neutral-300">
                      <TabsTrigger
                        value="debit"
                        className={cn(
                          "flex items-center justify-center rounded-full border border-transparent py-0.5 text-xs font-semibold leading-tight shadow-none transition-[border-color,box-shadow]",
                          "!bg-green-200 !text-green-950 dark:!bg-green-800/90 dark:!text-green-50",
                          "data-[state=active]:!bg-green-200 data-[state=active]:!text-green-950 data-[state=active]:dark:!bg-green-800/90",
                          "data-[state=active]:!border-blue-500 dark:data-[state=active]:!border-blue-600 data-[state=inactive]:!border-transparent",
                          "data-[state=active]:shadow-none data-[state=inactive]:shadow-none",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:focus-visible:ring-blue-600",
                        )}
                      >
                        Debit ({agg.detailDebitLines.length})
                      </TabsTrigger>
                      <TabsTrigger
                        value="credit"
                        className={cn(
                          "flex items-center justify-center rounded-full border border-transparent py-0.5 text-xs font-semibold leading-tight shadow-none transition-[border-color,box-shadow]",
                          "!bg-pink-200 !text-pink-950 dark:!bg-pink-800/85 dark:!text-pink-50",
                          "data-[state=active]:!bg-pink-200 data-[state=active]:!text-pink-950 data-[state=active]:dark:!bg-pink-800/85",
                          "data-[state=active]:!border-blue-500 dark:data-[state=active]:!border-blue-600 data-[state=inactive]:!border-transparent",
                          "data-[state=active]:shadow-none data-[state=inactive]:shadow-none",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:focus-visible:ring-blue-600",
                        )}
                      >
                        Credit ({agg.detailCreditLines.length})
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-row divide-x divide-black dark:divide-neutral-300">
                    <RecurringDetailsDebitPanel
                      rows={agg.detailDebitLines}
                      fmt={fmt}
                      onLineOpenVoucher={lineOpenHandler}
                    />
                    <RecurringDetailsCreditPanel
                      rows={agg.detailCreditLines}
                      fmt={fmt}
                      onLineOpenVoucher={lineOpenHandler}
                    />
                  </div>
                )}
              </div>
              <div
                className={cn(
                  // Mobile: column + balance center; PC: ek row — balance baen, Close daen
                  "flex shrink-0 flex-col gap-2 border-t border-black bg-gradient-to-r from-slate-100/90 via-slate-50/80 to-rose-100/90 px-3 py-2 dark:border-neutral-300 dark:from-slate-900/55 dark:via-slate-950/40 dark:to-rose-950/40",
                  "md:flex-row md:items-center md:justify-between md:gap-3",
                  "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-[60] max-md:border-t-2 max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-md:pt-2 max-md:shadow-[0_-6px_16px_rgba(0,0,0,0.12)]",
                )}
              >
                <p className="m-0 min-w-0 flex-1 text-center text-sm font-semibold leading-snug md:text-left">
                  Balance (Dr lines − Cr lines):{" "}
                  <span
                    className={cn(
                      "tabular-nums",
                      agg.detailNetCompanyDrMinusCr > 0
                        ? "text-green-700"
                        : agg.detailNetCompanyDrMinusCr < 0
                          ? "text-red-700"
                          : "text-muted-foreground",
                    )}
                  >
                    {agg.detailNetCompanyDrMinusCr !== 0 ? (
                      <>
                        {fmt(Math.abs(agg.detailNetCompanyDrMinusCr))}{" "}
                        <span className="text-xs">{agg.detailNetCompanyDrMinusCr > 0 ? "Dr" : "Cr"}</span>
                      </>
                    ) : (
                      fmt(0)
                    )}
                  </span>
                </p>
                {/* Desktop: same row daen; mobile — ribbon X */}
                <div className="hidden shrink-0 md:block">
                  <Button type="button" variant="secondary" size="sm" className="font-semibold" onClick={() => setDetailsOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

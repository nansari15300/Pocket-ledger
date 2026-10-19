"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { endOfDay, startOfDay } from "date-fns";
import { useCompany } from "@/hooks/useCompany";
import { FyVoucherScopeOverrideProvider, type FyVoucherScopeContextValue } from "@/contexts/FyVoucherScopeContext";
import type { FyDateRangeMs } from "@/lib/fyPagination/types";
import { listVouchersFromBrowserDbByDateRange } from "@/lib/fyPagination/voucherQueries";
import { computeEntityClosingBalancesBeforeMs } from "@/lib/fyPagination/openingSnapshotHydrate";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountDetails } from "@/components/bank-cash/AccountDetails";
import type { Account } from "@/components/bank-cash/types";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useFyScopedVouchers } from "@/hooks/useFyScopedVouchers";
import { cn } from "@/lib/utils";

type DaybookAccountDayPeekDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  daybookDate: Date | undefined;
  /** Dashboard bank/cash filter to use when the account popup first opens. */
  initialDateRange?: DateRange;
  /** Summary card figures are kept for existing callers; AccountDetails calculates the filtered ledger totals. */
  summaryOpening?: number;
  summaryIn?: number;
  summaryOut?: number;
  summaryClosing?: number;
};

const PEEK_WINDOW_DAYS = 10;
const PEEK_NOOP = () => {};
const PEEK_NOOP_ASYNC = async () => [] as any[];
const PEEK_EMPTY_RANGES: FyDateRangeMs[] = [];
const PEEK_EMPTY_IDS = new Set<string>();
const PEEK_EMPTY_BALANCES: Record<string, number> = {};
type PeekWindow = { fromMs: number; toMs: number };
type PeekAnchor = { atMs: number; balance: number };
const dayMsOf = (d: Date) => startOfDay(d).getTime();
const addDaysMs = (ms: number, days: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
};

/** Bank/cash row double-click - reuses the Bank ledger UI and its actions. */
export function DaybookAccountDayPeekDialog({
  open,
  onOpenChange,
  account,
  daybookDate,
  initialDateRange,
  summaryOpening,
}: DaybookAccountDayPeekDialogProps) {
  const { processedAccounts: allAccounts, userNames } = useFyScopedVouchers();
  const { companyId } = useCompany();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    initialDateRange ?? (daybookDate ? { from: daybookDate, to: daybookDate } : undefined)
  );
  // Open the shell instantly; mount the heavy ledger pipeline after first paint.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (!open) {
      setContentReady(false);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => startTransition(() => setContentReady(true)));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [open, account?.id]);
  const handleAccountDeleted = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Step the single-day filter by one calendar day (AD Date is the source of truth, so BS month lengths follow automatically).
  const stepDay = useCallback((delta: number) => {
    setDateRange((prev) => {
      const base = prev?.from ?? daybookDate ?? new Date();
      const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
      return { from: next, to: next };
    });
  }, [daybookDate]);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const currentDay = dateRange?.from ?? daybookDate;
  const canStepNext = !currentDay || new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate()).getTime() < startOfToday.getTime();

  useEffect(() => {
    if (!open) return;
    setDateRange(initialDateRange ?? (daybookDate ? { from: daybookDate, to: daybookDate } : undefined));
  }, [open, account?.id, initialDateRange, daybookDate]);

  // ---- Popup-local 10-day window cache (never touches the shared FY scope / dashboard data) ----
  const [peekWindow, setPeekWindow] = useState<PeekWindow | null>(null);
  const [peekRows, setPeekRows] = useState<any[]>([]);
  const peekWindowRef = useRef<PeekWindow | null>(null);
  peekWindowRef.current = peekWindow;
  /** dayStartMs -> true opening of that day (seeded from the Daily Summary; extended by each resolved day). */
  const knownOpeningsRef = useRef(new Map<number, number>());
  const [knownVersion, setKnownVersion] = useState(0);
  const loadSeqRef = useRef(0);
  const summaryOpeningRef = useRef(summaryOpening);
  summaryOpeningRef.current = summaryOpening;

  const loadPeekWindow = useCallback(
    async (win: PeekWindow | null, fallbackAnchorDayMs: number | null, accountId: string) => {
      if (!companyId) return;
      const seq = ++loadSeqRef.current;
      const rows = win ? await listVouchersFromBrowserDbByDateRange(companyId, win) : null;
      let fallback: number | null = null;
      if (fallbackAnchorDayMs != null) {
        // No known opening for this day (no Daybook figure / calendar jump): compute it once from SQLite.
        const balances = await computeEntityClosingBalancesBeforeMs(companyId, fallbackAnchorDayMs);
        const bal = balances[accountId];
        fallback = Number.isFinite(bal) ? bal : 0;
      }
      if (seq !== loadSeqRef.current) return;
      if (fallbackAnchorDayMs != null && fallback != null) knownOpeningsRef.current.set(fallbackAnchorDayMs, fallback);
      startTransition(() => {
        if (rows && win) {
          setPeekRows(rows.filter((v: any) => v?.isDeleted !== true));
          setPeekWindow(win);
        }
        setKnownVersion((n) => n + 1);
      });
    },
    [companyId]
  );

  // Open: window = [day-10 .. day]; opening of that day = Daily Summary figure (no SQLite walk).
  useEffect(() => {
    knownOpeningsRef.current = new Map();
    if (!open || !account) {
      loadSeqRef.current += 1;
      setPeekWindow(null);
      setPeekRows([]);
      return;
    }
    const day0 = dayMsOf(initialDateRange?.from ?? daybookDate ?? new Date());
    const win = { fromMs: addDaysMs(day0, -PEEK_WINDOW_DAYS), toMs: endOfDay(new Date(day0)).getTime() };
    const so = summaryOpeningRef.current;
    const hasSummary = typeof so === "number" && Number.isFinite(so);
    if (hasSummary) knownOpeningsRef.current.set(day0, so as number);
    void loadPeekWindow(win, hasSummary ? null : day0, account.id).catch((err) =>
      console.warn("[DaybookAccountDayPeek] window load", err)
    );
  }, [open, account?.id, initialDateRange, daybookDate, loadPeekWindow]);

  // Day change: inside the window with a known opening = pure in-memory. Otherwise load rows / opening once.
  const selectedDayMs = dateRange?.from ? dayMsOf(dateRange.from) : null;
  useEffect(() => {
    if (!open || !account || selectedDayMs == null) return;
    const win = peekWindowRef.current;
    if (!win) return;
    const known = knownOpeningsRef.current;
    const hasAnchor = known.has(selectedDayMs) || known.has(addDaysMs(selectedDayMs, 1));
    const inWindow = selectedDayMs >= win.fromMs && selectedDayMs <= win.toMs;
    if (inWindow && hasAnchor) return;
    let next: PeekWindow | null = null;
    if (!inWindow) {
      const todayMs = dayMsOf(new Date());
      const back = selectedDayMs < win.fromMs;
      // Keep the neighbour day too so the carried opening stays valid; old window rows are dropped.
      next = back
        ? { fromMs: addDaysMs(selectedDayMs, -(PEEK_WINDOW_DAYS - 1)), toMs: endOfDay(new Date(addDaysMs(selectedDayMs, 1))).getTime() }
        : {
            fromMs: addDaysMs(selectedDayMs, -1),
            toMs: endOfDay(new Date(Math.max(selectedDayMs, Math.min(addDaysMs(selectedDayMs, PEEK_WINDOW_DAYS - 1), todayMs)))).getTime(),
          };
    }
    void loadPeekWindow(next, hasAnchor ? null : selectedDayMs, account.id).catch((err) =>
      console.warn("[DaybookAccountDayPeek] window shift", err)
    );
  }, [open, account?.id, selectedDayMs, loadPeekWindow]);

  const peekAnchor = useMemo<PeekAnchor | null>(() => {
    void knownVersion;
    if (selectedDayMs == null) return null;
    const known = knownOpeningsRef.current;
    const here = known.get(selectedDayMs);
    if (here != null) return { atMs: selectedDayMs, balance: here };
    const nextMs = addDaysMs(selectedDayMs, 1);
    const nextVal = known.get(nextMs);
    if (nextVal != null) return { atMs: nextMs, balance: nextVal };
    return null;
  }, [selectedDayMs, knownVersion]);

  const handleOpeningResolved = useCallback((dayStartMs: number, opening: number, closing: number) => {
    const win = peekWindowRef.current;
    // Only trust a day computed with its rows in memory.
    if (!win || dayStartMs < win.fromMs || dayStartMs > win.toMs) return;
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return;
    const known = knownOpeningsRef.current;
    const nextMs = addDaysMs(dayStartMs, 1);
    let changed = false;
    if (known.get(dayStartMs) !== opening) {
      known.set(dayStartMs, opening);
      changed = true;
    }
    if (known.get(nextMs) !== closing) {
      known.set(nextMs, closing);
      changed = true;
    }
    if (changed) setKnownVersion((n) => n + 1);
  }, []);
  const peekScope = useMemo<FyVoucherScopeContextValue>(
    () => ({
      enabled: true,
      activeScope: {
        policy: "date_range",
        periodKind: "month",
        periodKey: `daybook-peek:${peekWindow?.fromMs ?? 0}`,
        range: peekWindow ?? { fromMs: 0, toMs: 0 },
        openingSnapshotId: null,
        fyFloorMs: null,
      },
      loadedRanges: PEEK_EMPTY_RANGES,
      scopedVoucherIds: PEEK_EMPTY_IDS,
      openingBalances: PEEK_EMPTY_BALANCES,
      openingBalancesLoadStatus: "ready",
      hydratedVouchers: peekRows,
      setActiveScope: PEEK_NOOP,
      applyOpeningBalances: PEEK_NOOP,
      setOpeningBalancesLoading: PEEK_NOOP,
      applyOpeningHydrateResult: PEEK_NOOP,
      requestLoadRange: PEEK_NOOP_ASYNC,
      requestLoadFyKey: PEEK_NOOP_ASYNC,
      requestLoadTransientRange: PEEK_NOOP_ASYNC,
      evictTransientRange: PEEK_NOOP,
      mergeHydratedVouchers: PEEK_NOOP,
      patchHydratedVouchers: PEEK_NOOP,
      registerInMemoryVoucherIds: PEEK_NOOP,
      resetScopeState: PEEK_NOOP,
    }),
    [peekWindow, peekRows]
  );

  return (
    <Dialog open={open && !!account} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="balance-sheet-ledger-popup daybook-account-peek-popup !left-0 !right-0 !top-0 !bottom-0 !translate-x-0 !translate-y-0 mx-auto my-auto w-[96vw] max-w-[1100px] h-[90vh] max-h-[90vh] !flex flex-col !gap-0 overflow-hidden !p-0 rounded-lg bg-background data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{account?.accountName || "Account ledger"}</DialogTitle>
        </DialogHeader>
        {account && (!contentReady || !peekWindow) ? (
          <div className="flex h-full min-h-0 flex-1 flex-col gap-3 p-4" aria-busy="true">
            <div className="text-sm font-semibold">{account.accountName}</div>
            <div className="h-16 animate-pulse rounded-md bg-muted/60" />
            <div className="h-8 animate-pulse rounded-md bg-muted/50" />
            <div className="flex-1 animate-pulse rounded-md bg-muted/40" />
          </div>
        ) : null}
        {account && contentReady && peekWindow ? (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <FyVoucherScopeOverrideProvider value={peekScope}>
              <AccountDetails
                key={account.id}
                account={account}
                allAccounts={allAccounts}
                userNames={userNames}
                onAccountUpdated={() => {}}
                onAccountDeleted={handleAccountDeleted}
                onBack={() => onOpenChange(false)}
                onPopupClose={() => onOpenChange(false)}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                ledgerPresentationMode="nested-ledger"
                showPeriodSummaryCards
                singleMonthCalendar
                dayStepper={{ onPrev: () => stepDay(-1), onNext: () => stepDay(1), canNext: canStepNext }}
                isolatedDayScope
                ledgerOpeningAnchor={peekAnchor}
                onLedgerOpeningResolved={handleOpeningResolved}
              />
            </FyVoucherScopeOverrideProvider>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}/** Daily Summary bank/cash account row — full-width orange hover/select + rounded corners */
export function daybookSummaryAccountRowCn(selected: boolean) {
  return cn(
    // TableRow default `hover:bg-muted/50` mat dikhao — sirf cells paint (warna pehla column hi highlight)
    "text-sm cursor-pointer transition-colors hover:!bg-transparent data-[state=selected]:!bg-transparent",
    "[&>td]:!bg-blue-100/30 dark:[&>td]:!bg-blue-950/20",
    "[&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg",
    !selected &&
      [
        "hover:[&>td]:!bg-orange-50 dark:hover:[&>td]:!bg-orange-950/35",
        // Full-length border: har td top+bottom; pehla left+radius; aakhri right+radius
        "hover:[&>td]:!shadow-[inset_0_1.5px_0_0_#fb923c,inset_0_-1.5px_0_0_#fb923c]",
        "hover:[&>td:first-child]:!shadow-[inset_2px_0_0_0_#fb923c,inset_0_1.5px_0_0_#fb923c,inset_0_-1.5px_0_0_#fb923c]",
        "hover:[&>td:last-child]:!shadow-[inset_-2px_0_0_0_#fb923c,inset_0_1.5px_0_0_#fb923c,inset_0_-1.5px_0_0_#fb923c]",
        "hover:[&>td:first-child]:!rounded-l-lg hover:[&>td:last-child]:!rounded-r-lg",
      ].join(" "),
    selected &&
      [
        "[&>td]:!bg-orange-50 dark:[&>td]:!bg-orange-950/40",
        "[&>td]:!shadow-[inset_0_2px_0_0_#fb923c,inset_0_-2px_0_0_#fb923c]",
        "[&>td:first-child]:!shadow-[inset_2px_0_0_0_#fb923c,inset_0_2px_0_0_#fb923c,inset_0_-2px_0_0_#fb923c]",
        "[&>td:last-child]:!shadow-[inset_-2px_0_0_0_#fb923c,inset_0_2px_0_0_#fb923c,inset_0_-2px_0_0_#fb923c]",
        "[&>td:first-child]:!rounded-l-lg [&>td:last-child]:!rounded-r-lg",
      ].join(" ")
  );
}

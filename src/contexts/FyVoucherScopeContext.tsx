"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fiscalYearRangeForKey } from "@/lib/fyPagination/periodBounds";
import { clearFyArchived } from "@/lib/fyPagination/archiveStore";
import { recordFyLoadedRange } from "@/lib/fyPagination/snapshotStore";
import { listVouchersFromBrowserDbByDateRange } from "@/lib/fyPagination/voucherQueries";
import { hydrateLedgerOpeningBalances } from "@/lib/fyPagination/openingSnapshotHydrate";
import type { LedgerOpeningHydrateResult } from "@/lib/fyPagination/openingSnapshotStatus";
import type { FyActiveScope, FyDateRangeMs } from "@/lib/fyPagination/types";
import { isDateInRange, voucherMs } from "@/lib/fyPagination/scopeFilter";

export type OpeningBalancesLoadStatus = "idle" | "loading" | "ready" | "unavailable";

type FyVoucherScopeContextValue = {
  enabled: boolean;
  activeScope: FyActiveScope | null;
  loadedRanges: FyDateRangeMs[];
  scopedVoucherIds: Set<string>;
  openingBalances: Record<string, number>;
  openingBalancesLoadStatus: OpeningBalancesLoadStatus;
  hydratedVouchers: any[];
  setActiveScope: (scope: FyActiveScope | null) => void;
  applyOpeningBalances: (balances: Record<string, number>) => void;
  setOpeningBalancesLoading: () => void;
  applyOpeningHydrateResult: (result: LedgerOpeningHydrateResult) => void;
  requestLoadRange: (range: FyDateRangeMs, fyKey?: string) => Promise<any[]>;
  requestLoadFyKey: (fyKey: string, country?: string) => Promise<any[]>;
  /** Load one date range from local SQLite into memory WITHOUT persisting a loaded-range record (e.g. dashboard Daybook old day). */
  requestLoadTransientRange: (range: FyDateRangeMs) => Promise<any[]>;
  /** Drop a range loaded by requestLoadTransientRange (and its rows) unless another range / the active scope still covers them. */
  evictTransientRange: (range: FyDateRangeMs) => void;
  mergeHydratedVouchers: (rows: any[]) => void;
  patchHydratedVouchers: (voucherIds: string[], patch: Record<string, unknown>) => void;
  registerInMemoryVoucherIds: (ids: Iterable<string>) => void;
  resetScopeState: () => void;
};

const FyVoucherScopeContext = createContext<FyVoucherScopeContextValue | null>(null);

export function FyVoucherScopeProvider({
  children,
  companyId,
  enabled = true,
}: {
  children: ReactNode;
  companyId: string | null | undefined;
  enabled?: boolean;
}) {
  const [activeScope, setActiveScope] = useState<FyActiveScope | null>(null);
  const [loadedRanges, setLoadedRanges] = useState<FyDateRangeMs[]>([]);
  const [hydratedVouchers, setHydratedVouchers] = useState<any[]>([]);
  const [scopedVoucherIds, setScopedVoucherIds] = useState<Set<string>>(() => new Set());
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [openingBalancesLoadStatus, setOpeningBalancesLoadStatus] =
    useState<OpeningBalancesLoadStatus>("idle");

  const registerInMemoryVoucherIds = useCallback((ids: Iterable<string>) => {
    setScopedVoucherIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) if (id) next.add(String(id));
      return next;
    });
  }, []);

  const applyOpeningBalances = useCallback((balances: Record<string, number>) => {
    setOpeningBalances(balances ?? {});
    setOpeningBalancesLoadStatus("ready");
  }, []);

  const setOpeningBalancesLoading = useCallback(() => {
    setOpeningBalances({});
    setOpeningBalancesLoadStatus("loading");
  }, []);

  const applyOpeningHydrateResult = useCallback((result: LedgerOpeningHydrateResult) => {
    setOpeningBalances(result.balances ?? {});
    setOpeningBalancesLoadStatus(result.status === "ready" ? "ready" : "unavailable");
  }, []);

  const resetScopeState = useCallback(() => {
    setActiveScope(null);
    setLoadedRanges([]);
    setHydratedVouchers([]);
    setScopedVoucherIds(new Set());
    setOpeningBalances({});
    setOpeningBalancesLoadStatus("idle");
  }, []);

  const mergeHydratedVouchers = useCallback((rows: any[]) => {
    if (!rows.length) return;
    setHydratedVouchers((prev) => {
      const map = new Map<string, any>();
      for (const row of prev) if (row?.id) map.set(String(row.id), row);
      for (const row of rows) if (row?.id) map.set(String(row.id), row);
      return [...map.values()];
    });
    registerInMemoryVoucherIds(rows.map((r) => String(r.id || "")));
  }, [registerInMemoryVoucherIds]);

  const patchHydratedVouchers = useCallback((voucherIds: string[], patch: Record<string, unknown>) => {
    const idSet = new Set((voucherIds || []).map((id) => String(id || "").trim()).filter(Boolean));
    if (!idSet.size) return;
    setHydratedVouchers((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const id = String(row?.id || "").trim();
        if (!id || !idSet.has(id)) return row;
        changed = true;
        return { ...row, ...patch, id };
      });
      return changed ? next : prev;
    });
  }, []);

  const requestLoadRange = useCallback(
    async (range: FyDateRangeMs, fyKey?: string) => {
      if (!companyId || !enabled) return [];
      const rows = await listVouchersFromBrowserDbByDateRange(companyId, range);
      await recordFyLoadedRange(companyId, range.fromMs, range.toMs, fyKey ?? null);
      if (fyKey) await clearFyArchived(companyId, fyKey);
      setLoadedRanges((prev) => [...prev, range]);
      mergeHydratedVouchers(rows);
      return rows;
    },
    [companyId, enabled, mergeHydratedVouchers]
  );

  const hydratedRef = useRef<any[]>([]);
  hydratedRef.current = hydratedVouchers;
  const loadedRangesRef = useRef<FyDateRangeMs[]>([]);
  loadedRangesRef.current = loadedRanges;
  const activeScopeRef = useRef<FyActiveScope | null>(null);
  activeScopeRef.current = activeScope;

  const requestLoadTransientRange = useCallback(
    async (range: FyDateRangeMs) => {
      if (!companyId || !enabled) return [];
      const rows = await listVouchersFromBrowserDbByDateRange(companyId, range);
      setLoadedRanges((prev) => [...prev, range]);
      mergeHydratedVouchers(rows);
      return rows;
    },
    [companyId, enabled, mergeHydratedVouchers]
  );

  const evictTransientRange = useCallback((range: FyDateRangeMs) => {
    let removed = false;
    const remaining = loadedRangesRef.current.filter((r) => {
      if (!removed && r.fromMs === range.fromMs && r.toMs === range.toMs) {
        removed = true;
        return false;
      }
      return true;
    });
    if (!removed) return;
    setLoadedRanges(remaining);
    const scope = activeScopeRef.current;
    const stillCovered = (ms: number) =>
      (scope ? isDateInRange(ms, scope.range) : false) || remaining.some((r) => isDateInRange(ms, r));
    const dropIds = new Set<string>();
    for (const row of hydratedRef.current) {
      const ms = voucherMs(row?.date);
      const id = String(row?.id || "").trim();
      if (id && ms != null && isDateInRange(ms, range) && !stillCovered(ms)) dropIds.add(id);
    }
    if (!dropIds.size) return;
    setHydratedVouchers((prev) => prev.filter((row) => !dropIds.has(String(row?.id || "").trim())));
    setScopedVoucherIds((prev) => {
      const next = new Set(prev);
      for (const id of dropIds) next.delete(id);
      return next;
    });
  }, []);

  const requestLoadFyKey = useCallback(
    async (fyKey: string, country?: string) => {
      const range = fiscalYearRangeForKey(country, fyKey);
      if (!range) return [];
      return requestLoadRange(range, fyKey);
    },
    [requestLoadRange]
  );

  const value = useMemo(
    () => ({
      enabled,
      activeScope,
      loadedRanges,
      scopedVoucherIds,
      openingBalances,
      openingBalancesLoadStatus,
      hydratedVouchers,
      setActiveScope,
      applyOpeningBalances,
      setOpeningBalancesLoading,
      applyOpeningHydrateResult,
      requestLoadRange,
      requestLoadFyKey,
      requestLoadTransientRange,
      evictTransientRange,
      mergeHydratedVouchers,
      patchHydratedVouchers,
      registerInMemoryVoucherIds,
      resetScopeState,
    }),
    [
      enabled,
      activeScope,
      loadedRanges,
      scopedVoucherIds,
      openingBalances,
      openingBalancesLoadStatus,
      hydratedVouchers,
      requestLoadRange,
      requestLoadFyKey,
      requestLoadTransientRange,
      evictTransientRange,
      mergeHydratedVouchers,
      patchHydratedVouchers,
      registerInMemoryVoucherIds,
      applyOpeningBalances,
      setOpeningBalancesLoading,
      applyOpeningHydrateResult,
      resetScopeState,
    ]
  );

  return <FyVoucherScopeContext.Provider value={value}>{children}</FyVoucherScopeContext.Provider>;
}

export function useFyVoucherScope(): FyVoucherScopeContextValue {
  const ctx = useContext(FyVoucherScopeContext);
  if (!ctx) {
    return {
      enabled: false,
      activeScope: null,
      loadedRanges: [],
      scopedVoucherIds: new Set(),
      openingBalances: {},
      openingBalancesLoadStatus: "idle",
      hydratedVouchers: [],
      setActiveScope: () => {},
      applyOpeningBalances: () => {},
      setOpeningBalancesLoading: () => {},
      applyOpeningHydrateResult: () => {},
      requestLoadRange: async () => [],
      requestLoadFyKey: async () => [],
      requestLoadTransientRange: async () => [],
      evictTransientRange: () => {},
      mergeHydratedVouchers: () => {},
      patchHydratedVouchers: () => {},
      registerInMemoryVoucherIds: () => {},
      resetScopeState: () => {},
    };
  }
  return ctx;
}

/** Apply prior period closing snapshot when active scope changes. */
export async function hydrateOpeningFromSnapshot(
  companyId: string,
  scope: FyActiveScope,
  company?: { country?: string; authoritativeCompanyId?: string | null } | null
): Promise<LedgerOpeningHydrateResult> {
  return hydrateLedgerOpeningBalances({ company, companyId, scope });
}

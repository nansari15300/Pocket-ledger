"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import {
  applyFyLoadForLedgerDateRange,
  ledgerDateRangeLoadKey,
  type LedgerDateRangeInput,
} from "@/lib/fyPagination/ledgerDateRangeLoad";

/**
 * Ledger pages: date-range UI → FY hydrate (SQLite + online) + server opening snapshot.
 * Default scope on mount: bootstrap handles; active FY/date filter on mount (URL refresh): load here.
 */
export function useFyLoadOnDateRangeChange(dateRange?: LedgerDateRangeInput): void {
  const { company } = useCompany();
  const fy = useFyVoucherScope();
  const lastKeyRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const companyRef = useRef(company);
  const fyRef = useRef(fy);
  companyRef.current = company;
  fyRef.current = fy;

  const fromMs = dateRange?.from?.getTime();
  const toMs = dateRange?.to?.getTime();

  useEffect(() => {
    lastKeyRef.current = null;
    loadingRef.current = false;
  }, [company?.id]);

  useEffect(() => {
    const key = ledgerDateRangeLoadKey(dateRange);
    const isDefaultKey = key === "default";

    const isFirstMount = lastKeyRef.current === null;
    if (!isFirstMount && lastKeyRef.current === key) return;

    // "Last 10" / clear filter: default scope reload in-flight range load se block na ho.
    if (loadingRef.current && !isDefaultKey) return;

    // Default scope: FyVoucherScopeBootstrap handles opening on company boot.
    if (isFirstMount && isDefaultKey) {
      lastKeyRef.current = key;
      return;
    }

    lastKeyRef.current = key;
    loadingRef.current = true;

    void applyFyLoadForLedgerDateRange({
      company: companyRef.current,
      fy: fyRef.current,
      dateRange,
    })
      .catch((err) => {
        console.warn("[useFyLoadOnDateRangeChange]", err);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [company?.id, fromMs, toMs]);
}

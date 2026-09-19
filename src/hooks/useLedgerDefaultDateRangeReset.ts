"use client";

import { useCallback } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import { applyDefaultFyLedgerScope } from "@/lib/fyPagination/ledgerDateRangeLoad";

/** Calendar "Last 10" preset — clear explicit filter and reload default current-month + backfill scope. */
export function useLedgerDefaultDateRangeReset(
  onDateRangeChange: (range: undefined) => void
): () => void {
  const { company } = useCompany();
  const fy = useFyVoucherScope();

  return useCallback(() => {
    onDateRangeChange(undefined);
    void applyDefaultFyLedgerScope({ company, fy }).catch((err) => {
      console.warn("[useLedgerDefaultDateRangeReset]", err);
    });
  }, [company, fy, onDateRangeChange]);
}

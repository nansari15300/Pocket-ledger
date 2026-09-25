"use client";

import { useCallback } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import { applyDefaultFyLedgerScope } from "@/lib/fyPagination/ledgerDateRangeLoad";
import {
  applyMasterLedgerLast10TailView,
  type LedgerPaginationResetHandlers,
} from "@/lib/ledgerLast10View";

/** Calendar "Last 10" — clear date filter, tail page = 10 txns, reload default FY voucher scope. */
export function useLedgerDefaultDateRangeReset(
  onDateRangeChange: (range: undefined) => void,
  pagination?: LedgerPaginationResetHandlers | null
): () => void {
  const { company } = useCompany();
  const fy = useFyVoucherScope();

  return useCallback(() => {
    onDateRangeChange(undefined);
    applyMasterLedgerLast10TailView(pagination);
    void applyDefaultFyLedgerScope({ company, fy }).catch((err) => {
      console.warn("[useLedgerDefaultDateRangeReset]", err);
    });
  }, [company, fy, onDateRangeChange, pagination]);
}

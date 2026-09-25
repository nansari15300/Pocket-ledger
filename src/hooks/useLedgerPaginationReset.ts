"use client";

import { useMemo } from "react";
import type { LedgerPaginationResetHandlers } from "@/lib/ledgerLast10View";

/** Pass to `BsDatePicker` / `MasterLedgerDateRangePresetRow` for "Last 10" tail paging. */
export function useLedgerPaginationReset(
  setRowsPerPage: (value: number) => void,
  setCurrentPage: (value: number) => void
): LedgerPaginationResetHandlers {
  return useMemo(
    () => ({ setRowsPerPage, setCurrentPage }),
    [setRowsPerPage, setCurrentPage]
  );
}

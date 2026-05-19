"use client";

import { useCallback, useState } from "react";
import type { DateRange } from "@/components/ui/ad-calendar";
import { filterLedgerUnapprovedOnly } from "@/lib/ledgerPendingApproval";

/** PC detail/group ledger: Unapproved button → all-time + sirf `isApproved !== true` rows (pink table tint). */
export function useLedgerUnapprovedOnlyFilter({
  onDateRangeChange,
  setCurrentPage,
  setFilters,
  setActiveFilter,
}: {
  onDateRangeChange?: (range: DateRange | undefined) => void;
  setCurrentPage: (page: number) => void;
  setFilters?: (filters: Record<string, string>) => void;
  setActiveFilter?: (key: string | null) => void;
}) {
  const [unapprovedOnly, setUnapprovedOnly] = useState(false);

  const toggleUnapprovedOnly = useCallback(() => {
    setUnapprovedOnly((prev) => {
      const next = !prev;
      if (next) {
        onDateRangeChange?.(undefined);
        setFilters?.({});
        setActiveFilter?.(null);
        setCurrentPage(1);
      }
      return next;
    });
  }, [onDateRangeChange, setCurrentPage, setFilters, setActiveFilter]);

  const filterByUnapprovedOnly = useCallback(
    <T extends { isApproved?: boolean }>(list: T[]) =>
      filterLedgerUnapprovedOnly(list, unapprovedOnly),
    [unapprovedOnly]
  );

  /** Date change par unapproved mode band — warna date filter silently ignore ho jata. */
  const onDateRangeChangeWithUnapprovedReset = useCallback(
    (range: DateRange | undefined) => {
      if (unapprovedOnly) setUnapprovedOnly(false);
      onDateRangeChange?.(range);
    },
    [onDateRangeChange, unapprovedOnly]
  );

  return {
    unapprovedOnly,
    toggleUnapprovedOnly,
    filterByUnapprovedOnly,
    onDateRangeChangeWithUnapprovedReset,
  };
}

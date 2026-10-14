"use client";

import * as React from "react";
import { XCircle } from "lucide-react";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { ledgerMasterDateRangeLabel } from "@/lib/ledgerMasterDefaultView";

/** Merged header row 2 — Last 10 Txns / date range + clear (party txn shell). */
export function MobileMasterDetailHeaderDateSecondary({
  dateRange,
  onClear,
}: {
  dateRange?: DateRange;
  onClear: () => void;
}) {
  const { formatDate, formatDateBS, dateSystem } = useDate();

  const label = React.useMemo(() => {
    let explicitRangeText: string | undefined;
    const from = dateRange?.from;
    const to = dateRange?.to;
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;
      if (dateSystem === "AD") explicitRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === "BS") explicitRangeText = `BS: ${fromBS} to ${toBS}`;
      else explicitRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    return ledgerMasterDateRangeLabel(dateRange, explicitRangeText);
  }, [dateRange, formatDate, formatDateBS, dateSystem]);

  const hasFilter = dateRange?.from != null || dateRange?.to != null;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      {hasFilter ? (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear date filter"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

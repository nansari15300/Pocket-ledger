"use client";

import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";

type Props = {
  /** Master / books opening at entity create (or as stored on the account). */
  masterOpening: number;
  /** Opening for the current view: period brought forward (matches table’s first opening row), incl. date range. */
  periodOpeningBroughtForward: number;
  /** When true, we also show the view-start line (date filter or “to”-only). */
  hasDateFilter: boolean;
  className?: string;
};

/**
 * One line under the ledger title: books opening, and (when filtered) the balance at the start of the view.
 */
export function EntityLedgerOpeningHints({
  masterOpening,
  periodOpeningBroughtForward,
  hasDateFilter,
  className,
}: Props) {
  const { formatCurrency } = useDate();
  const showMaster = Math.abs(masterOpening) >= 0.0005;
  if (!showMaster && !hasDateFilter) return null;
  return (
    <p className={cn("text-[11px] sm:text-xs text-muted-foreground leading-tight", className)}>
      {showMaster && <span>Books opening: {formatCurrency(masterOpening, { showDrCr: true })}</span>}
      {hasDateFilter && (
        <span className={showMaster ? " · " : ""}>
          View start: {formatCurrency(periodOpeningBroughtForward, { showDrCr: true })}
        </span>
      )}
    </p>
  );
}

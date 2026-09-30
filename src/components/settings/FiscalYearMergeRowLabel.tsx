"use client";

import { cn } from "@/lib/utils";
import type { FiscalMergeDateSystem, FiscalMergeRowVisual, FiscalYearMergeRow } from "@/lib/fiscalMergeFySelection";
import { formatFiscalYearMergeRangeLabel } from "@/lib/fiscalMergeFySelection";

const EMPHASIS_CLASS = "font-semibold text-foreground";
const DIM_PART_CLASS = "opacity-40";

type Props = {
  row: FiscalYearMergeRow;
  visual: FiscalMergeRowVisual;
  country?: string;
  /** System date AD / BS / Both. */
  dateSystem?: FiscalMergeDateSystem | boolean;
  /** @deprecated use dateSystem */
  preferBs?: boolean;
  className?: string;
};

export function FiscalYearMergeRowLabel({
  row,
  visual,
  country,
  dateSystem,
  preferBs = false,
  className,
}: Props) {
  const system = dateSystem ?? preferBs;
  const rangeText = formatFiscalYearMergeRangeLabel(country, row.start, row.end, system);

  if (!row.hasTransactions) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        {rangeText}
      </span>
    );
  }

  if (visual.dimmed) {
    return (
      <span className={cn("opacity-40", className)}>
        {rangeText}
      </span>
    );
  }

  // Both: keep one range string; highlight whole label when either boundary is emphasized.
  if (system === "Both" || system === true) {
    const emphasize = visual.highlightStart || visual.highlightEnd;
    return (
      <span className={cn(emphasize ? EMPHASIS_CLASS : DIM_PART_CLASS, className)}>
        {rangeText}
      </span>
    );
  }

  const parts = rangeText.split(" To ");
  const startText = parts[0] ?? rangeText;
  const endText = parts.length > 1 ? parts.slice(1).join(" To ") : "";

  return (
    <span className={className}>
      <span className={visual.highlightStart ? EMPHASIS_CLASS : DIM_PART_CLASS}>{startText}</span>
      {endText ? (
        <>
          <span className={DIM_PART_CLASS}> To </span>
          <span className={visual.highlightEnd ? EMPHASIS_CLASS : DIM_PART_CLASS}>{endText}</span>
        </>
      ) : null}
    </span>
  );
}

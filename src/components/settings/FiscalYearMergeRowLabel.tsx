"use client";

import { cn } from "@/lib/utils";
import type { FiscalMergeRowVisual, FiscalYearMergeRow } from "@/lib/fiscalMergeFySelection";
import { formatFiscalYearMergeBoundaryDate } from "@/lib/fiscalMergeFySelection";

const EMPHASIS_CLASS = "font-semibold text-foreground";
const DIM_PART_CLASS = "opacity-40";

type Props = {
  row: FiscalYearMergeRow;
  visual: FiscalMergeRowVisual;
  country?: string;
  preferBs?: boolean;
  className?: string;
};

export function FiscalYearMergeRowLabel({
  row,
  visual,
  country,
  preferBs = false,
  className,
}: Props) {
  const startText = formatFiscalYearMergeBoundaryDate(country, row.start, preferBs);
  const endText = formatFiscalYearMergeBoundaryDate(country, row.end, preferBs);

  if (!row.hasTransactions) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        {startText} To {endText}
      </span>
    );
  }

  if (visual.dimmed) {
    return (
      <span className={cn("opacity-40", className)}>
        {startText} To {endText}
      </span>
    );
  }

  return (
    <span className={className}>
      <span className={visual.highlightStart ? EMPHASIS_CLASS : DIM_PART_CLASS}>{startText}</span>
      <span className={DIM_PART_CLASS}> To </span>
      <span className={visual.highlightEnd ? EMPHASIS_CLASS : DIM_PART_CLASS}>{endText}</span>
    </span>
  );
}

"use client";

import { cn } from "@/lib/utils";
import {
  buildFiscalMergePeriods,
  formatFiscalYearMergeBoundaryDate,
  type FiscalYearMergeRow,
} from "@/lib/fiscalMergeFySelection";

const TABLE_GRID = "grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-2";

type Props = {
  fyRows: FiscalYearMergeRow[];
  tickedFyKeys: Set<string>;
  country?: string;
  preferBs?: boolean;
  /** Parent renders S/N | FY row (full-width merged header layout). */
  hideHeader?: boolean;
  className?: string;
};

export function FiscalMergePeriodsPanel({
  fyRows,
  tickedFyKeys,
  country,
  preferBs = false,
  hideHeader = false,
  className,
}: Props) {
  const periods = buildFiscalMergePeriods(fyRows, tickedFyKeys);

  if (!periods.length) return null;

  return (
    <div className={cn("min-w-0", className)}>
      {!hideHeader && (
        <div className={cn(TABLE_GRID, "border-b border-emerald-400/60 pb-1.5 text-xs font-semibold text-muted-foreground")}>
          <span>S/N</span>
          <span>Fiscal Year</span>
        </div>
      )}
      <div className="divide-y divide-emerald-400/45">
        {periods.map((period) => {
          const startText = formatFiscalYearMergeBoundaryDate(country, period.start, preferBs);
          const endText = formatFiscalYearMergeBoundaryDate(country, period.end, preferBs);
          return (
            <div key={period.fyKeys.join("__")} className={cn(TABLE_GRID, "py-2 text-sm leading-snug")}>
              <span className="tabular-nums text-muted-foreground">{period.serial}</span>
              <span className="font-semibold text-foreground">
                {startText} To {endText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

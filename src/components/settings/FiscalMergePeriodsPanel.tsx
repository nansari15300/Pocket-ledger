"use client";

import { cn } from "@/lib/utils";
import {
  buildFiscalMergePeriods,
  formatFiscalYearMergeRangeLabel,
  type FiscalMergeDateSystem,
  type FiscalYearMergeRow,
} from "@/lib/fiscalMergeFySelection";

const TABLE_GRID = "grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-2";

type Props = {
  fyRows: FiscalYearMergeRow[];
  tickedFyKeys: Set<string>;
  country?: string;
  dateSystem?: FiscalMergeDateSystem | boolean;
  /** @deprecated use dateSystem */
  preferBs?: boolean;
  /** Parent renders S/N | FY row (full-width merged header layout). */
  hideHeader?: boolean;
  className?: string;
};

export function FiscalMergePeriodsPanel({
  fyRows,
  tickedFyKeys,
  country,
  dateSystem,
  preferBs = false,
  hideHeader = false,
  className,
}: Props) {
  const periods = buildFiscalMergePeriods(fyRows, tickedFyKeys);
  const system = dateSystem ?? preferBs;

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
          const rangeText = formatFiscalYearMergeRangeLabel(country, period.start, period.end, system);
          return (
            <div key={period.fyKeys.join("__")} className={cn(TABLE_GRID, "py-2 text-sm leading-snug")}>
              <span className="tabular-nums text-muted-foreground">{period.serial}</span>
              <span className="font-semibold text-foreground">{rangeText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

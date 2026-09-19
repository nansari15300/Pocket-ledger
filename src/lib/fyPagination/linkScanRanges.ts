import {
  currentFiscalYearRange,
  fiscalYearRangeForKey,
  monthPeriodKey,
  monthsInFiscalYear,
} from "@/lib/fyPagination/periodBounds";
import type { FyActiveScope, FyDateRangeMs } from "@/lib/fyPagination/types";

/** Ranges to scan for unloaded bill-wise link targets (archived FY + prior months for online). */
export function buildLinkCandidateScanRanges(params: {
  country?: string;
  activeScope: FyActiveScope;
  archivedFyKeys: string[];
  today?: Date;
}): FyDateRangeMs[] {
  const { country, activeScope, archivedFyKeys, today = new Date() } = params;
  const ranges: FyDateRangeMs[] = [];

  for (const fyKey of archivedFyKeys) {
    const r = fiscalYearRangeForKey(country, fyKey);
    if (r) ranges.push(r);
  }

  if (
    activeScope.policy === "current_month" ||
    activeScope.policy === "online_current_month"
  ) {
    const activeMonthKey = activeScope.periodKey;
    for (const m of monthsInFiscalYear(country, today)) {
      const key = monthPeriodKey(new Date(m.fromMs));
      if (key === activeMonthKey) continue;
      const fy = currentFiscalYearRange(country, today);
      if (m.fromMs >= fy.fromMs && m.toMs <= fy.toMs) {
        ranges.push(m);
      }
    }
  }

  return ranges;
}

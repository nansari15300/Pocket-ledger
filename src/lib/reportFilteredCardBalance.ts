import { startOfDay } from "date-fns";

export type ComputeFilteredCardBalanceParams = {
  allTimeTransactions?: any[] | null;
  periodTransactions: any[];
  fromDate?: Date | null;
  filterKey: string | null;
  matchesFilter: (t: any) => boolean;
};

export type ComputeFilteredCardBalanceResult = {
  filteredOpening: number;
  recomputedRows: any[];
  filteredPeriodDr: number;
  filteredPeriodCr: number;
  filteredClosing: number;
};

/**
 * When a report summary card filter is selected (e.g. "payment out", "sales", "purchases"):
 * 1. Book opening is hidden.
 * 2. Dated opening before `fromDate` is derived ONLY from transactions matching the filter.
 * 3. Each row's running balance is derived ONLY from the filtered rows.
 * 4. FY partition openings are derived ONLY from the filtered rows.
 */
export function computeFilteredCardOpeningAndRows(
  params: ComputeFilteredCardBalanceParams
): ComputeFilteredCardBalanceResult | null {
  const { allTimeTransactions, periodTransactions, fromDate, filterKey, matchesFilter } = params;

  if (!filterKey) {
    return null;
  }

  // 1. Calculate opening balance before fromDate from all-time transactions matching this filter
  let filteredOpening = 0;
  if (fromDate && allTimeTransactions?.length) {
    const fromMs = startOfDay(fromDate).getTime();
    for (const t of allTimeTransactions) {
      if (!t || t.type === "opening_balance" || (t as any)._spendWiseSpacer) continue;
      const raw = t.date;
      const d =
        raw instanceof Date
          ? raw
          : typeof raw?.toDate === "function"
            ? raw.toDate()
            : raw
              ? new Date(raw)
              : null;
      if (d && !isNaN(d.getTime()) && startOfDay(d).getTime() < fromMs) {
        if (matchesFilter(t)) {
          filteredOpening += (Number(t.debit) || 0) - (Number(t.credit) || 0);
        }
      }
    }
  }

  // 2. Recompute running balance for period transactions matching this filter
  let running = filteredOpening;
  let periodDr = 0;
  let periodCr = 0;
  const recomputedRows: any[] = [];

  for (const t of periodTransactions) {
    if (!matchesFilter(t)) continue;
    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    periodDr += debit;
    periodCr += credit;
    running += debit - credit;
    recomputedRows.push({
      ...t,
      balance: running,
      runningBalance: running,
    });
  }

  return {
    filteredOpening,
    recomputedRows,
    filteredPeriodDr: periodDr,
    filteredPeriodCr: periodCr,
    filteredClosing: running,
  };
}

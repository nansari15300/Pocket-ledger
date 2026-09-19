"use client";

import { startOfDay, startOfMonth, subMonths } from "date-fns";
import {
  currentFiscalYearRange,
  currentMonthRange,
  monthPeriodKey,
  priorFyKeyFromRunning,
  resolveDefaultCurrentMonthScope,
  runningFyKey,
} from "@/lib/fyPagination/periodBounds";
import { openingBoundaryPeriodKey } from "@/lib/fyPagination/openingBoundaryKeys";
import { countVouchersInDateRange } from "@/lib/fyPagination/voucherQueries";
import type { FyActiveScope, FyDateRangeMs } from "@/lib/fyPagination/types";

/** Minimum company txns to load in default scope before stopping month backfill. */
export const FY_SCOPE_MIN_TXN = 10;

/**
 * Start at current month; if txn count < min, walk backward month-by-month.
 * Crosses FY when needed so default master view can show last N company txns.
 */
export async function buildScopeWithMinTxnsInFy(params: {
  companyId: string;
  country?: string;
  today?: Date;
  minTxn?: number;
}): Promise<FyActiveScope> {
  const { companyId, country, today = new Date(), minTxn = FY_SCOPE_MIN_TXN } = params;
  const base = resolveDefaultCurrentMonthScope(country, today);
  const fyRange = currentFiscalYearRange(country, today);
  const absoluteFloorMs = startOfDay(startOfMonth(subMonths(today, MAX_DEFAULT_SCOPE_MONTHS_BACK))).getTime();

  let effectiveRange: FyDateRangeMs = { ...base.range };
  let count = await countVouchersInDateRange(companyId, effectiveRange);

  if (count >= minTxn) {
    return finalizeMinTxnScope(base, effectiveRange, today, fyRange, country);
  }

  let monthCursor = subMonths(today, 1);
  let iterations = 0;
  while (count < minTxn && iterations < MAX_DEFAULT_SCOPE_MONTHS_BACK) {
    iterations++;
    const monthStartMs = startOfDay(startOfMonth(monthCursor)).getTime();
    if (monthStartMs < absoluteFloorMs) break;

    effectiveRange = {
      fromMs: monthStartMs,
      toMs: effectiveRange.toMs,
    };
    count = await countVouchersInDateRange(companyId, effectiveRange);
    if (count >= minTxn) break;

    monthCursor = subMonths(monthCursor, 1);
  }

  return finalizeMinTxnScope(base, effectiveRange, today, fyRange, country);
}

const MAX_DEFAULT_SCOPE_MONTHS_BACK = 120;

function finalizeMinTxnScope(
  base: FyActiveScope,
  effectiveRange: FyDateRangeMs,
  today: Date,
  fyRange: FyDateRangeMs,
  country?: string
): FyActiveScope {
  const openingSnapshotId = resolveOpeningSnapshotId({
    country,
    today,
    effectiveRange,
    fyRange,
  });
  return {
    ...base,
    range: effectiveRange,
    openingSnapshotId,
    /** Match widened range so prior-FY vouchers are not clipped by scope filter. */
    fyFloorMs: effectiveRange.fromMs,
  };
}

function resolveOpeningSnapshotId(params: {
  country?: string;
  today: Date;
  effectiveRange: FyDateRangeMs;
  fyRange: FyDateRangeMs;
}): string | null {
  const { country, today, effectiveRange, fyRange } = params;
  if (effectiveRange.fromMs <= fyRange.fromMs) {
    return priorFyKeyFromRunning(runningFyKey(country, today));
  }
  return openingBoundaryPeriodKey(effectiveRange.fromMs);
}

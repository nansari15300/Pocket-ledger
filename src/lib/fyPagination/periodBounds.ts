import {
  addMonths,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { getAnusuchi13FyKey, getFiscalRangeForFyKey } from "@/lib/reports/anusuchi13Confirmation";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";
import type { FyDateRangeMs, FyPeriodKind } from "@/lib/fyPagination/types";

export function monthPeriodKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function currentMonthRange(today = new Date()): FyDateRangeMs {
  const start = startOfDay(startOfMonth(today));
  const end = endOfDay(endOfMonth(today));
  return { fromMs: start.getTime(), toMs: end.getTime() };
}

export function priorMonthRange(today = new Date()): FyDateRangeMs {
  const prior = subMonths(today, 1);
  const start = startOfDay(startOfMonth(prior));
  const end = endOfDay(endOfMonth(prior));
  return { fromMs: start.getTime(), toMs: end.getTime() };
}

export function currentFiscalYearRange(country?: string, today = new Date()): FyDateRangeMs {
  const { start, end } = getFiscalRangeForCountry(country, today);
  return {
    fromMs: startOfDay(start).getTime(),
    toMs: endOfDay(end).getTime(),
  };
}

export function fiscalYearRangeForKey(country?: string, fyKey?: string): FyDateRangeMs | null {
  if (!fyKey?.trim()) return null;
  const { start, end } = getFiscalRangeForFyKey(country, fyKey);
  return {
    fromMs: startOfDay(start).getTime(),
    toMs: endOfDay(end).getTime(),
  };
}

export function runningFyKey(country?: string, today = new Date()): string {
  return getAnusuchi13FyKey(country, today);
}

export function snapshotPeriodKey(kind: FyPeriodKind, date: Date, country?: string): string {
  if (kind === "month") return monthPeriodKey(date);
  return getAnusuchi13FyKey(country, date);
}

/** Default for online + local: current calendar month; opening = prior month closing snapshot. */
export function resolveDefaultCurrentMonthScope(country?: string, today = new Date()) {
  const range = currentMonthRange(today);
  const openingKey = snapshotPeriodKey("month", subMonths(today, 1), country);
  const fyRange = currentFiscalYearRange(country, today);
  return {
    policy: "current_month" as const,
    periodKind: "month" as const,
    periodKey: monthPeriodKey(today),
    range,
    openingSnapshotId: openingKey,
    fyFloorMs: fyRange.fromMs,
  };
}

/** @deprecated Use resolveDefaultCurrentMonthScope */
export function resolveOnlineDefaultScope(country?: string, today = new Date()) {
  return resolveDefaultCurrentMonthScope(country, today);
}

/** @deprecated Local companies now use current month (same as online). */
export function resolveLocalDefaultScope(country?: string, today = new Date()) {
  return resolveDefaultCurrentMonthScope(country, today);
}

export function priorFyKeyFromRunning(fyKey: string): string | null {
  const parts = fyKey.split("-").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return `${parts[0] - 1}-${parts[1] - 1}`;
}

export function monthsInFiscalYear(country?: string, today = new Date()): FyDateRangeMs[] {
  const { start, end } = getFiscalRangeForCountry(country, today);
  const out: FyDateRangeMs[] = [];
  let cursor = startOfMonth(start);
  const endMonth = startOfMonth(end);
  while (cursor.getTime() <= endMonth.getTime()) {
    out.push({
      fromMs: startOfDay(startOfMonth(cursor)).getTime(),
      toMs: endOfDay(endOfMonth(cursor)).getTime(),
    });
    cursor = addMonths(cursor, 1);
  }
  return out;
}

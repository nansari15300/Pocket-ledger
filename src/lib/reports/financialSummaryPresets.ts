import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
  subYears,
  differenceInCalendarDays,
} from "date-fns";
import { atNoonAd } from "@/lib/bsDateRangePresets";
import { getFiscalRangeForCountry } from "@/lib/fiscalRange";

export type FinancialSummaryPeriodPreset =
  | "this_fy"
  | "previous_fy"
  | "this_month"
  | "previous_month"
  | "this_quarter"
  | "previous_quarter"
  | "custom";

export type FinancialSummaryComparisonMode =
  | "none"
  | "previous_period"
  | "previous_fy";

export type FinancialSummaryDateRange = {
  from: Date;
  to: Date;
};

export const FINANCIAL_SUMMARY_PERIOD_PRESETS: {
  key: FinancialSummaryPeriodPreset;
  label: string;
}[] = [
  { key: "this_fy", label: "This Financial Year" },
  { key: "previous_fy", label: "Previous Financial Year" },
  { key: "this_month", label: "This Month" },
  { key: "previous_month", label: "Previous Month" },
  { key: "this_quarter", label: "This Quarter" },
  { key: "previous_quarter", label: "Previous Quarter" },
  { key: "custom", label: "Custom" },
];

export const FINANCIAL_SUMMARY_COMPARISON_OPTIONS: {
  key: FinancialSummaryComparisonMode;
  label: string;
}[] = [
  { key: "previous_period", label: "Previous Period" },
  { key: "previous_fy", label: "Previous Financial Year" },
  { key: "none", label: "None" },
];

function quarterBounds(base: Date): { start: Date; end: Date } {
  const month = base.getMonth();
  const qStartMonth = Math.floor(month / 3) * 3;
  const start = startOfMonth(new Date(base.getFullYear(), qStartMonth, 1));
  const end = endOfMonth(new Date(base.getFullYear(), qStartMonth + 2, 1));
  return { start, end };
}

export function financialSummaryRangeFromPreset(
  preset: FinancialSummaryPeriodPreset,
  options: { country?: string | null; anchor?: Date }
): FinancialSummaryDateRange | undefined {
  if (preset === "custom") return undefined;

  const today = options.anchor ?? new Date();

  switch (preset) {
    case "this_fy": {
      const { start, end } = getFiscalRangeForCountry(options.country ?? "Nepal", today);
      return { from: atNoonAd(start), to: atNoonAd(end) };
    }
    case "previous_fy": {
      const { start } = getFiscalRangeForCountry(options.country ?? "Nepal", today);
      const prevAnchor = subDays(startOfDay(start), 1);
      const { start: ps, end: pe } = getFiscalRangeForCountry(
        options.country ?? "Nepal",
        prevAnchor
      );
      return { from: atNoonAd(ps), to: atNoonAd(pe) };
    }
    case "this_month":
      return {
        from: atNoonAd(startOfMonth(today)),
        to: atNoonAd(endOfMonth(today)),
      };
    case "previous_month": {
      const prev = subMonths(today, 1);
      return {
        from: atNoonAd(startOfMonth(prev)),
        to: atNoonAd(endOfMonth(prev)),
      };
    }
    case "this_quarter": {
      const { start, end } = quarterBounds(today);
      return { from: atNoonAd(start), to: atNoonAd(end) };
    }
    case "previous_quarter": {
      const { start } = quarterBounds(today);
      const prevAnchor = subDays(startOfDay(start), 1);
      const { start: ps, end: pe } = quarterBounds(prevAnchor);
      return { from: atNoonAd(ps), to: atNoonAd(pe) };
    }
    default:
      return undefined;
  }
}

/** Mirror current range length immediately before `from`. */
export function previousPeriodComparisonRange(
  range: FinancialSummaryDateRange
): FinancialSummaryDateRange {
  const from = startOfDay(range.from);
  const to = endOfDay(range.to);
  const days = Math.max(1, differenceInCalendarDays(to, from) + 1);
  const compTo = endOfDay(subDays(from, 1));
  const compFrom = startOfDay(subDays(compTo, days - 1));
  return { from: atNoonAd(compFrom), to: atNoonAd(compTo) };
}

export function previousFyComparisonRange(
  range: FinancialSummaryDateRange,
  country?: string | null
): FinancialSummaryDateRange {
  const anchor = subYears(startOfDay(range.from), 1);
  const { start, end } = getFiscalRangeForCountry(country ?? "Nepal", anchor);
  return { from: atNoonAd(start), to: atNoonAd(end) };
}

export function resolveComparisonRange(
  mode: FinancialSummaryComparisonMode,
  period: FinancialSummaryDateRange,
  country?: string | null
): FinancialSummaryDateRange | undefined {
  if (mode === "none") return undefined;
  if (mode === "previous_period") return previousPeriodComparisonRange(period);
  if (mode === "previous_fy") return previousFyComparisonRange(period, country);
  return undefined;
}

export type PercentChangeResult =
  | { kind: "percent"; value: number }
  | { kind: "new" }
  | { kind: "none" };

export function computePercentChange(
  current: number,
  previous: number | undefined
): PercentChangeResult {
  if (previous === undefined) return { kind: "none" };
  if (Math.abs(previous) < 0.005) {
    if (Math.abs(current) < 0.005) return { kind: "none" };
    return { kind: "new" };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(pct)) return { kind: "none" };
  return { kind: "percent", value: pct };
}

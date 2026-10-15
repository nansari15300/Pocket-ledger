import type { DateRange } from "@/components/ui/ad-calendar";
import {
  getCurrentMonthDateRange,
  isCurrentMonthDateRange,
  type MonthYearFilterMode,
} from "@/components/dashboard/MonthYearFilter";
import { startOfDay, endOfDay } from "date-fns";
import {
  formatAnusuchi13FyRangeLabel,
  getFiscalRangeForFyKey,
} from "@/lib/reports/anusuchi13Confirmation";
import type { resolveCompanyFiscalYearDates } from "@/lib/companyFyVoucherSuggestion";

export type DashboardSummaryFyPick = "current" | "all" | string;
export type DashboardSummaryPeriodPick = "fy_full" | "current_month";

export type DashboardSummaryCardScope = {
  fyPick: DashboardSummaryFyPick;
  periodPick: DashboardSummaryPeriodPick;
  dateRange: DateRange | undefined;
};

export type DashboardScopeApplyPayload = {
  applyOnAll: boolean;
  fyPick: DashboardSummaryFyPick;
  mode: MonthYearFilterMode;
  dateRange: DateRange | undefined;
};

export function defaultDashboardSummaryCardScope(dateSystem: string): DashboardSummaryCardScope {
  return {
    fyPick: "current",
    periodPick: "current_month",
    dateRange: getCurrentMonthDateRange(dateSystem),
  };
}

export function dashboardScopeToFilterMode(scope: DashboardSummaryCardScope): MonthYearFilterMode {
  if (scope.periodPick === "current_month") return "current";
  if (!scope.dateRange?.from) {
    if (scope.fyPick === "all") return "all";
    return "full_fy";
  }
  return "custom";
}

type ScopeContext = {
  dateSystem: string;
  runningFyKey: string;
  companyCountry: string;
  companyFyDates: ReturnType<typeof resolveCompanyFiscalYearDates>;
};

export function computeDashboardScopeEffectiveRange(
  scope: DashboardSummaryCardScope,
  ctx: ScopeContext,
): { from: Date; to: Date } | null {
  const monthOnly = () => {
    const m = getCurrentMonthDateRange(ctx.dateSystem);
    if (!m?.from) return null;
    return {
      from: startOfDay(m.from),
      to: endOfDay(m.to ?? m.from),
    };
  };
  if (scope.fyPick === "all") {
    return scope.periodPick === "current_month" ? monthOnly() : null;
  }
  const fyKey = scope.fyPick === "current" ? ctx.runningFyKey : scope.fyPick;
  const { start, end } = getFiscalRangeForFyKey(ctx.companyCountry, fyKey, ctx.companyFyDates);
  const fyFrom = startOfDay(start);
  const fyTo = endOfDay(end);
  if (scope.periodPick !== "current_month") {
    return { from: fyFrom, to: fyTo };
  }
  const month = monthOnly();
  if (!month) return { from: fyFrom, to: fyTo };
  const from = month.from > fyFrom ? month.from : fyFrom;
  const to = month.to < fyTo ? month.to : fyTo;
  return { from, to };
}

function voucherDateInScopeRange(
  txDate: Date | null,
  scope: DashboardSummaryCardScope,
  ctx: ScopeContext,
): boolean {
  if (!txDate) return false;
  const effective = computeDashboardScopeEffectiveRange(scope, ctx);
  if (effective && (txDate < effective.from || txDate > effective.to)) return false;
  if (scope.dateRange?.from) {
    const fromDate = startOfDay(scope.dateRange.from);
    const toDate = endOfDay(scope.dateRange.to ?? scope.dateRange.from);
    if (txDate < fromDate || txDate > toDate) return false;
  }
  return true;
}

export function filterVouchersByDashboardScope<T extends { date?: unknown }>(
  vouchers: T[] | undefined,
  scope: DashboardSummaryCardScope,
  ctx: ScopeContext,
  safeToDate: (raw: unknown) => Date | null,
): T[] {
  return (vouchers || []).filter((v) => voucherDateInScopeRange(safeToDate(v.date), scope, ctx));
}

export function entityMasterDateInDashboardScope(
  d: Date | null | undefined,
  scope: DashboardSummaryCardScope,
  ctx: ScopeContext,
): boolean {
  if (!d) return false;
  const effective = computeDashboardScopeEffectiveRange(scope, ctx);
  if (effective && (d < effective.from || d > effective.to)) return false;
  if (scope.periodPick === "current_month") return true;
  if (scope.dateRange?.from) {
    const fromDate = startOfDay(scope.dateRange.from);
    const toDate = endOfDay(scope.dateRange.to ?? scope.dateRange.from);
    return d >= fromDate && d <= toDate;
  }
  return true;
}

export function buildDashboardScopeFromApply(
  payload: DashboardScopeApplyPayload,
  dateSystem: string,
): DashboardSummaryCardScope {
  const { fyPick, mode, dateRange } = payload;
  if (mode === "current") {
    return {
      fyPick,
      periodPick: "current_month",
      dateRange: getCurrentMonthDateRange(dateSystem),
    };
  }
  if (mode === "full_fy") {
    return { fyPick, periodPick: "fy_full", dateRange: undefined };
  }
  if (mode === "all") {
    return { fyPick: "all", periodPick: "fy_full", dateRange: undefined };
  }
  return { fyPick, periodPick: "fy_full", dateRange };
}

export function formatDashboardScopeHint(
  scope: DashboardSummaryCardScope,
  ctx: ScopeContext & {
    formatDate: (d: Date) => string;
    formatDateBS: (d: Date) => string;
  },
): string {
  const effective = computeDashboardScopeEffectiveRange(scope, ctx);
  if (!effective) {
    return scope.fyPick === "all" ? "All FY · all dates" : "";
  }
  const fmt = (d: Date) => (ctx.dateSystem === "BS" ? ctx.formatDateBS(d) : ctx.formatDate(d));
  const range = `${fmt(effective.from)} → ${fmt(effective.to)}`;
  if (scope.periodPick === "current_month") {
    return `Current month (within FY) · ${range}`;
  }
  if (scope.fyPick === "all") return range;
  const fyKey = scope.fyPick === "current" ? ctx.runningFyKey : scope.fyPick;
  return `${formatAnusuchi13FyRangeLabel(ctx.companyCountry, fyKey, fmt)} · ${range}`;
}

export function migrateDashboardScopeOnDateSystemChange(
  scope: DashboardSummaryCardScope,
  previousDateSystem: string,
  nextDateSystem: string,
): DashboardSummaryCardScope {
  if (
    scope.periodPick === "current_month" &&
    isCurrentMonthDateRange(scope.dateRange, previousDateSystem)
  ) {
    return {
      ...scope,
      dateRange: getCurrentMonthDateRange(nextDateSystem),
    };
  }
  return scope;
}

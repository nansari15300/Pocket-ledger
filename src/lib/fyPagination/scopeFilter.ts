import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { monthPeriodKey } from "@/lib/fyPagination/periodBounds";
import type { FyActiveScope, FyDateRangeMs } from "@/lib/fyPagination/types";

function voucherJsDate(date: unknown): Date | null {
  if (!date) return null;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  if (typeof date === "object" && date !== null && "toDate" in date) {
    try {
      const d = (date as { toDate: () => Date }).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof date === "string" || typeof date === "number") {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function voucherMs(date: unknown): number | null {
  const d = voucherJsDate(date);
  return d ? d.getTime() : null;
}

export function isDateInRange(ms: number, range: FyDateRangeMs): boolean {
  return ms >= range.fromMs && ms <= range.toMs;
}

export function isVoucherInLoadedRanges(
  voucher: { date?: unknown },
  activeRange: FyDateRangeMs,
  loadedRanges: FyDateRangeMs[]
): boolean {
  const ms = voucherMs(voucher.date);
  if (ms == null) return false;
  if (isDateInRange(ms, activeRange)) return true;
  return loadedRanges.some((r) => isDateInRange(ms, r));
}

export function isVoucherInFyScope(
  voucher: { date?: unknown },
  scope: FyActiveScope,
  loadedRanges: FyDateRangeMs[]
): boolean {
  const ms = voucherMs(voucher.date);
  if (ms == null) return false;
  if (isDateInRange(ms, scope.range)) return true;
  return loadedRanges.some((r) => isDateInRange(ms, r));
}

export function mergeVouchersById<T extends { id?: string }>(...lists: T[][]): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) {
      const id = String(row?.id || "").trim();
      if (!id) continue;
      map.set(id, row);
    }
  }
  return [...map.values()];
}

function isDefaultMonthPolicy(policy: FyActiveScope["policy"]): boolean {
  return policy === "current_month" || policy === "online_current_month" || policy === "local_current_fy";
}

export function filterVouchersToFyScope<T extends { id?: string; date?: unknown }>(
  vouchers: T[],
  scope: FyActiveScope | null,
  loadedRanges: FyDateRangeMs[],
  extraIds?: Set<string>
): T[] {
  if (!scope) return vouchers;
  if (scope.policy === "full") return vouchers;
  const extras = extraIds ?? new Set<string>();
  const enforceFyFloor = isDefaultMonthPolicy(scope.policy) && scope.fyFloorMs != null;
  return vouchers.filter((v) => {
    const id = String(v.id || "").trim();
    if (id && extras.has(id)) return true;
    const ms = voucherMs(v.date);
    if (enforceFyFloor && ms != null && ms < scope.fyFloorMs!) return false;
    return isVoucherInFyScope(v, scope, loadedRanges);
  });
}

export function fyKeyForVoucher(country?: string, date?: unknown): string | null {
  const d = voucherJsDate(date);
  if (!d) return null;
  return getAnusuchi13FyKey(country, d);
}

export function monthKeyForVoucher(date?: unknown): string | null {
  const d = voucherJsDate(date);
  if (!d) return null;
  return monthPeriodKey(d);
}

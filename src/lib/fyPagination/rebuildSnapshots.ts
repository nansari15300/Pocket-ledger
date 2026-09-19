"use client";

import { startOfDay } from "date-fns";
import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import { fiscalYearRangeForKey, monthPeriodKey, snapshotPeriodKey } from "@/lib/fyPagination/periodBounds";
import { writeFyBalanceSnapshot } from "@/lib/fyPagination/snapshotStore";
import type { FyPeriodKind } from "@/lib/fyPagination/types";

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

/** Recompute party closing balances at period end from full voucher list (in-memory). */
export function computePartyClosingBalances(
  vouchers: Array<Record<string, unknown>>,
  country?: string,
  periodKind: FyPeriodKind = "month"
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const v of vouchers) {
    const d = voucherJsDate(v.date);
    if (!d) continue;
    const partyId = String(v.partyId || v.party_id || "").trim();
    if (!partyId) continue;
    const key =
      periodKind === "month"
        ? snapshotPeriodKey("month", d, country)
        : getAnusuchi13FyKey(country, d);
    if (!balances[`${key}::${partyId}`]) balances[`${key}::${partyId}`] = 0;
    const amount = Number(v.total ?? v.amount ?? 0) || 0;
    balances[`${key}::${partyId}`] += amount;
  }
  return balances;
}

/**
 * After back-date save: rebuild snapshot for affected month/FY so other devices get matched opening.
 */
export async function rebuildFySnapshotsAfterVoucherSave(params: {
  companyId: string;
  country?: string;
  vouchers: Array<Record<string, unknown>>;
  savedVoucherDate: Date;
  periodKind?: FyPeriodKind;
}): Promise<void> {
  const { companyId, country, vouchers, savedVoucherDate, periodKind = "month" } = params;
  const periodKey =
    periodKind === "month"
      ? monthPeriodKey(savedVoucherDate)
      : getAnusuchi13FyKey(country, savedVoucherDate);

  const range =
    periodKind === "month"
      ? null
      : fiscalYearRangeForKey(country, periodKey);

  const relevant = vouchers.filter((v) => {
    const d = voucherJsDate(v.date);
    if (!d) return false;
    if (periodKind === "month") return monthPeriodKey(d) === periodKey;
    if (!range) return false;
    const ms = startOfDay(d).getTime();
    return ms >= range.fromMs && ms <= range.toMs;
  });

  const balances = computePartyClosingBalances(relevant, country, periodKind);
  const closingAtMs =
    periodKind === "month"
      ? startOfDay(savedVoucherDate).getTime()
      : range?.toMs ?? startOfDay(savedVoucherDate).getTime();

  await writeFyBalanceSnapshot({
    companyId,
    periodKind,
    periodKey,
    closingAtMs,
    balances,
    updatedAtMs: Date.now(),
  });
}

import { getAnusuchi13FyKey } from "@/lib/reports/anusuchi13Confirmation";
import type { FyUnloadedLinkHint } from "@/lib/fyPagination/types";

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

/**
 * Link targets not in active memory but in SQLite → grouped by FY for Yes/No load prompt.
 */
export function detectUnloadedBillWiseLinkTargets(params: {
  country?: string;
  candidateVouchers: Array<{ id?: string; date?: unknown }>;
  inMemoryVoucherIds: Set<string>;
}): FyUnloadedLinkHint[] {
  const { country, candidateVouchers, inMemoryVoucherIds } = params;
  const byFy = new Map<string, Set<string>>();

  for (const v of candidateVouchers) {
    const id = String(v.id || "").trim();
    if (!id || inMemoryVoucherIds.has(id)) continue;
    const d = voucherJsDate(v.date);
    if (!d) continue;
    const fyKey = getAnusuchi13FyKey(country, d);
    const set = byFy.get(fyKey) ?? new Set<string>();
    set.add(id);
    byFy.set(fyKey, set);
  }

  const hints: FyUnloadedLinkHint[] = [];
  for (const [fyKey, ids] of byFy) {
    if (!ids.size) continue;
    hints.push({
      fyKey,
      voucherCount: ids.size,
      voucherIds: [...ids],
    });
  }

  return hints.sort((a, b) => a.fyKey.localeCompare(b.fyKey));
}

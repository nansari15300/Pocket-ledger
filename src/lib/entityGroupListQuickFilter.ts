import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";

function toDateMs(raw: unknown): number {
  if (!raw) return 0;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
  if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(raw as any);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

const isSettledBal = (n: number) => Math.abs(Number(n || 0)) < 1e-6;

/** Master group rows: name + balance (number or masked); optional openingBalanceDate for By Date. */
export type EntityGroupRowLike = {
  name?: string;
  balance?: unknown;
  openingBalanceDate?: unknown;
};

/**
 * Same rules as PartyList / AccountList footer: Default, Dr, Cr, By Name, By Date, Settled, Non Settled.
 * Non-numeric balance (e.g. bank group masked) counts as unsettled for settled filters; excluded from Dr/Cr.
 */
export function filterAndSortEntityGroups<T extends EntityGroupRowLike>(
  items: T[] | undefined,
  searchTerm: string,
  quickFilter: EntityListQuickFilter
): T[] {
  const list = (items || []).filter((row) => {
    if (!row.name) return false;
    if (!masterEntityTextMatchesSearch(row.name, searchTerm)) return false;

    const balRaw = row.balance;
    const bal = typeof balRaw === "number" && !Number.isNaN(balRaw) ? balRaw : null;

    if (quickFilter === "default" || quickFilter === "name" || quickFilter === "date") return true;
    if (quickFilter === "dr") return bal !== null && bal > 0;
    if (quickFilter === "cr") return bal !== null && bal < 0;
    if (quickFilter === "settled") return bal !== null && isSettledBal(bal);
    if (quickFilter === "non_settled") return bal === null || !isSettledBal(bal);
    return true;
  });

  const sorted = [...list].sort((a, b) => {
    if (quickFilter === "name") {
      return String(a.name || "").localeCompare(String(b.name || ""));
    }
    if (quickFilter === "date") {
      return toDateMs((b as any).openingBalanceDate) - toDateMs((a as any).openingBalanceDate);
    }
    const ba =
      typeof a.balance === "number" && !Number.isNaN(a.balance as number)
        ? Math.abs(a.balance as number)
        : 0;
    const bb =
      typeof b.balance === "number" && !Number.isNaN(b.balance as number)
        ? Math.abs(b.balance as number)
        : 0;
    return bb - ba;
  });

  return sorted;
}

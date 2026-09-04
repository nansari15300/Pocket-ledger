import type { EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";

/** PartyList jaisi date normalize — footer "By Date" sort. */
function toDateMs(raw: unknown): number {
  if (!raw) return 0;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
  if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d = new Date(raw as string | number);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

const epsSettled = 1e-6;
function isMasterListAmountSettled(n: unknown): boolean {
  const v = Number(n);
  if (Number.isNaN(v)) return false;
  return Math.abs(v) < epsSettled;
}

/** Tax / Income–Expense accounts: same footer toggles + sort as PartyList (`EntityListQuickFilterBar`). */
export type MasterEntityListRowLike = {
  name?: string;
  /** Signed amount for Dr/Cr / settled / default |balance| sort */
  balance?: unknown;
  openingBalanceDate?: unknown;
};

export function masterEntityTextMatchesSearch(text: unknown, searchTerm: string): boolean {
  const src = String(text || "").toLowerCase();
  const tokens = String(searchTerm || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return true;
  if (!src) return false;
  return tokens.every((token) => src.includes(token));
}

export function filterAndSortMasterEntityListRows<T extends MasterEntityListRowLike>(
  items: T[] | undefined,
  searchTerm: string,
  quickFilter: EntityListQuickFilter,
  options?: {
    /** Jaise Party — system rows list se hata dena */
    excludeRow?: (row: T) => boolean;
  }
): T[] {
  const exclude = options?.excludeRow;

  const list = (items || []).filter((row) => {
    if (exclude?.(row)) return false;
    if (!row.name) return false;
    if (!masterEntityTextMatchesSearch(row.name, searchTerm)) return false;

    const balRaw = row.balance;
    const bal = typeof balRaw === "number" && !Number.isNaN(balRaw) ? balRaw : null;

    if (quickFilter === "default" || quickFilter === "name" || quickFilter === "date") return true;
    if (quickFilter === "dr") return bal !== null && bal > 0;
    if (quickFilter === "cr") return bal !== null && bal < 0;
    if (quickFilter === "settled") return bal !== null && isMasterListAmountSettled(bal);
    if (quickFilter === "non_settled") return bal === null || !isMasterListAmountSettled(bal);
    return true;
  });

  return [...list].sort((a, b) => {
    if (quickFilter === "name") return String(a.name || "").localeCompare(String(b.name || ""));
    if (quickFilter === "date") return toDateMs(b.openingBalanceDate) - toDateMs(a.openingBalanceDate);
    const ba =
      typeof a.balance === "number" && !Number.isNaN(a.balance as number) ? Math.abs(a.balance as number) : 0;
    const bb =
      typeof b.balance === "number" && !Number.isNaN(b.balance as number) ? Math.abs(b.balance as number) : 0;
    return bb - ba;
  });
}

export function sumMasterEntityListDrCr<T extends { debit?: unknown; credit?: unknown }>(
  rows: T[]
): { debit: number; credit: number } {
  return rows.reduce(
    (acc, row) => ({
      debit: acc.debit + (Number(row.debit) || 0),
      credit: acc.credit + (Number(row.credit) || 0),
    }),
    { debit: 0, credit: 0 }
  );
}

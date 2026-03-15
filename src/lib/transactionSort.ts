/**
 * Sort transaction list by common fields (Statement / Bill wise / Spend wise).
 * Used by table footer sort dropdown across party, staff, account, etc.
 */

import type { TransactionSortBy, TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";

function getDate(t: any): number {
  const d = t?.date?.toDate ? t.date.toDate() : t?.date;
  if (d instanceof Date) return d.getTime();
  if (typeof d === "string") return new Date(d).getTime();
  return 0;
}

function getAmount(t: any): number {
  const debit = Number(t?.debit) || 0;
  const credit = Number(t?.credit) || 0;
  const amt = Number(t?.amount ?? t?.total) ?? 0;
  if (debit > 0 || credit > 0) return Math.max(debit, credit);
  return amt;
}

/** Outstanding for bill-wise (0 = settled). Lower first = settled first when asc. */
function getOutstanding(t: any): number {
  const out = Number(t?.outstanding) ?? NaN;
  if (!Number.isNaN(out)) return out;
  return Number(t?.balance ?? t?.runningBalance) ?? 0;
}

function getOverdueDays(t: any): number {
  return Number(t?.overdueDays) ?? 0;
}

/** 1 = partial, 0 = paid/settled, -1 = unpaid (for ordering). */
function getStatusOrder(t: any): number {
  const out = getOutstanding(t);
  const amt = getAmount(t);
  if (Math.abs(out) < 1e-6) return 0; // settled
  if (amt > 0 && out < amt) return 1; // partial
  return -1; // unpaid
}

export function sortTransactions<T = any>(
  list: T[],
  sortBy: TransactionSortBy,
  sortOrder: TransactionSortOrder
): T[] {
  if (!list.length) return list;
  const mult = sortOrder === "asc" ? 1 : -1;

  const compare = (a: T, b: T): number => {
    const ta = a as any;
    const tb = b as any;
    switch (sortBy) {
      case "date": {
        const da = getDate(ta);
        const db = getDate(tb);
        return mult * (da - db);
      }
      case "amount": {
        const aa = getAmount(ta);
        const ab = getAmount(tb);
        return mult * (aa - ab);
      }
      case "voucherNo": {
        const va = (ta?.voucherNumber ?? "").toString();
        const vb = (tb?.voucherNumber ?? "").toString();
        return mult * va.localeCompare(vb);
      }
      case "settled": {
        const oa = getOutstanding(ta);
        const ob = getOutstanding(tb);
        return mult * (oa - ob);
      }
      case "overdue": {
        const oa = getOverdueDays(ta);
        const ob = getOverdueDays(tb);
        return mult * (ob - oa); // overdue first when desc
      }
      case "partial": {
        const sa = getStatusOrder(ta);
        const sb = getStatusOrder(tb);
        return mult * (sa - sb);
      }
      default:
        return 0;
    }
  };

  return [...list].sort(compare);
}

/** Recompute running balance in current visible order (top to bottom), used after custom sorting in statement view. */
export function recomputeRunningBalanceTopToBottom<T = any>(list: T[], openingBalance: number): T[] {
  let running = Number(openingBalance) || 0;
  return (list || []).map((tx: any) => {
    if (tx?.type === "opening_balance") {
      const explicit = typeof tx?.runningBalance === "number" ? Number(tx.runningBalance) : running;
      running = explicit;
      return { ...tx, runningBalance: explicit, balance: explicit } as T;
    }
    running += (Number(tx?.debit) || 0) - (Number(tx?.credit) || 0);
    return { ...tx, runningBalance: running, balance: running } as T;
  });
}

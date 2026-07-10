/**
 * Sort transaction list by common fields (Statement / Bill wise / Spend wise).
 * Used by table footer sort dropdown across party, staff, account, etc.
 */

import { startOfDay } from "date-fns";
import type { TransactionSortBy, TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { getFiscalMergePartitionDateFromCompany, FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

/** Party/Bank/Staff/… statement footer: default `sortBy === "date"` ke saath ascending = purani date upar, nayi neeche. */
export const DEFAULT_TRANSACTION_SORT_ORDER: TransactionSortOrder = "asc";

function getDate(t: any): number {
  return parseFirestoreDateFieldToJsDate(t?.date)?.getTime() ?? 0;
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

function getCreatedAtTime(t: any): number {
  return parseFirestoreDateFieldToJsDate(t?.createdAt)?.getTime() ?? 0;
}

/** Optional: Recent / daybook jahan same date par naya voucher upar chahiye. */
export type SortTransactionsOptions = {
  tieBreakCreatedAtDesc?: boolean;
};

export function sortTransactions<T = any>(
  list: T[],
  sortBy: TransactionSortBy,
  sortOrder: TransactionSortOrder,
  options?: SortTransactionsOptions
): T[] {
  if (!list.length) return list;
  const mult = sortOrder === "asc" ? 1 : -1;

  const compare = (a: T, b: T): number => {
    const ta = a as any;
    const tb = b as any;
    let primary = 0;
    switch (sortBy) {
      case "date": {
        const da = getDate(ta);
        const db = getDate(tb);
        primary = mult * (da - db);
        break;
      }
      case "amount": {
        const aa = getAmount(ta);
        const ab = getAmount(tb);
        primary = mult * (aa - ab);
        break;
      }
      case "voucherNo": {
        const va = (ta?.voucherNumber ?? "").toString();
        const vb = (tb?.voucherNumber ?? "").toString();
        primary = mult * va.localeCompare(vb);
        break;
      }
      case "settled": {
        const oa = getOutstanding(ta);
        const ob = getOutstanding(tb);
        primary = mult * (oa - ob);
        break;
      }
      case "overdue": {
        const oa = getOverdueDays(ta);
        const ob = getOverdueDays(tb);
        primary = mult * (ob - oa); // overdue first when desc
        break;
      }
      case "partial": {
        const sa = getStatusOrder(ta);
        const sb = getStatusOrder(tb);
        primary = mult * (sa - sb);
        break;
      }
      default:
        primary = 0;
    }
    if (primary !== 0) return primary;
    if (options?.tieBreakCreatedAtDesc) return getCreatedAtTime(tb) - getCreatedAtTime(ta);
    return 0;
  };

  return [...list].sort(compare);
}

/**
 * Sirf current page ki rows par sort — poori list ka paging window same rahe (tail page 46–55 wahi rahe).
 * Running balance page opening se dubara compute hota hai display order me.
 */
export function sortAndRebalancePageTransactions<T = any>(
  pageRows: T[],
  openingForPage: number,
  sortBy: TransactionSortBy,
  sortOrder: TransactionSortOrder
): T[] {
  if (!pageRows?.length) return pageRows ?? [];
  const sorted = sortTransactions(pageRows, sortBy, sortOrder);
  return recomputeRunningBalanceTopToBottom(sorted, openingForPage);
}

/** Merge divider ke liye din — fiscalPartitionRows.rowSortTime jaisa (segment split). */
function transactionDayStartMs(t: any): number | null {
  if (!t || t.type === "opening_balance") return null;
  if (t.type === FISCAL_YEAR_PARTITION_ROW_TYPE) return null;
  const raw = t?.date;
  if (!raw) return null;
  const d = parseFirestoreDateFieldToJsDate(raw);
  if (!d || isNaN(d.getTime())) return null;
  return startOfDay(d).getTime();
}

/**
 * Merge mode + amount/voucher/bill-wise keys: globally sort se FY lines mix ho kar neela divider jump karta tha.
 * Pehle purana period block (partition se pehle), phir naya — har block ke andar chosen sort.
 * `date` sort pura list par hi (timeline).
 */
export function sortTransactionsWithFiscalMerge<T = any>(
  list: T[],
  sortBy: TransactionSortBy,
  sortOrder: TransactionSortOrder,
  options: SortTransactionsOptions | undefined,
  partitionAt: Date | null | undefined
): T[] {
  if (!list.length) return list;
  if (!partitionAt || isNaN(partitionAt.getTime()) || sortBy === "date") {
    return sortTransactions(list, sortBy, sortOrder, options);
  }
  const boundary = startOfDay(partitionAt).getTime();
  const noDay: T[] = [];
  const before: T[] = [];
  const after: T[] = [];
  for (const row of list) {
    const t = row as any;
    if (t?.type === FISCAL_YEAR_PARTITION_ROW_TYPE) continue;
    const day = transactionDayStartMs(t);
    if (day == null) {
      noDay.push(row);
      continue;
    }
    if (day < boundary) before.push(row);
    else after.push(row);
  }
  const sortSeg = (seg: T[]) => sortTransactions(seg, sortBy, sortOrder, options);
  return [...noDay, ...sortSeg(before), ...sortSeg(after)];
}

type FiscalCompanyLike = {
  fiscalSplitMode?: string;
  fiscalMergePartitionAt?: { toDate?: () => Date } | unknown;
};

/** Company merge partition nikaal kar `sortTransactionsWithFiscalMerge` — callers ko At pass na karna pade. */
export function sortTransactionsWithFiscalMergeForCompany<T = any>(
  list: T[],
  sortBy: TransactionSortBy,
  sortOrder: TransactionSortOrder,
  options: SortTransactionsOptions | undefined,
  company: FiscalCompanyLike | null | undefined
): T[] {
  const at = getFiscalMergePartitionDateFromCompany(company);
  return sortTransactionsWithFiscalMerge(list, sortBy, sortOrder, options, at);
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
    // Fiscal divider row: balance carry forward — na dr/cr change
    if (tx?.type === FISCAL_YEAR_PARTITION_ROW_TYPE) {
      return { ...tx, runningBalance: running, balance: running } as T;
    }
    running += (Number(tx?.debit) || 0) - (Number(tx?.credit) || 0);
    return { ...tx, runningBalance: running, balance: running } as T;
  });
}

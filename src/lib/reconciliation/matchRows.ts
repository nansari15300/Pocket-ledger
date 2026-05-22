import type {
  TransactionSortBy,
  TransactionSortOrder,
} from "@/components/vouchers/TransactionTableSortDropdown";
import type { ReconciliationLedgerRow, ReconciliationMatchPair } from "@/lib/reconciliation/types";

/** Same calendar day key (local). */
function dateKey(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** User rule: same date + same amount (debit/credit max side) se match. */
function matchSignature(row: ReconciliationLedgerRow): string {
  const dk = dateKey(row.rawDate);
  const amt = roundMoney(Math.max(row.debit || 0, row.credit || 0, row.amount || 0));
  return `${dk}|${amt}`;
}

/** Left/right ledger rows pair — matched rows same highlight ke liye. */
export function pairReconciliationRows(
  leftRows: ReconciliationLedgerRow[],
  rightRows: ReconciliationLedgerRow[]
): ReconciliationMatchPair[] {
  const rightQueues = new Map<string, number[]>();
  rightRows.forEach((r, idx) => {
    const k = matchSignature(r);
    if (!rightQueues.has(k)) rightQueues.set(k, []);
    rightQueues.get(k)!.push(idx);
  });
  const usedRight = new Set<number>();
  const pairs: ReconciliationMatchPair[] = [];

  for (const left of leftRows) {
    const k = matchSignature(left);
    const q = rightQueues.get(k);
    if (q && q.length > 0) {
      const j = q.shift()!;
      usedRight.add(j);
      pairs.push({ left, right: rightRows[j], matched: true });
    } else {
      pairs.push({ left, right: null, matched: false });
    }
  }
  rightRows.forEach((r, idx) => {
    if (!usedRight.has(idx)) {
      pairs.push({ left: null, right: r, matched: false });
    }
  });

  return pairs;
}

/** Recon pair sort — footer sort dono side ek saath (date / amount / voucher). */
export function sortReconciliationPairs(
  pairs: ReconciliationMatchPair[],
  sortBy: TransactionSortBy,
  sortOrder: TransactionSortOrder
): ReconciliationMatchPair[] {
  const mult = sortOrder === "asc" ? 1 : -1;
  const pick = (p: ReconciliationMatchPair) => p.left ?? p.right;
  const cmp = (a: ReconciliationLedgerRow, b: ReconciliationLedgerRow) => {
    switch (sortBy) {
      case "amount": {
        const amtA = Math.max(a.debit || 0, a.credit || 0, a.amount || 0);
        const amtB = Math.max(b.debit || 0, b.credit || 0, b.amount || 0);
        return mult * (amtA - amtB);
      }
      case "voucherNo":
        return (
          mult *
          a.voucherNumber.localeCompare(b.voucherNumber, undefined, {
            sensitivity: "base",
            numeric: true,
          })
        );
      case "date":
      default: {
        const ta = a.rawDate ? new Date(a.rawDate).getTime() : 0;
        const tb = b.rawDate ? new Date(b.rawDate).getTime() : 0;
        return mult * (ta - tb);
      }
    }
  };
  return [...pairs].sort((a, b) => {
    const ra = pick(a);
    const rb = pick(b);
    if (!ra && !rb) return 0;
    if (!ra) return 1;
    if (!rb) return -1;
    return cmp(ra, rb);
  });
}

/** Tail paging slice + side-specific (before)/(after) counts. */
export function paginateReconciliationPairs(
  pairs: ReconciliationMatchPair[],
  rowsPerPage: number,
  currentPage: number
): {
  paginated: ReconciliationMatchPair[];
  totalPages: number;
  sliceStart: number;
  sliceEnd: number;
} {
  const n = pairs.length;
  if (rowsPerPage <= 0 || n === 0) {
    return { paginated: pairs, totalPages: 1, sliceStart: 0, sliceEnd: n };
  }
  const totalPages = Math.max(1, Math.ceil(n / rowsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const sliceEnd = n - (safePage - 1) * rowsPerPage;
  const sliceStart = Math.max(0, sliceEnd - rowsPerPage);
  return {
    paginated: pairs.slice(sliceStart, sliceEnd),
    totalPages,
    sliceStart,
    sliceEnd,
  };
}

export function countReconciliationSideRows(
  pairs: ReconciliationMatchPair[],
  side: "left" | "right",
  start = 0,
  end = pairs.length
): number {
  return pairs.slice(start, end).filter((p) => (side === "left" ? p.left : p.right)).length;
}

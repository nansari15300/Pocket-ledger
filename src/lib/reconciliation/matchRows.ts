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

function rowAmount(row: ReconciliationLedgerRow): number {
  return roundMoney(Math.max(row.debit || 0, row.credit || 0, row.amount || 0));
}

/** Owned ↔ other sync mirror — sale↔purchase, RCPT↔PYMT, etc. */
const RECON_MIRROR_TYPE: Record<string, string> = {
  payment_in: "payment_out",
  payment_out: "payment_in",
  direct_income: "direct_expense",
  direct_expense: "direct_income",
  sale: "purchase",
  purchase: "sale",
};

function normalizeVoucherNumber(v: string): string {
  return String(v || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeNarrationText(raw: string): string {
  const t = String(raw || "").trim();
  const u = t === "-" ? "" : t;
  return u.replace(/\s+/g, " ").toLowerCase();
}

/** `[Copied #…]` pehli line — pair match me hatao. */
function stripCopiedMarker(raw: string): string {
  const t = String(raw || "").trim();
  if (!t || t === "-") return t;
  const line0 = (t.split("\n")[0] ?? "").trim();
  if (/^\[Copied[^\]]+\]/.test(line0)) {
    const rest = t.includes("\n") ? t.slice(t.indexOf("\n") + 1).trim() : "";
    return rest || "-";
  }
  return t;
}

/** Sync narration se base text — `Re: PUR - 001 (...)` line hata kar. */
function baseNarrationForPairMatch(narration: string): string {
  let t = stripCopiedMarker(narration);
  t = t.replace(/\n?Re:\s*[^\n]+/gi, "").trim();
  return normalizeNarrationText(t);
}

/** Sync txn narration — `Re: PUR - 001 (Party)` se other voucher no. */
export function extractReconciliationRemoteVoucherRef(narration: string): string | null {
  const t = String(narration || "");
  const m = t.match(/Re:\s*([^\n(]+)/i);
  if (!m) return null;
  const ref = m[1].trim();
  return ref || null;
}

/** Fallback: same date + same amount (pehle wala rule). */
function looseMatchSignature(row: ReconciliationLedgerRow): string {
  return `${dateKey(row.rawDate)}|${rowAmount(row)}`;
}

/** Strong key: date + type + base narration + Dr/Cr — duplicate date/amount par alag pair. */
function strongMatchSignature(row: ReconciliationLedgerRow): string {
  const t = String(row.type || "").trim().toLowerCase();
  const n = baseNarrationForPairMatch(row.narration);
  const dr = roundMoney(row.debit || 0);
  const cr = roundMoney(row.credit || 0);
  return `${dateKey(row.rawDate)}|${t}|${n}|${dr}|${cr}`;
}

function mirroredType(type: string): string | null {
  const t = String(type || "").trim().toLowerCase();
  return RECON_MIRROR_TYPE[t] ?? null;
}

type CrossCopySourceRef = { companyId: string; voucherId: string };

function rowCrossCopyRef(row: ReconciliationLedgerRow): CrossCopySourceRef | null {
  const cref = row.crossCopySourceRef;
  if (!cref?.companyId || !cref?.voucherId) return null;
  return { companyId: String(cref.companyId), voucherId: String(cref.voucherId) };
}

/** Same date+amount par best right candidate — narration ref / mirror type / strong sig. */
function scoreReconciliationPair(left: ReconciliationLedgerRow, right: ReconciliationLedgerRow): number {
  if (looseMatchSignature(left) !== looseMatchSignature(right)) return -1;

  let score = 0;

  const leftRef = extractReconciliationRemoteVoucherRef(left.narration);
  if (leftRef && normalizeVoucherNumber(leftRef) === normalizeVoucherNumber(right.voucherNumber)) {
    score += 1000;
  }
  const rightRef = extractReconciliationRemoteVoucherRef(right.narration);
  if (rightRef && normalizeVoucherNumber(rightRef) === normalizeVoucherNumber(left.voucherNumber)) {
    score += 1000;
  }

  const lt = String(left.type || "").trim().toLowerCase();
  const rt = String(right.type || "").trim().toLowerCase();
  if (mirroredType(lt) === rt || mirroredType(rt) === lt) score += 120;
  if (lt && rt && lt === rt) score += 60;

  const ln = baseNarrationForPairMatch(left.narration);
  const rn = baseNarrationForPairMatch(right.narration);
  if (ln && rn) {
    if (ln === rn) score += 90;
    else if (ln.includes(rn) || rn.includes(ln)) score += 45;
  }

  if (strongMatchSignature(left) === strongMatchSignature(right)) score += 200;

  return score;
}

export type PairReconciliationRowsOptions = {
  leftCompanyId?: string;
  rightCompanyId?: string;
};

/**
 * Left/right ledger rows pair — pehle crossCopy + Re: ref, phir scored match, last me date+amount.
 * Same date+amount duplicate par sale↔purchase / narration se galat PMNT match na ho.
 */
export function pairReconciliationRows(
  leftRows: ReconciliationLedgerRow[],
  rightRows: ReconciliationLedgerRow[],
  opts?: PairReconciliationRowsOptions
): ReconciliationMatchPair[] {
  const leftCid = String(opts?.leftCompanyId || "").trim();
  const rightCid = String(opts?.rightCompanyId || "").trim();
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  const refPairs: ReconciliationMatchPair[] = [];

  const leftById = new Map<string, number>();
  leftRows.forEach((r, i) => {
    if (r.id) leftById.set(String(r.id), i);
  });
  const rightById = new Map<string, number>();
  rightRows.forEach((r, i) => {
    if (r.id) rightById.set(String(r.id), i);
  });

  // Pass 1 — crossCopySourceRef: sync/copy se exact owned↔other link
  if (rightCid) {
    for (let ri = 0; ri < rightRows.length; ri++) {
      const cref = rowCrossCopyRef(rightRows[ri]);
      if (!cref || cref.companyId !== leftCid || !cref.voucherId) continue;
      const li = leftById.get(String(cref.voucherId));
      if (li === undefined || usedLeft.has(li) || usedRight.has(ri)) continue;
      usedLeft.add(li);
      usedRight.add(ri);
      refPairs.push({ left: leftRows[li], right: rightRows[ri], matched: true });
    }
  }
  if (leftCid) {
    for (let li = 0; li < leftRows.length; li++) {
      if (usedLeft.has(li)) continue;
      const cref = rowCrossCopyRef(leftRows[li]);
      if (!cref || cref.companyId !== rightCid || !cref.voucherId) continue;
      const ri = rightById.get(String(cref.voucherId));
      if (ri === undefined || usedRight.has(ri)) continue;
      usedLeft.add(li);
      usedRight.add(ri);
      refPairs.push({ left: leftRows[li], right: rightRows[ri], matched: true });
    }
  }

  // Pass 2 — sync narration `Re: {other voucher no}` + same date/amount
  for (let li = 0; li < leftRows.length; li++) {
    if (usedLeft.has(li)) continue;
    const left = leftRows[li];
    const ref = extractReconciliationRemoteVoucherRef(left.narration);
    if (!ref) continue;
    const refNorm = normalizeVoucherNumber(ref);
    let bestRi = -1;
    let bestScore = -1;
    for (let ri = 0; ri < rightRows.length; ri++) {
      if (usedRight.has(ri)) continue;
      const right = rightRows[ri];
      if (normalizeVoucherNumber(right.voucherNumber) !== refNorm) continue;
      const s = scoreReconciliationPair(left, right);
      if (s > bestScore) {
        bestScore = s;
        bestRi = ri;
      }
    }
    if (bestRi >= 0 && bestScore >= 0) {
      usedLeft.add(li);
      usedRight.add(bestRi);
      refPairs.push({ left, right: rightRows[bestRi], matched: true });
    }
  }

  const leftRemain: Array<{ row: ReconciliationLedgerRow; index: number }> = [];
  leftRows.forEach((row, index) => {
    if (!usedLeft.has(index)) leftRemain.push({ row, index });
  });
  const rightRemain: Array<{ row: ReconciliationLedgerRow; index: number }> = [];
  rightRows.forEach((row, index) => {
    if (!usedRight.has(index)) rightRemain.push({ row, index });
  });

  // Pass 3 — strong signature (date|type|narration|dr|cr)
  const strongRightQueues = new Map<string, number[]>();
  rightRemain.forEach((entry, idx) => {
    const k = strongMatchSignature(entry.row);
    if (!strongRightQueues.has(k)) strongRightQueues.set(k, []);
    strongRightQueues.get(k)!.push(idx);
  });
  const usedStrongRight = new Set<number>();
  const strongPairs: ReconciliationMatchPair[] = [];
  const leftAfterStrong: typeof leftRemain = [];

  for (const entry of leftRemain) {
    const k = strongMatchSignature(entry.row);
    const q = strongRightQueues.get(k);
    if (q && q.length > 0) {
      const ri = q.shift()!;
      usedStrongRight.add(ri);
      strongPairs.push({ left: entry.row, right: rightRemain[ri].row, matched: true });
    } else {
      leftAfterStrong.push(entry);
    }
  }

  // Pass 4 — scored greedy (mirror type + narration) jab same date+amount duplicates hon
  const scoredCandidates: Array<{ li: number; ri: number; score: number }> = [];
  leftAfterStrong.forEach((lEntry, li) => {
    rightRemain.forEach((rEntry, ri) => {
      if (usedStrongRight.has(ri)) return;
      const s = scoreReconciliationPair(lEntry.row, rEntry.row);
      if (s >= 60) scoredCandidates.push({ li, ri, score: s });
    });
  });
  scoredCandidates.sort((a, b) => b.score - a.score);

  const usedScoredLeft = new Set<number>();
  const usedScoredRight = new Set<number>();
  const scoredPairs: ReconciliationMatchPair[] = [];

  for (const c of scoredCandidates) {
    if (usedScoredLeft.has(c.li) || usedScoredRight.has(c.ri)) continue;
    usedScoredLeft.add(c.li);
    usedScoredRight.add(c.ri);
    scoredPairs.push({
      left: leftAfterStrong[c.li].row,
      right: rightRemain[c.ri].row,
      matched: true,
    });
  }

  const leftAfterScored = leftAfterStrong.filter((_, li) => !usedScoredLeft.has(li));
  const rightAfterScored = rightRemain.filter((_, ri) => !usedStrongRight.has(ri) && !usedScoredRight.has(ri));

  // Pass 5 — loose date+amount FIFO (bache hue)
  const looseRightQueues = new Map<string, number[]>();
  rightAfterScored.forEach((entry, idx) => {
    const k = looseMatchSignature(entry.row);
    if (!looseRightQueues.has(k)) looseRightQueues.set(k, []);
    looseRightQueues.get(k)!.push(idx);
  });
  const usedLooseRight = new Set<number>();
  const loosePairs: ReconciliationMatchPair[] = [];

  for (const entry of leftAfterScored) {
    const k = looseMatchSignature(entry.row);
    const q = looseRightQueues.get(k);
    if (q && q.length > 0) {
      const ri = q.shift()!;
      usedLooseRight.add(ri);
      loosePairs.push({ left: entry.row, right: rightAfterScored[ri].row, matched: true });
    } else {
      loosePairs.push({ left: entry.row, right: null, matched: false });
    }
  }

  rightAfterScored.forEach((entry, idx) => {
    if (!usedLooseRight.has(idx)) {
      loosePairs.push({ left: null, right: entry.row, matched: false });
    }
  });

  return [...refPairs, ...strongPairs, ...scoredPairs, ...loosePairs];
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

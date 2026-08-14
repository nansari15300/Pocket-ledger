/** Ledger row / filter: voucher approve na hua (`isApproved` strictly true nahi). */
export function isLedgerTransactionUnapproved(
  tx: { isApproved?: boolean; type?: string; id?: string } | null | undefined
): boolean {
  if (tx == null) return false;
  if (tx.type === "opening_balance" || String(tx.id || "").startsWith("opening_balance")) return false;
  return tx.isApproved !== true;
}

/** Approve All ke baad stale SQLite/Firestore list ~1s me pink wapas na laaye. */
const LOCAL_APPROVE_HOLD_MS = 90_000;
const locallyApprovedAtMs = new Map<string, number>();

export function markLedgerVouchersLocallyApproved(ids: readonly string[]): void {
  const now = Date.now();
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (id) locallyApprovedAtMs.set(id, now);
  }
}

export function clearLedgerVouchersLocallyApproved(ids: readonly string[]): void {
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (id) locallyApprovedAtMs.delete(id);
  }
}

function voucherApproveHoldActive(id: string): boolean {
  const t = locallyApprovedAtMs.get(id);
  if (t == null) return false;
  if (Date.now() - t > LOCAL_APPROVE_HOLD_MS) {
    locallyApprovedAtMs.delete(id);
    return false;
  }
  return true;
}

/** Projection lite rows: sirf id/type/date/amount — `isApproved` nahi hota. */
export function isVoucherLiteProjectionRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row || typeof row !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(row, "isApproved")) return false;
  if (Object.prototype.hasOwnProperty.call(row, "fileUrls")) return false;
  if (Object.prototype.hasOwnProperty.call(row, "entries")) return false;
  if (Object.prototype.hasOwnProperty.call(row, "narration")) return false;
  const keys = Object.keys(row).filter((k) => k !== "id" && row[k] != null);
  return keys.every((k) => k === "type" || k === "date" || k === "amount");
}

function copyApprovalFields<T extends Record<string, unknown>>(from: T, onto: T): T {
  return {
    ...onto,
    isApproved: true,
    approvedByUserId: from.approvedByUserId ?? onto.approvedByUserId,
    approvedByUserName: from.approvedByUserName ?? onto.approvedByUserName,
    approvedAt: from.approvedAt ?? onto.approvedAt,
  };
}

/** Incoming SQLite/snapshot row se local Approve All regress mat hone do. */
export function mergeVoucherRowKeepingLocalApproval<T extends { id?: string; isApproved?: boolean }>(
  prev: T | undefined,
  incoming: T
): T {
  const id = String(incoming?.id || prev?.id || "").trim();
  if (incoming?.isApproved === true) {
    if (id) locallyApprovedAtMs.delete(id);
    return incoming;
  }
  const hold = id ? voucherApproveHoldActive(id) : false;
  const prevApproved = prev?.isApproved === true;
  if (isVoucherLiteProjectionRow(incoming as Record<string, unknown>) && prev) {
    const merged = { ...prev, ...incoming } as T;
    if (prevApproved || hold) {
      return copyApprovalFields(prev as Record<string, unknown>, merged as Record<string, unknown>) as T;
    }
    return merged;
  }
  if (hold || prevApproved) {
    const src = (prevApproved ? prev : incoming) as Record<string, unknown>;
    return copyApprovalFields(src, incoming as Record<string, unknown>) as T;
  }
  return incoming;
}

/**
 * Display guard: jis bhi path se list replace ho (SQLite bump, projection lite rows, Firestore mirror),
 * abhi-abhi approve ki gayi rows dubara pink na dikhein. Refresh ke bina Approve All live rahe.
 */
export function applyLocalApprovalHoldToRows<T extends { id?: string; isApproved?: boolean }>(
  rows: T[]
): T[] {
  if (!locallyApprovedAtMs.size || !Array.isArray(rows) || !rows.length) return rows;
  let changed = false;
  const out = rows.map((row) => {
    if (row?.isApproved === true) return row;
    const id = String(row?.id || "").trim();
    if (!id || !voucherApproveHoldActive(id)) return row;
    changed = true;
    return { ...row, isApproved: true } as T;
  });
  return changed ? out : rows;
}

export function applyLocalApprovalHoldToVoucherList<T extends { id?: string; isApproved?: boolean }>(
  prev: T[],
  next: T[]
): T[] {
  if (!Array.isArray(next) || !next.length) return next;
  const prevById = new Map((prev || []).map((row) => [String(row?.id || ""), row]));
  let changed = false;
  const out = next.map((row) => {
    const id = String(row?.id || "").trim();
    const merged = mergeVoucherRowKeepingLocalApproval(prevById.get(id), row);
    if (merged !== row) changed = true;
    return merged;
  });
  return changed ? out : next;
}

/** Inter Company: peer company ne fields change kiye — apply pending (blue row). */
export function isLedgerTransactionPeerPendingChange(
  tx:
    | {
        type?: string;
        interCompanyPeerPending?: unknown;
      }
    | null
    | undefined
): boolean {
  if (tx == null) return false;
  if (String(tx.type || "") !== "inter_company") return false;
  const p = tx.interCompanyPeerPending;
  if (!p || typeof p !== "object") return false;
  const proposed = (p as { proposed?: unknown }).proposed;
  return !!proposed && typeof proposed === "object" && Object.keys(proposed as object).length > 0;
}

/** PC "Unapproved" chip: sirf pending-approval rows. */
export function filterLedgerUnapprovedOnly<T extends { isApproved?: boolean }>(
  list: T[],
  onlyUnapproved: boolean
): T[] {
  if (!onlyUnapproved) return list;
  return list.filter((tx) => isLedgerTransactionUnapproved(tx));
}

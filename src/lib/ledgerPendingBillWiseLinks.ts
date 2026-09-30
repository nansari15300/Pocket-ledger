/**
 * Bill-wise link save ke baad stale Firestore/SQLite list OS allocations wipe na kare
 * (EXE full_online onSnapshot race — approve hold jaisa).
 */
import type { Allocation } from "@/lib/payment-allocation-utils";

const LOCAL_BILLWISE_HOLD_MS = 90_000;

type HoldEntry = {
  atMs: number;
  allocations: Allocation[];
};

const locallyLinkedAllocationsById = new Map<string, HoldEntry>();

function cloneAllocations(allocations: Allocation[]): Allocation[] {
  return (allocations || []).map((a) => ({ ...a }));
}

function allocationsFingerprint(allocations: unknown): string {
  if (!Array.isArray(allocations) || !allocations.length) return "0";
  return allocations
    .map((a) => {
      const row = a as Allocation;
      return `${String(row?.voucherId || "")}:${Number(row?.amount) || 0}:${Number((row as any)?.taxAmount) || 0}:${Number((row as any)?.netAmount) || 0}`;
    })
    .sort()
    .join("|");
}

export function markLedgerVouchersLocalBillWiseLinked(
  entries: ReadonlyArray<{ id: string; allocations: Allocation[] }>
): void {
  const now = Date.now();
  for (const entry of entries) {
    const id = String(entry?.id || "").trim();
    if (!id) continue;
    locallyLinkedAllocationsById.set(id, {
      atMs: now,
      allocations: cloneAllocations(entry.allocations || []),
    });
  }
}

export function clearLedgerVouchersLocalBillWiseLinked(ids: readonly string[]): void {
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (id) locallyLinkedAllocationsById.delete(id);
  }
}

function voucherBillWiseHold(id: string): HoldEntry | null {
  const hit = locallyLinkedAllocationsById.get(id);
  if (!hit) return null;
  if (Date.now() - hit.atMs > LOCAL_BILLWISE_HOLD_MS) {
    locallyLinkedAllocationsById.delete(id);
    return null;
  }
  return hit;
}

function mergeRowKeepingLocalBillWise<T extends { id?: string; allocations?: Allocation[] }>(
  prev: T | undefined,
  incoming: T
): T {
  const id = String(incoming?.id || prev?.id || "").trim();
  const hold = id ? voucherBillWiseHold(id) : null;
  if (!hold) {
    // Server caught up to held allocations — clear mark.
    if (id && locallyLinkedAllocationsById.has(id)) {
      const incomingFp = allocationsFingerprint(incoming?.allocations);
      const heldFp = allocationsFingerprint(locallyLinkedAllocationsById.get(id)?.allocations);
      if (incomingFp === heldFp) locallyLinkedAllocationsById.delete(id);
    }
    return incoming;
  }
  const incomingFp = allocationsFingerprint(incoming?.allocations);
  const heldFp = allocationsFingerprint(hold.allocations);
  if (incomingFp === heldFp) {
    locallyLinkedAllocationsById.delete(id);
    return incoming;
  }
  // Stale snapshot / lite row — keep just-saved allocations for live Paid/Partial paint.
  return {
    ...incoming,
    allocations: cloneAllocations(hold.allocations),
  } as T;
}

export function applyLocalBillWiseLinkHoldToRows<T extends { id?: string; allocations?: Allocation[] }>(
  rows: T[]
): T[] {
  if (!locallyLinkedAllocationsById.size || !Array.isArray(rows) || !rows.length) return rows;
  let changed = false;
  const out = rows.map((row) => {
    const id = String(row?.id || "").trim();
    const hold = id ? voucherBillWiseHold(id) : null;
    if (!hold) return row;
    if (allocationsFingerprint(row?.allocations) === allocationsFingerprint(hold.allocations)) return row;
    changed = true;
    return { ...row, allocations: cloneAllocations(hold.allocations) } as T;
  });
  return changed ? out : rows;
}

export function applyLocalBillWiseLinkHoldToVoucherList<T extends { id?: string; allocations?: Allocation[] }>(
  prev: T[],
  next: T[]
): T[] {
  if (!Array.isArray(next) || !next.length) return next;
  const prevById = new Map((prev || []).map((row) => [String(row?.id || ""), row]));
  let changed = false;
  const out = next.map((row) => {
    const id = String(row?.id || "").trim();
    const merged = mergeRowKeepingLocalBillWise(prevById.get(id), row);
    if (merged !== row) changed = true;
    return merged;
  });
  return changed ? out : next;
}

/** UI fingerprint — allocations change pe list re-render (EXE stale skip avoid). */
export function voucherBillWiseAllocationsUiFingerprint(row: { allocations?: unknown } | null | undefined): string {
  return allocationsFingerprint(row?.allocations);
}

/**
 * Stale Firestore snapshot / mirror pull — pending local link allocations mat wipe karo
 * (approve preserve jaisa; EXE full_online onSnapshot race).
 */
export function preserveLocalVoucherBillWiseOverIncoming(
  local: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
  pendingOutbox?: Record<string, unknown> | null
): Record<string, unknown> {
  const id = String(incoming?.id || local?.id || "").trim();
  const hold = id ? voucherBillWiseHold(id) : null;
  const preferred: Allocation[] | null = hold
    ? hold.allocations
    : pendingOutbox && Array.isArray(pendingOutbox.allocations)
      ? (pendingOutbox.allocations as Allocation[])
      : null;
  if (!preferred) return incoming;
  const incomingFp = allocationsFingerprint(incoming?.allocations);
  const preferredFp = allocationsFingerprint(preferred);
  if (incomingFp === preferredFp) {
    if (id) locallyLinkedAllocationsById.delete(id);
    return incoming;
  }
  return {
    ...incoming,
    allocations: cloneAllocations(preferred),
  };
}

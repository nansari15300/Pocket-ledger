"use client";

export type LedgerDetailViewMode = "statement" | "bill_wise" | "spend_wise";

export type LedgerDetailSessionSnapshot = {
  page: number;
  openVoucherId?: string | null;
};

export function ledgerDetailSessionStorageKey(
  companyId: string,
  context: string,
  contextId: string,
  viewMode: LedgerDetailViewMode
): string {
  return `pl-ledger-session:${companyId}:${context}:${contextId}:${viewMode}`;
}

export function readLedgerDetailSessionSnapshot(key: string): LedgerDetailSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LedgerDetailSessionSnapshot>;
    const page = Number(parsed.page);
    if (!Number.isFinite(page) || page < 1) return null;
    return {
      page: Math.floor(page),
      openVoucherId:
        typeof parsed.openVoucherId === "string" && parsed.openVoucherId.trim()
          ? parsed.openVoucherId.trim()
          : null,
    };
  } catch {
    return null;
  }
}

export function writeLedgerDetailSessionSnapshot(
  key: string,
  patch: Partial<LedgerDetailSessionSnapshot>
): void {
  if (typeof window === "undefined") return;
  try {
    const prev = readLedgerDetailSessionSnapshot(key);
    const next: LedgerDetailSessionSnapshot = {
      page: patch.page ?? prev?.page ?? 1,
      openVoucherId:
        patch.openVoucherId !== undefined ? patch.openVoucherId : (prev?.openVoucherId ?? null),
    };
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function clearLedgerDetailOpenVoucher(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const prev = readLedgerDetailSessionSnapshot(key);
    if (!prev) return;
    sessionStorage.setItem(key, JSON.stringify({ page: prev.page, openVoucherId: null }));
  } catch {
    /* ignore */
  }
}

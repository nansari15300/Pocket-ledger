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

/** Party Account Balance vs Sale/Pur TDS card — survive refresh for same party. */
export type PartyTdsLedgerViewMode = "account" | "sale" | "purchase" | "tds";

export function partyTdsLedgerModeStorageKey(companyId: string, partyId: string): string {
  return `pl-party-tds-ledger-mode:${companyId}:${partyId}`;
}

/** @deprecated Prefer readPartyTdsLedgerViewMode — kept for boolean callers. */
export function readPartyTdsLedgerMode(companyId: string, partyId: string): boolean {
  const mode = readPartyTdsLedgerViewMode(companyId, partyId);
  return mode !== "account";
}

export function readPartyTdsLedgerViewMode(
  companyId: string,
  partyId: string
): PartyTdsLedgerViewMode {
  if (typeof window === "undefined") return "account";
  try {
    const v = sessionStorage.getItem(partyTdsLedgerModeStorageKey(companyId, partyId));
    if (v === "sale" || v === "purchase" || v === "tds") return v;
    if (v === "1") return "tds";
    return "account";
  } catch {
    return "account";
  }
}

/** @deprecated Prefer writePartyTdsLedgerViewMode. */
export function writePartyTdsLedgerMode(
  companyId: string,
  partyId: string,
  tdsLedgerOnly: boolean
): void {
  writePartyTdsLedgerViewMode(companyId, partyId, tdsLedgerOnly ? "tds" : "account");
}

export function writePartyTdsLedgerViewMode(
  companyId: string,
  partyId: string,
  mode: PartyTdsLedgerViewMode
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      partyTdsLedgerModeStorageKey(companyId, partyId),
      mode === "account" ? "0" : mode
    );
  } catch {
    /* ignore quota */
  }
}

/** Staff Account Balance vs TDS Balance card — survive refresh for same staff. */
export function staffTdsLedgerModeStorageKey(companyId: string, staffId: string): string {
  return `pl-staff-tds-ledger-mode:${companyId}:${staffId}`;
}

export function readStaffTdsLedgerMode(companyId: string, staffId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(staffTdsLedgerModeStorageKey(companyId, staffId)) === "1";
  } catch {
    return false;
  }
}

export function writeStaffTdsLedgerMode(
  companyId: string,
  staffId: string,
  tdsLedgerOnly: boolean
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      staffTdsLedgerModeStorageKey(companyId, staffId),
      tdsLedgerOnly ? "1" : "0"
    );
  } catch {
    /* ignore quota */
  }
}

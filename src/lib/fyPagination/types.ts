export type FyPeriodKind = "month" | "fy";

export type FyCompanyLoadPolicy = "current_month" | "online_current_month" | "local_current_fy";

export type FyDateRangeMs = {
  fromMs: number;
  toMs: number;
};

export type FyActiveScope = {
  policy: FyCompanyLoadPolicy | "date_range" | "full";
  periodKind: FyPeriodKind;
  periodKey: string;
  range: FyDateRangeMs;
  /** Prior period closing used as opening for this scope (partyId → balance). */
  openingSnapshotId: string | null;
  /** Running FY start — default scope never shows vouchers before this without date_range/full. */
  fyFloorMs?: number | null;
};

export type FyBalanceSnapshot = {
  companyId: string;
  periodKind: FyPeriodKind;
  periodKey: string;
  closingAtMs: number;
  /** Opening boundary ms this snapshot was computed for (dated / FY start). */
  beforeMs?: number;
  /** partyId / bankId / staffId → closing balance at period end */
  balances: Record<string, number>;
  /** Optional id → display name (Firestore console / debug only). */
  balanceLabels?: Record<string, string>;
  updatedAtMs: number;
  computedOnServer?: boolean;
  voucherCountScanned?: number;
  /** Vouchers strictly before `beforeMs` included in opening math. */
  preFyVoucherCountScanned?: number;
};

export type FyLoadedRangeRow = {
  companyId: string;
  fromMs: number;
  toMs: number;
  fyKey?: string | null;
  loadedAtMs: number;
};

export type FyUnloadedLinkHint = {
  fyKey: string;
  voucherCount: number;
  voucherIds: string[];
};

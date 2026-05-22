/** Share for Reconciliation — entity / account types (ledger modules). */
export type ReconciliationEntityType = "party" | "bank" | "staff" | "tax" | "expense";

export type ReconciliationShareScope = "all" | "date_range";

export type ReconciliationShareStatus = "pending" | "linked" | "revoked";

/** Cross-user readable ledger row snapshot (Firestore share doc me store). */
export type ReconciliationLedgerRow = {
  id: string;
  voucherNumber: string;
  type: string;
  rawDate: string;
  dateLabel: string;
  narration: string;
  /** Note voucher title — snapshot me alag (purani rows me narration "-" ho sakta hai). */
  title?: string;
  debit: number;
  credit: number;
  amount: number;
  /** Running balance after row (Dr − Cr ledger style). */
  balance?: number;
};

/** Firestore `reconciliation_shares/{shareId}` */
export type ReconciliationShare = {
  id: string;
  senderUserId: string;
  senderUserEmail?: string;
  senderCompanyId: string;
  senderCompanyName: string;
  senderEntityType: ReconciliationEntityType;
  senderAccountId: string;
  senderAccountName: string;
  senderCollection: string;
  shareScope: ReconciliationShareScope;
  dateFrom?: string | null;
  dateTo?: string | null;
  targetUserId: string;
  targetUserEmail?: string;
  status: ReconciliationShareStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  senderLedgerSnapshot?: ReconciliationLedgerRow[];
  senderSnapshotAt?: unknown;
  senderOpeningBalance?: number;
  receiverUserId?: string;
  receiverCompanyId?: string;
  receiverCompanyName?: string;
  receiverEntityType?: ReconciliationEntityType;
  receiverAccountId?: string;
  receiverAccountName?: string;
  receiverCollection?: string;
  receiverLedgerSnapshot?: ReconciliationLedgerRow[];
  receiverSnapshotAt?: unknown;
  receiverOpeningBalance?: number;
  linkedAt?: unknown;
  /** Unlink par kaun user ne disconnect kiya — revoked tab + chat message ke liye. */
  unlinkedByUserId?: string;
  unlinkedByUserEmail?: string;
  unlinkedAt?: unknown;
  /** Remote-side row notes — sender/receiver snapshot row id → comment text. */
  rowComments?: {
    sender?: Record<string, string>;
    receiver?: Record<string, string>;
  };
};

export type ReconciliationMatchPair = {
  left: ReconciliationLedgerRow | null;
  right: ReconciliationLedgerRow | null;
  matched: boolean;
};

export const RECON_ENTITY_OPTIONS: { value: ReconciliationEntityType; label: string; collection: string }[] = [
  { value: "party", label: "Parties", collection: "parties" },
  { value: "bank", label: "Bank / Cash", collection: "bank_accounts" },
  { value: "staff", label: "Staff", collection: "staff" },
  { value: "tax", label: "Tax", collection: "taxes" },
  { value: "expense", label: "Income & Expense", collection: "expense_accounts" },
];

/** Abhi UI / naya share sirf Party — purane shares ke labels ke liye RECON_ENTITY_OPTIONS rakho. */
export const RECON_ENTITY_OPTIONS_UI = RECON_ENTITY_OPTIONS.filter((o) => o.value === "party");

export function reconciliationEntityCollection(entityType: ReconciliationEntityType): string {
  return RECON_ENTITY_OPTIONS.find((o) => o.value === entityType)?.collection ?? "parties";
}

export type ReconciliationAccountOption = {
  id: string;
  name: string;
  entityType: ReconciliationEntityType;
  collection: string;
};

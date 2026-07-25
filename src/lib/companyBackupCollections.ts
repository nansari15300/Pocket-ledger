/** Company ledger subcollections — backup / mirror / restore lists (lightweight; `companyBackupCore` mat import). */
export const COLLECTIONS_TO_BACKUP = [
  "parties",
  "groups",
  "bank_accounts",
  "account_groups",
  "staff",
  "staff_groups",
  "items",
  "item_groups",
  "taxes",
  "tax_groups",
  "expense_accounts",
  "expense_groups",
  "unassigned_documents",
  "vouchers",
  /** Auto Monthly schedule + enabled flag — restore ke baad app-open recurring chale. */
  "recurring_voucher_templates",
] as const;

export type CompanyBackupCollection = (typeof COLLECTIONS_TO_BACKUP)[number];

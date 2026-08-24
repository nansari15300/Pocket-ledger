/** Shared master account freeze fields — party, staff, bank, tax. */
export type MasterAccountFreezeFields = {
  isFrozen?: boolean;
  /** Optional owner note shown on details banner when frozen. */
  freezeMessage?: string | null;
};

export type MasterAccountFreezeCollection = "parties" | "staff" | "bank_accounts" | "taxes" | "expense_accounts";

export function readMasterAccountFrozen(
  row: Record<string, unknown> | MasterAccountFreezeFields | null | undefined
): boolean {
  return row?.isFrozen === true;
}

export function readMasterAccountFreezeMessage(
  row: Record<string, unknown> | MasterAccountFreezeFields | null | undefined
): string {
  const raw = row?.freezeMessage;
  return typeof raw === "string" ? raw.trim() : "";
}

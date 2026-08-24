import type { MasterAccountFreezeFields } from "@/lib/masterAccountFreeze/types";

export const PARTY_FREEZE_COLLECTION = "parties" as const;
export const STAFF_FREEZE_COLLECTION = "staff" as const;
export const BANK_ACCOUNT_FREEZE_COLLECTION = "bank_accounts" as const;
export const TAX_FREEZE_COLLECTION = "taxes" as const;
export const EXPENSE_FREEZE_COLLECTION = "expense_accounts" as const;

export function masterAccountFreezePatchFromSave(input: {
  isFrozen: boolean;
  freezeMessage?: string | null;
}): MasterAccountFreezeFields {
  const patch: MasterAccountFreezeFields = { isFrozen: input.isFrozen };
  if (input.freezeMessage !== undefined) {
    patch.freezeMessage =
      input.freezeMessage != null && String(input.freezeMessage).length > 0
        ? String(input.freezeMessage)
        : null;
  }
  return patch;
}

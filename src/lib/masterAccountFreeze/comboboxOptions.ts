import type { MasterAccountFreezeFields } from "@/lib/masterAccountFreeze/types";
import { MASTER_ACCOUNT_FREEZE_LIST_LABEL } from "@/lib/masterAccountFreeze/labels";

type ComboboxRow = { id: string } & MasterAccountFreezeFields;

function mapMasterRowsForVoucherCombobox<T extends ComboboxRow>(
  rows: readonly T[],
  labelOf: (row: T) => string
) {
  return rows.map((row) => ({
    value: row.id,
    label: row.isFrozen ? `${labelOf(row)} (${MASTER_ACCOUNT_FREEZE_LIST_LABEL})` : labelOf(row),
    disabled: row.isFrozen === true,
  }));
}

type PartyLike = { id: string; name: string } & MasterAccountFreezeFields;

/** Voucher / report combobox — frozen parties visible but not selectable. */
export function mapPartiesForVoucherCombobox(parties: readonly PartyLike[]) {
  return mapMasterRowsForVoucherCombobox(parties, (p) => p.name);
}

type StaffLike = { id: string; name: string } & MasterAccountFreezeFields;

export function mapStaffForVoucherCombobox(staff: readonly StaffLike[]) {
  return mapMasterRowsForVoucherCombobox(staff, (s) => s.name);
}

type BankLike = { id: string; accountName: string } & MasterAccountFreezeFields;

export function mapBankAccountsForVoucherCombobox(accounts: readonly BankLike[]) {
  return mapMasterRowsForVoucherCombobox(accounts, (a) => a.accountName);
}

type TaxLike = { id: string; name: string } & MasterAccountFreezeFields;

export function mapTaxesForVoucherCombobox(taxes: readonly TaxLike[]) {
  return mapMasterRowsForVoucherCombobox(taxes, (t) => t.name);
}

type ExpenseLike = { id: string; name: string } & MasterAccountFreezeFields;

export function mapExpenseAccountsForVoucherCombobox(accounts: readonly ExpenseLike[]) {
  return mapMasterRowsForVoucherCombobox(accounts, (a) => a.name);
}

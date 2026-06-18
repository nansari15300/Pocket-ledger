/** Payment In/Out, Direct Income/Expense, Contra — IC clearing accounts exclude. */
export function isNonClearingVoucherBankAccount(acc: { isClearing?: boolean }): boolean {
  return acc.isClearing !== true;
}

export function filterNonClearingVoucherBankAccounts<T extends { isClearing?: boolean }>(
  accounts: T[]
): T[] {
  return accounts.filter(isNonClearingVoucherBankAccount);
}

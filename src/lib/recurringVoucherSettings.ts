/** Company-level recurring auto: default ON jab tak explicitly `enabled: false` na ho (purani docs / field missing). */
export function isRecurringVoucherGenerationEnabled(
  company: { recurringVoucherSettings?: { enabled?: boolean } } | null | undefined,
): boolean {
  return company?.recurringVoucherSettings?.enabled !== false;
}

/** Bank/cash master — SQLite me kabhi `name`, kabhi `accountName` (Drive opening.json restore). */
export function bankAccountDisplayName(
  row: { accountName?: unknown; name?: unknown } | null | undefined
): string {
  if (!row) return "";
  return String(row.accountName ?? row.name ?? "").trim();
}

export function normalizeBankAccountRow<T extends Record<string, unknown>>(row: T): T {
  const accountName = bankAccountDisplayName(row);
  if (!accountName) return row;
  if (String(row.accountName ?? "").trim() === accountName) return row;
  return { ...row, accountName };
}

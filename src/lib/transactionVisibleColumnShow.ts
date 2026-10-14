/** TDS ledger columns — show only when explicitly enabled (TDS pill on). */
const TDS_COLUMN_KEYS = new Set(["tdsTaxable", "tdsAmount"]);

export function isTransactionColumnVisible(
  visibleColumns: Record<string, boolean> | null | undefined,
  key: string,
  options?: { forceDateOnMobile?: boolean; isMobileView?: boolean }
): boolean {
  if (options?.isMobileView && options?.forceDateOnMobile && key === "date") return true;
  if (TDS_COLUMN_KEYS.has(key)) {
    return visibleColumns?.[key] === true;
  }
  if (visibleColumns == null) return true;
  return visibleColumns[key] !== false;
}

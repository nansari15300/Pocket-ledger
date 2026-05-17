/** Radix Select rows-per-page: `value` hamesha SelectItem list me honi chahiye (warna setRef loop). */
export const ROWS_PER_PAGE_OPTIONS_DEFAULT = [10, 20, 30, 50] as const;

/** Staff ledger pagination dropdown options. */
export const ROWS_PER_PAGE_OPTIONS_STAFF = [15, 30, 50, 100] as const;

export function rowsPerPageSelectValue(
  rowsPerPage: number,
  options: readonly number[],
  fallbackWhenUnknown: string
): string {
  if (rowsPerPage === 0) return "0";
  if ((options as readonly number[]).includes(rowsPerPage)) return `${rowsPerPage}`;
  return fallbackWhenUnknown;
}

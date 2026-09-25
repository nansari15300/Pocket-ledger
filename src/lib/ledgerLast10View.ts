/** Default tail window when no explicit ledger date filter ("Last 10" preset + initial load). */
export const MASTER_LEDGER_DEFAULT_TAIL_ROWS = 10;

export type LedgerPaginationResetHandlers = {
  setRowsPerPage: (value: number) => void;
  setCurrentPage: (value: number) => void;
};

/** Date preset "Last 10" + default list view: newest page, 10 rows per page. */
export function applyMasterLedgerLast10TailView(handlers?: LedgerPaginationResetHandlers | null): void {
  if (!handlers) return;
  handlers.setRowsPerPage(MASTER_LEDGER_DEFAULT_TAIL_ROWS);
  handlers.setCurrentPage(1);
}

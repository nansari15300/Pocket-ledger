"use client";

import { useEffect, useMemo, useState } from "react";
import { useStatementCheckMode } from "@/hooks/useStatementCheckMode";
import {
  DEFAULT_TRANSACTION_SORT_ORDER,
  recomputeRunningBalanceTopToBottom,
  sortAndRebalancePageTransactions,
} from "@/lib/transactionSort";
import { statementCheckTxnId } from "@/lib/statementCheckModeStorage";
import type { StatementCheckViewMode } from "@/hooks/useStatementCheckMode";
import type {
  TransactionSortBy,
  TransactionSortOrder,
} from "@/components/vouchers/TransactionTableSortDropdown";

type Args = {
  companyId: string | undefined;
  context: string;
  contextId: string | undefined;
  viewMode: StatementCheckViewMode;
  /** Ledger chronological order (date asc) — paging is slice; user sort sirf page par. */
  searchFilteredTransactions: ReadonlyArray<{ id?: string; _rowKey?: string; debit?: unknown; credit?: unknown; balance?: number; runningBalance?: number }>;
  rowsPerPage: number;
  currentPage: number;
  ledgerOpeningForRunning: number;
  /** Footer sort: sirf current page rows par apply — poori list reorder nahi. */
  pageSortBy?: TransactionSortBy;
  pageSortOrder?: TransactionSortOrder;
};

/**
 * Entity statement ledger: check mode filter + tail paging + hidden rows excluded from page totals.
 * Detail pages: `searchFilteredTransactions` ke baad call karo; `ledgerListForPaging` paging me use karo.
 */
export function useStatementLedgerCheckModePaging({
  companyId,
  context,
  contextId,
  viewMode,
  searchFilteredTransactions,
  rowsPerPage,
  currentPage,
  ledgerOpeningForRunning,
  pageSortBy = "date",
  pageSortOrder = DEFAULT_TRANSACTION_SORT_ORDER,
}: Args) {
  // Current page rows — ↑↓/Space isi list par (paging ke baad sync; hook order circular na ho).
  const [keyboardNavList, setKeyboardNavList] = useState<
    ReadonlyArray<{ id?: string; _rowKey?: string }>
  >([]);

  const statementCheck = useStatementCheckMode({
    companyId,
    context,
    contextId,
    viewMode,
    orderedTransactions: searchFilteredTransactions,
    keyboardNavTransactions: keyboardNavList,
  });

  const ledgerListForPaging = useMemo(() => {
    const filtered = statementCheck.filterTransactions([...searchFilteredTransactions]);
    if (!statementCheck.checkModeActive) return filtered;
    return recomputeRunningBalanceTopToBottom(filtered, ledgerOpeningForRunning);
  }, [
    searchFilteredTransactions,
    statementCheck.filterTransactions,
    statementCheck.checkModeActive,
    ledgerOpeningForRunning,
  ]);

  const desktopPaginationMeta = useMemo(() => {
    const list = ledgerListForPaging;
    const total = list.length;
    if (rowsPerPage <= 0) {
      const pageDr = list.reduce((sum, t) => sum + (Number(t?.debit) || 0), 0);
      const pageCr = list.reduce((sum, t) => sum + (Number(t?.credit) || 0), 0);
      const openingForPage = ledgerOpeningForRunning;
      const displayAll = sortAndRebalancePageTransactions(list, openingForPage, pageSortBy, pageSortOrder);
      const adjusted = statementCheck.adjustPeriodTotals(displayAll, openingForPage);
      const totalPagesLocal = 1;
      return {
        totalPages: totalPagesLocal,
        pageTransactions: displayAll,
        beforeCount: 0,
        afterCount: 0,
        sliceStart: 0,
        openingForPage,
        periodDrForPage: adjusted?.periodDrForPage ?? pageDr,
        periodCrForPage: adjusted?.periodCrForPage ?? pageCr,
        closingForPage: adjusted?.closingForPage ?? openingForPage + pageDr - pageCr,
      };
    }
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    const pageTransactions = list.slice(start, Math.max(start, end));
    const previousTx = start > 0 ? list[start - 1] : null;
    const previousRunningBalance =
      previousTx != null
        ? (typeof previousTx.balance === "number"
            ? previousTx.balance
            : typeof previousTx.runningBalance === "number"
              ? previousTx.runningBalance
              : undefined)
        : undefined;
    const openingForPage =
      typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)
        ? previousRunningBalance
        : ledgerOpeningForRunning;
    // User sort sirf is page ki rows par — slice window (46–55) same rahe.
    const displayPageTransactions = sortAndRebalancePageTransactions(
      pageTransactions,
      openingForPage,
      pageSortBy,
      pageSortOrder
    );
    let periodDrForPage = displayPageTransactions.reduce((sum, t) => sum + (Number(t?.debit) || 0), 0);
    let periodCrForPage = displayPageTransactions.reduce((sum, t) => sum + (Number(t?.credit) || 0), 0);
    let closingForPage = openingForPage + periodDrForPage - periodCrForPage;
    const adjusted = statementCheck.adjustPeriodTotals(displayPageTransactions, openingForPage);
    if (adjusted) {
      periodDrForPage = adjusted.periodDrForPage;
      periodCrForPage = adjusted.periodCrForPage;
      closingForPage = adjusted.closingForPage;
    }
    return {
      totalPages: totalPagesLocal,
      pageTransactions: displayPageTransactions,
      beforeCount: start,
      afterCount: Math.max(0, total - end),
      sliceStart: start,
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage,
    };
  }, [
    ledgerListForPaging,
    rowsPerPage,
    currentPage,
    ledgerOpeningForRunning,
    statementCheck.adjustPeriodTotals,
    pageSortBy,
    pageSortOrder,
  ]);

  const totalPages =
    desktopPaginationMeta.totalPages ??
    (rowsPerPage > 0 ? Math.max(1, Math.ceil(ledgerListForPaging.length / rowsPerPage)) : 1);

  // Sirf page row ids badlen tab nav list update — naya .slice() ref har render par setState loop na ho.
  useEffect(() => {
    const next = desktopPaginationMeta.pageTransactions ?? [];
    setKeyboardNavList((prev) => {
      if (prev.length === next.length) {
        let same = true;
        for (let i = 0; i < prev.length; i++) {
          if (statementCheckTxnId(prev[i]) !== statementCheckTxnId(next[i])) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [desktopPaginationMeta.pageTransactions]);

  return {
    statementCheck,
    ledgerListForPaging,
    desktopPaginationMeta,
    paginatedTransactions: desktopPaginationMeta.pageTransactions,
    totalPages,
  };
}

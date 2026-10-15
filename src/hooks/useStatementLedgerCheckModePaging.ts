"use client";

import { useEffect, useMemo, useState } from "react";
import { useStatementCheckMode } from "@/hooks/useStatementCheckMode";
import {
  DEFAULT_TRANSACTION_SORT_ORDER,
  sortAndRebalancePageTransactions,
  type RecomputeRunningBalanceOptions,
} from "@/lib/transactionSort";
import {
  applyStatementCheckModeHiddenToLedgerList,
  ledgerClosingFromStatementList,
} from "@/lib/statementCheckModeLedger";
import { statementCheckTxnId } from "@/lib/statementCheckModeStorage";
import type { StatementCheckViewMode } from "@/hooks/useStatementCheckMode";
import type {
  TransactionSortBy,
  TransactionSortOrder,
} from "@/components/vouchers/TransactionTableSortDropdown";
import { getFiscalMergePartitionsFromCompany } from "@/lib/fiscalPartitionRows";
import {
  isUnverifiedTaxTdsBalanceRow,
  partyTdsLedgerBooksDrCrFromRow,
  taxLedgerBooksDrCrFromRow,
} from "@/lib/partyLedgerTdsView";

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
  /**
   * Tax group ledger: member tax account ids so Unverified TDS legs are excluded from
   * Dated Opening / footer / running (context is "group", not "tax").
   */
  taxGroupMemberIdsForBooks?: ReadonlyArray<string>;
  /** Merge FY partitions — non-date page sort har segment ke andar. */
  company?: {
    fiscalSplitMode?: string;
    fiscalMergePartitionAt?: unknown;
    fiscalMergePartitionAtIsos?: string[] | null;
  } | null;
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
  taxGroupMemberIdsForBooks,
  company,
}: Args) {
  const fiscalPartitionAts = useMemo(
    () => getFiscalMergePartitionsFromCompany(company),
    [company?.fiscalSplitMode, company?.fiscalMergePartitionAt, company?.fiscalMergePartitionAtIsos]
  );
  const taxBooksRebalanceOptions = useMemo((): RecomputeRunningBalanceOptions | undefined => {
    if (context === "tax") {
      const taxId = String(contextId ?? "").trim();
      if (!taxId) return undefined;
      return {
        booksDrCrForRow: (tx) => taxLedgerBooksDrCrFromRow(tx, taxId),
      };
    }
    if (context === "group" && taxGroupMemberIdsForBooks && taxGroupMemberIdsForBooks.length > 0) {
      const memberIds = taxGroupMemberIdsForBooks.map((id) => String(id || "").trim()).filter(Boolean);
      if (memberIds.length === 0) return undefined;
      return {
        booksDrCrForRow: (tx) => {
          const hasUnverifiedMember = memberIds.some((taxId) => isUnverifiedTaxTdsBalanceRow(tx, taxId));
          if (!hasUnverifiedMember) {
            return {
              debit: Number(tx?.debit) || 0,
              credit: Number(tx?.credit) || 0,
            };
          }
          // Drop Unverified TDS member legs; keep other members (e.g. VAT on same voucher).
          let debit = 0;
          let credit = 0;
          const voucherType = String((tx as { type?: unknown })?.type ?? "");
          const entries = Array.isArray((tx as { entries?: unknown }).entries)
            ? ((tx as { entries: Array<{ accountId?: unknown; debit?: unknown; credit?: unknown }> }).entries)
            : [];
          const lines = Array.isArray((tx as { lineItems?: unknown }).lineItems)
            ? ((
                tx as {
                  lineItems: Array<{
                    taxAccountId?: unknown;
                    tdsAccountId?: unknown;
                    taxAmount?: unknown;
                    tdsAmount?: unknown;
                  }>;
                }
              ).lineItems)
            : [];
          for (const taxId of memberIds) {
            if (isUnverifiedTaxTdsBalanceRow(tx, taxId)) continue;
            for (const e of entries) {
              if (String(e?.accountId ?? "").trim() !== taxId) continue;
              debit += Number(e.debit) || 0;
              credit += Number(e.credit) || 0;
            }
            for (const li of lines) {
              if (String(li?.taxAccountId ?? "").trim() === taxId) {
                const amt = Number(li.taxAmount) || 0;
                if (voucherType === "purchase" || voucherType === "purchase_service") debit += amt;
                else if (voucherType === "sale" || voucherType === "sale_service") credit += amt;
              }
              if (String(li?.tdsAccountId ?? "").trim() === taxId) {
                const amt = Number(li.tdsAmount) || 0;
                if (voucherType === "purchase" || voucherType === "purchase_service") credit += amt;
                else if (voucherType === "sale" || voucherType === "sale_service") debit += amt;
              }
            }
          }
          return { debit, credit };
        },
      };
    }
    // Party / staff TDS details rows: Unverified bill legs do not move footer / running.
    if (context === "party" || context === "staff") {
      return {
        booksDrCrForRow: (tx) => partyTdsLedgerBooksDrCrFromRow(tx),
      };
    }
    return undefined;
  }, [context, contextId, taxGroupMemberIdsForBooks]);
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

  const ledgerListForPaging = useMemo(
    () =>
      applyStatementCheckModeHiddenToLedgerList(searchFilteredTransactions, {
        checkModeActive: statementCheck.checkModeActive,
        hiddenIds: statementCheck.hiddenIds,
        openingBalance: ledgerOpeningForRunning,
        booksDrCrForRow: taxBooksRebalanceOptions?.booksDrCrForRow,
      }),
    [
      searchFilteredTransactions,
      statementCheck.checkModeActive,
      statementCheck.hiddenIds,
      ledgerOpeningForRunning,
      taxBooksRebalanceOptions,
    ]
  );

  const ledgerClosingAfterHidden = useMemo(() => {
    if (!statementCheck.checkModeActive || statementCheck.hiddenCount === 0) return null;
    return ledgerClosingFromStatementList(ledgerListForPaging, ledgerOpeningForRunning);
  }, [
    ledgerListForPaging,
    statementCheck.checkModeActive,
    statementCheck.hiddenCount,
    ledgerOpeningForRunning,
  ]);

  const sumPageBooksDrCr = (rows: ReadonlyArray<{ debit?: unknown; credit?: unknown }>) => {
    let dr = 0;
    let cr = 0;
    for (const t of rows) {
      const books = taxBooksRebalanceOptions?.booksDrCrForRow
        ? taxBooksRebalanceOptions.booksDrCrForRow(t)
        : { debit: Number(t?.debit) || 0, credit: Number(t?.credit) || 0 };
      dr += Number(books.debit) || 0;
      cr += Number(books.credit) || 0;
    }
    return { dr, cr };
  };

  const desktopPaginationMeta = useMemo(() => {
    const list = ledgerListForPaging;
    const total = list.length;
    if (rowsPerPage <= 0) {
      const openingForPage = ledgerOpeningForRunning;
      const displayAll = sortAndRebalancePageTransactions(
        list,
        openingForPage,
        pageSortBy,
        pageSortOrder,
        fiscalPartitionAts,
        taxBooksRebalanceOptions
      );
      const { dr: pageDr, cr: pageCr } = sumPageBooksDrCr(displayAll);
      const adjusted = statementCheck.adjustPeriodTotals(displayAll, openingForPage);
      const useAdjusted = Boolean(adjusted && !taxBooksRebalanceOptions);
      const totalPagesLocal = 1;
      return {
        totalPages: totalPagesLocal,
        pageTransactions: displayAll,
        beforeCount: 0,
        afterCount: 0,
        sliceStart: 0,
        openingForPage,
        periodDrForPage: useAdjusted ? adjusted!.periodDrForPage : pageDr,
        periodCrForPage: useAdjusted ? adjusted!.periodCrForPage : pageCr,
        closingForPage: useAdjusted
          ? adjusted!.closingForPage
          : openingForPage + pageDr - pageCr,
      };
    }
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    const pageTransactions = list.slice(start, Math.max(start, end));
    // Dated Opening must not include Unverified (or any books-excluded) legs from prior pages.
    // Prefer books walk over previous-row balance (stale if list was not books-rebalanced).
    let openingForPage = ledgerOpeningForRunning;
    if (start > 0) {
      if (taxBooksRebalanceOptions?.booksDrCrForRow) {
        for (let i = 0; i < start; i++) {
          const books = taxBooksRebalanceOptions.booksDrCrForRow(list[i]);
          openingForPage += (Number(books.debit) || 0) - (Number(books.credit) || 0);
        }
      } else {
        const previousTx = list[start - 1];
        const previousRunningBalance =
          previousTx != null
            ? typeof previousTx.balance === "number"
              ? previousTx.balance
              : typeof previousTx.runningBalance === "number"
                ? previousTx.runningBalance
                : undefined
            : undefined;
        if (typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)) {
          openingForPage = previousRunningBalance;
        }
      }
    }
    // User sort sirf is page ki rows par — slice window (46–55) same rahe.
    const displayPageTransactions = sortAndRebalancePageTransactions(
      pageTransactions,
      openingForPage,
      pageSortBy,
      pageSortOrder,
      fiscalPartitionAts,
      taxBooksRebalanceOptions
    );
    const booksTotals = sumPageBooksDrCr(displayPageTransactions);
    let periodDrForPage = booksTotals.dr;
    let periodCrForPage = booksTotals.cr;
    let closingForPage = openingForPage + periodDrForPage - periodCrForPage;
    const adjusted = statementCheck.adjustPeriodTotals(displayPageTransactions, openingForPage);
    // Tax Unverified uses books totals above; other contexts keep check-mode adjust when active.
    if (adjusted && !taxBooksRebalanceOptions) {
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
    fiscalPartitionAts,
    taxBooksRebalanceOptions,
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
    ledgerClosingAfterHidden,
    desktopPaginationMeta,
    paginatedTransactions: desktopPaginationMeta.pageTransactions,
    totalPages,
  };
}

"use client";

import { useMemo, useState, useEffect } from "react";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";

/** Tail-side window paging — Party Statement / Party Details pager semantics (Prev = newer slice). */
export type StatementReportMobilePagingMeta = {
  pageTransactions: any[];
  openingForPage: number;
  periodDrForPage: number;
  periodCrForPage: number;
  closingForPage: number;
  edges: { before: number; after: number };
};

type Args = {
  filteredRows: readonly any[];
  isMobile: boolean;
  openingBalanceForPeriod: number;
  periodDr: number;
  periodCr: number;
  closingBalance: number;
  /** Entity / filters / toggle change par page = 1 (string stable key). */
  resetKey: string;
};

/**
 * Entity statement reports mobile: **`MobileTransactionsPager`** ke liye shared tail-window slice +
 * Opening row continuity (purane slice ka closing = agle page OB).
 *
 * Hook andar **`useRowsPerPage(10)`** — sab entity reports ek hi prefs key share (Party Details jaisa).
 */
export function useStatementReportMobilePaging({
  filteredRows,
  isMobile,
  openingBalanceForPeriod,
  periodDr,
  periodCr,
  closingBalance,
  resetKey,
}: Args) {
  const [pagerPage, setPagerPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);

  useEffect(() => {
    setPagerPage(1);
  }, [resetKey]);

  useEffect(() => {
    const total = filteredRows.length;
    const tp = Math.max(1, rowsPerPage <= 0 ? 1 : Math.ceil(total / rowsPerPage));
    if (pagerPage > tp) setPagerPage(tp);
  }, [filteredRows.length, rowsPerPage, pagerPage]);

  const pagingMeta: StatementReportMobilePagingMeta = useMemo(() => {
    const list = filteredRows as any[];
    const total = list.length;
    const rp = rowsPerPage;
    if (!isMobile || rp <= 0) {
      return {
        pageTransactions: list,
        openingForPage: openingBalanceForPeriod,
        periodDrForPage: periodDr,
        periodCrForPage: periodCr,
        closingForPage: closingBalance,
        edges: { before: 0, after: 0 },
      };
    }
    const totalPagesLoc = Math.max(1, Math.ceil(total / rp));
    const safePage = Math.min(Math.max(1, pagerPage), totalPagesLoc);
    const end = total - (safePage - 1) * rp;
    const start = Math.max(0, end - rp);
    const pageTransactions = list.slice(start, Math.max(start, end));
    const previousTx = start > 0 ? list[start - 1] : null;
    const previousRunningBalance =
      previousTx != null
        ? typeof previousTx.balance === "number"
          ? previousTx.balance
          : typeof previousTx.runningBalance === "number"
            ? previousTx.runningBalance
            : undefined
        : undefined;
    const openingForPage =
      typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)
        ? previousRunningBalance
        : openingBalanceForPeriod;
    const periodDrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      pageTransactions,
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
      edges: { before: start, after: Math.max(0, total - end) },
    };
  }, [
    filteredRows,
    isMobile,
    rowsPerPage,
    pagerPage,
    openingBalanceForPeriod,
    periodDr,
    periodCr,
    closingBalance,
  ]);

  return {
    pagingMeta,
    pagerPage,
    setPagerPage,
    rowsPerPage,
    setRowsPerPage,
  };
}

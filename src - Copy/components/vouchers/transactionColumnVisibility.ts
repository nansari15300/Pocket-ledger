"use client";

import { useState, useCallback } from "react";
import type { VisibleColumns, TransactionColumnKey } from "./TransactionsTable";

export const COLUMN_VISIBILITY_KEY = "transactionVisibleColumns";

export const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  date: true,
  type: true,
  voucherNo: true,
  user: true,
  dr: true,
  cr: true,
  status: true,
  runningBalance: true,
};

export const COLUMN_LABELS: Record<TransactionColumnKey, string> = {
  date: "Date",
  type: "Type",
  voucherNo: "Voucher No.",
  user: "User",
  dr: "Dr",
  cr: "Cr",
  status: "Status",
  runningBalance: "Running Balance",
};

export function useTransactionVisibleColumns() {
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
    const saved = sessionStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as VisibleColumns;
        return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
      } catch {
        return DEFAULT_VISIBLE_COLUMNS;
      }
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  const handleColumnVisibilityChange = useCallback((key: TransactionColumnKey, checked: boolean) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: checked };
      sessionStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { visibleColumns, handleColumnVisibilityChange };
}

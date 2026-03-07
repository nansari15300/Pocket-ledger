"use client";

import { useState, useCallback } from "react";
import type { VisibleColumns, TransactionColumnKey } from "./TransactionsTable";

export const COLUMN_VISIBILITY_KEY = "transactionVisibleColumns";

export const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  date: true,
  type: true,
  voucherNo: true,
  user: true,
  file: true,
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
  file: "File",
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

/** Show notes in transaction tables: persisted in localStorage, default false (untick = hide notes). Shared across all details/group pages. */
export const SHOW_NOTES_KEY = "transactionShowNotes";

export function useShowNotes() {
  const [showNotes, setShowNotesState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = localStorage.getItem(SHOW_NOTES_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const setShowNotes = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setShowNotesState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(SHOW_NOTES_KEY, next ? "true" : "false");
      } catch {}
      return next;
    });
  }, []);

  return { showNotes, setShowNotes };
}

/** Spend-wise balance blink: 'all' | 'group' | 'off'. Persisted in localStorage. */
export const SPEND_WISE_BLINK_MODE_KEY = "spendWiseBlinkMode";
export type SpendWiseBlinkMode = "all" | "group" | "off";

export function useSpendWiseBlinkMode() {
  const [blinkMode, setBlinkModeState] = useState<SpendWiseBlinkMode>(() => {
    if (typeof window === "undefined") return "all";
    const saved = localStorage.getItem(SPEND_WISE_BLINK_MODE_KEY);
    if (saved === "group" || saved === "off") return saved;
    return "all";
  });

  const setBlinkMode = useCallback((mode: SpendWiseBlinkMode) => {
    setBlinkModeState(mode);
    if (typeof window !== "undefined") localStorage.setItem(SPEND_WISE_BLINK_MODE_KEY, mode);
  }, []);

  return { spendWiseBlinkMode: blinkMode, setSpendWiseBlinkMode: setBlinkMode };
}

"use client";

import { useCallback, useEffect } from "react";
import {
  BANK_LEDGER_DRCR_PERSPECTIVE_STORAGE_KEY,
  type BankLedgerDrCrPerspective,
} from "@/lib/bankLedgerDrCrPerspective";

/**
 * Bank/Cash ledgers — locked to Bank Dr/Cr view (cash-book / statement style).
 * Company toggle UI removed; legacy localStorage preference is reset to bank.
 */
export function useBankLedgerDrCrPerspective() {
  useEffect(() => {
    try {
      localStorage.setItem(BANK_LEDGER_DRCR_PERSPECTIVE_STORAGE_KEY, "bank");
    } catch {
      /* private mode */
    }
  }, []);

  const setPerspective = useCallback((_next: BankLedgerDrCrPerspective) => {
    /* Bank view only — switch hidden in UI. */
  }, []);

  return {
    perspective: "bank" as const,
    setPerspective,
    isBankPerspective: true as const,
  };
}

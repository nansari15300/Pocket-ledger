"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BANK_LEDGER_DRCR_PERSPECTIVE_STORAGE_KEY,
  normalizeBankLedgerDrCrPerspective,
  type BankLedgerDrCrPerspective,
} from "@/lib/bankLedgerDrCrPerspective";

/**
 * Shared Company ↔ Bank Dr/Cr preference (localStorage) for bank/cash ledgers.
 */
export function useBankLedgerDrCrPerspective() {
  const [perspective, setPerspectiveState] = useState<BankLedgerDrCrPerspective>("bank");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BANK_LEDGER_DRCR_PERSPECTIVE_STORAGE_KEY);
      setPerspectiveState(normalizeBankLedgerDrCrPerspective(raw));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BANK_LEDGER_DRCR_PERSPECTIVE_STORAGE_KEY) return;
      setPerspectiveState(normalizeBankLedgerDrCrPerspective(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPerspective = useCallback((next: BankLedgerDrCrPerspective) => {
    const v = normalizeBankLedgerDrCrPerspective(next);
    setPerspectiveState(v);
    try {
      localStorage.setItem(BANK_LEDGER_DRCR_PERSPECTIVE_STORAGE_KEY, v);
      window.dispatchEvent(
        new CustomEvent("pocket-ledger-bank-ledger-drcr-perspective", { detail: v })
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPerspectiveState(normalizeBankLedgerDrCrPerspective(detail));
    };
    window.addEventListener("pocket-ledger-bank-ledger-drcr-perspective", onLocal);
    return () => window.removeEventListener("pocket-ledger-bank-ledger-drcr-perspective", onLocal);
  }, []);

  return { perspective, setPerspective, isBankPerspective: perspective === "bank" };
}

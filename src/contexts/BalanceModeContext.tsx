"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useCompany } from "@/hooks/useCompany";
import {
  defaultLedgerBalanceViewMode,
  readLedgerBalanceViewMode,
  resolveLedgerBalanceSection,
  writeLedgerBalanceViewMode,
  type LedgerBalanceViewMode,
} from "@/lib/ledgerViewModeStorage";

/** Statement = running balance. Bill wise = per-row outstanding. */
export type BalanceMode = LedgerBalanceViewMode;

type BalanceModeContextType = {
  balanceMode: BalanceMode;
  setBalanceMode: (mode: BalanceMode) => void;
  isBillWise: boolean;
};

const BalanceModeContext = createContext<BalanceModeContextType | null>(null);

export function BalanceModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { companyId } = useCompany();
  const section = useMemo(() => resolveLedgerBalanceSection(pathname), [pathname]);

  const readModeForScope = useCallback((): BalanceMode => {
    if (section) return readLedgerBalanceViewMode(companyId, section);
    return "statement";
  }, [section, companyId]);

  const [balanceMode, setBalanceModeState] = useState<BalanceMode>(() => {
    if (typeof window === "undefined") return "statement";
    const sec = resolveLedgerBalanceSection(window.location.pathname);
    if (!sec) return "statement";
    return readLedgerBalanceViewMode(null, sec);
  });

  useEffect(() => {
    setBalanceModeState(readModeForScope());
  }, [readModeForScope]);

  const setBalanceMode = useCallback(
    (mode: BalanceMode) => {
      setBalanceModeState(mode);
      if (section) {
        writeLedgerBalanceViewMode(companyId, section, mode);
      }
    },
    [section, companyId]
  );

  const value: BalanceModeContextType = {
    balanceMode,
    setBalanceMode,
    isBillWise: balanceMode === "bill_wise",
  };

  return (
    <BalanceModeContext.Provider value={value}>
      {children}
    </BalanceModeContext.Provider>
  );
}

export function useBalanceMode(): BalanceModeContextType {
  const ctx = useContext(BalanceModeContext);
  if (!ctx) {
    return {
      balanceMode: "statement",
      setBalanceMode: () => {},
      isBillWise: false,
    };
  }
  return ctx;
}

/** @internal tests / migration */
export function __defaultLedgerBalanceViewMode(section: "party" | "staff"): BalanceMode {
  return defaultLedgerBalanceViewMode(section);
}

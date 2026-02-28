"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

/** Statement = running balance. Bill wise = per-row outstanding. */
export type BalanceMode = "statement" | "bill_wise";

const STORAGE_KEY = "balanceMode";

function getStored(key: string, defaultMode: BalanceMode): BalanceMode {
  if (typeof window === "undefined") return defaultMode;
  const v = sessionStorage.getItem(key);
  if (v === "bill_wise" || v === "statement") return v;
  return defaultMode;
}

type BalanceModeContextType = {
  balanceMode: BalanceMode;
  setBalanceMode: (mode: BalanceMode) => void;
  isBillWise: boolean;
};

const BalanceModeContext = createContext<BalanceModeContextType | null>(null);

export function BalanceModeProvider({ children }: { children: React.ReactNode }) {
  const defaultMode: BalanceMode = "statement";

  const [balanceMode, setBalanceModeState] = useState<BalanceMode>(defaultMode);

  useEffect(() => {
    setBalanceModeState(getStored(STORAGE_KEY, defaultMode));
  }, [defaultMode]);

  const setBalanceMode = useCallback((mode: BalanceMode) => {
    setBalanceModeState(mode);
    sessionStorage.setItem(STORAGE_KEY, mode);
  }, []);

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

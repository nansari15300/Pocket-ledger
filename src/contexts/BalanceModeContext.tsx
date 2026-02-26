"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";

/** Statement = running balance. Bill wise = per-row outstanding. */
export type BalanceMode = "statement" | "bill_wise";

const STORAGE_KEY_PREFIX = "balanceMode_";

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

const BILL_WISE_DEFAULT_PATHS = ["/party", "/staff", "/bank-cash"];

function getDefaultModeForPath(pathname: string | null): BalanceMode {
  if (!pathname) return "statement";
  const base = pathname.split("/").slice(0, 2).join("/");
  return BILL_WISE_DEFAULT_PATHS.some((p) => base === p || pathname.startsWith(p + "/")) ? "bill_wise" : "statement";
}

export function BalanceModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const defaultMode = getDefaultModeForPath(pathname);
  const storageKey = pathname ? `${STORAGE_KEY_PREFIX}${pathname}` : STORAGE_KEY_PREFIX + "default";

  const [balanceMode, setBalanceModeState] = useState<BalanceMode>(() =>
    typeof window !== "undefined" ? getStored(storageKey, defaultMode) : defaultMode
  );

  useEffect(() => {
    setBalanceModeState(getStored(storageKey, defaultMode));
  }, [storageKey, defaultMode]);

  const setBalanceMode = useCallback((mode: BalanceMode) => {
    setBalanceModeState(mode);
    if (pathname) sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${pathname}`, mode);
    else sessionStorage.setItem(STORAGE_KEY_PREFIX + "default", mode);
  }, [pathname]);

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

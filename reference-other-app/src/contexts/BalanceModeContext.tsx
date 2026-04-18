"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";

/** Statement = running balance. Bill wise = per-row outstanding. */
export type BalanceMode = "statement" | "bill_wise";

const STORAGE_KEY_PREFIX = "balanceMode_";

/** Party/staff: one key per section so preference persists across list, details, group and after refresh. */
function getStorageKey(pathname: string | null): string {
  if (!pathname) return STORAGE_KEY_PREFIX + "default";
  if (pathname.startsWith("/party")) return STORAGE_KEY_PREFIX + "party";
  if (pathname.startsWith("/staff")) return STORAGE_KEY_PREFIX + "staff";
  return STORAGE_KEY_PREFIX + pathname;
}

function getStored(key: string, defaultMode: BalanceMode): BalanceMode {
  if (typeof window === "undefined") return defaultMode;
  const v = localStorage.getItem(key);
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
  const storageKey = getStorageKey(pathname);

  // Initial state fixed to avoid hydration mismatch (server has no localStorage / pathname can be null)
  const [balanceMode, setBalanceModeState] = useState<BalanceMode>("statement");

  // Client-only: sync from localStorage using actual URL so we get correct key even if pathname was null
  useEffect(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : null;
    const key = getStorageKey(path);
    const defaultForPath = getDefaultModeForPath(path);
    setBalanceModeState(getStored(key, defaultForPath));
  }, [pathname]);

  const setBalanceMode = useCallback((mode: BalanceMode) => {
    setBalanceModeState(mode);
    localStorage.setItem(storageKey, mode);
  }, [storageKey]);

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

"use client";

/**
 * Mobile detail pages: date/balance/toolbar summary hide-show — ek global preference (APK/static + mobile web).
 */
import * as React from "react";

const STORAGE_KEY = "pl-mobile-detail-summary-collapsed";

type MobileDetailSummaryCollapseContextValue = {
  /** `true` = summary section hidden (arrow down dikhega toggle par). */
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggle: () => void;
  /** MobileTransactionsPager mount — FAB pager ke upar inline, fixed FAB duplicate na ho */
  pagerFabHostCount: number;
  registerPagerFabHost: () => void;
  unregisterPagerFabHost: () => void;
};

const MobileDetailSummaryCollapseContext =
  React.createContext<MobileDetailSummaryCollapseContextValue | null>(null);

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode / quota: in-memory state still works this session.
  }
}

export function MobileDetailSummaryCollapseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsedState] = React.useState(false);
  const [pagerFabHostCount, setPagerFabHostCount] = React.useState(0);

  React.useEffect(() => {
    setCollapsedState(readStoredCollapsed());
  }, []);

  const registerPagerFabHost = React.useCallback(() => {
    setPagerFabHostCount((c) => c + 1);
  }, []);

  const unregisterPagerFabHost = React.useCallback(() => {
    setPagerFabHostCount((c) => Math.max(0, c - 1));
  }, []);

  const setCollapsed = React.useCallback((next: boolean) => {
    setCollapsedState(next);
    writeStoredCollapsed(next);
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeStoredCollapsed(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggle,
      pagerFabHostCount,
      registerPagerFabHost,
      unregisterPagerFabHost,
    }),
    [collapsed, setCollapsed, toggle, pagerFabHostCount, registerPagerFabHost, unregisterPagerFabHost]
  );

  return (
    <MobileDetailSummaryCollapseContext.Provider value={value}>
      {children}
    </MobileDetailSummaryCollapseContext.Provider>
  );
}

export function useMobileDetailSummaryCollapsed(): MobileDetailSummaryCollapseContextValue {
  const ctx = React.useContext(MobileDetailSummaryCollapseContext);
  if (!ctx) {
    throw new Error(
      "useMobileDetailSummaryCollapsed must be used within MobileDetailSummaryCollapseProvider"
    );
  }
  return ctx;
}

"use client";

import * as React from "react";

type MobileRoutePullRefreshContextValue = {
  runRefresh: (pathname: string) => Promise<void>;
};

const MobileRoutePullRefreshContext = React.createContext<MobileRoutePullRefreshContextValue | null>(
  null
);

export function MobileRoutePullRefreshProvider({ children }: { children: React.ReactNode }) {
  const runRefresh = React.useCallback(async (pathname: string) => {
    const { dispatchMobileRoutePullRefresh } = await import("@/lib/mobileRoutePullRefresh");
    await dispatchMobileRoutePullRefresh(pathname);
  }, []);

  const value = React.useMemo(() => ({ runRefresh }), [runRefresh]);

  return (
    <MobileRoutePullRefreshContext.Provider value={value}>
      {children}
    </MobileRoutePullRefreshContext.Provider>
  );
}

export function useMobileRoutePullRefreshController() {
  const ctx = React.useContext(MobileRoutePullRefreshContext);
  if (!ctx) {
    throw new Error("useMobileRoutePullRefreshController must be used within MobileRoutePullRefreshProvider");
  }
  return ctx;
}

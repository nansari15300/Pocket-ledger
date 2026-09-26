"use client";

import * as React from "react";

export type MobilePagePullRefreshHandler = () => void | Promise<void>;

type MobilePagePullRefreshContextValue = {
  registerHandler: (handler: MobilePagePullRefreshHandler | null) => void;
  runRefresh: (pathname: string) => Promise<void>;
};

const MobilePagePullRefreshContext = React.createContext<MobilePagePullRefreshContextValue | null>(
  null
);

export function MobilePagePullRefreshProvider({ children }: { children: React.ReactNode }) {
  const handlerRef = React.useRef<MobilePagePullRefreshHandler | null>(null);

  const registerHandler = React.useCallback((handler: MobilePagePullRefreshHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const runRefresh = React.useCallback(async (pathname: string) => {
    const h = handlerRef.current;
    if (h) {
      await h();
      return;
    }
    const { dispatchMobileRoutePullRefresh } = await import("@/lib/mobileRoutePullRefresh");
    await dispatchMobileRoutePullRefresh(pathname);
  }, []);

  const value = React.useMemo(
    () => ({ registerHandler, runRefresh }),
    [registerHandler, runRefresh]
  );

  return (
    <MobilePagePullRefreshContext.Provider value={value}>
      {children}
    </MobilePagePullRefreshContext.Provider>
  );
}

export function useMobilePagePullRefreshController() {
  const ctx = React.useContext(MobilePagePullRefreshContext);
  if (!ctx) {
    throw new Error("useMobilePagePullRefreshController must be used within MobilePagePullRefreshProvider");
  }
  return ctx;
}

/** Optional: page apna scoped refresh override (default = route collections event). */
export function useRegisterMobilePagePullRefresh(
  handler: MobilePagePullRefreshHandler | null,
  enabled = true
) {
  const { registerHandler } = useMobilePagePullRefreshController();
  React.useEffect(() => {
    if (!enabled) {
      registerHandler(null);
      return;
    }
    registerHandler(handler);
    return () => registerHandler(null);
  }, [enabled, handler, registerHandler]);
}

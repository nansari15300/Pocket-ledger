"use client";

/**
 * Registers `/sw.js` in production browsers + Capacitor remote WebView.
 * Dev me SW band — HMR/cache conflicts kam.
 * `next start` on localhost par bhi SW band: Serwist har Firebase Storage URL ko handle karke console flood + extra latency (400+ attachment rows).
 * **Electron EXE:** `cacheOnNavigation` = history `replaceState`/`pushState` patch + har navigation par SW `CACHE_URLS` — reports `router.replace` ke saath claim/refresh race; EXE par patch band, SW precache baaki clients jaisa.
 * Purana SW pehle se `controlling` ho to `disable` matlab "naya register mat" — purana intercept rukta nahi; `useEffect` se unregister.
 */
import { SerwistProvider } from "@serwist/next/react";
import type { ReactNode } from "react";
import { useEffect, useSyncExternalStore } from "react";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

function useDisableSerwistForLocalBrowsing(): boolean {
  const disabledInDev = process.env.NODE_ENV === "development";
  /** EXE: packaged app me SW claim race (`InvalidStateError`) + React shell churn — offline shell zaroori nahi. */
  const disabledOnElectron = isElectronDesktopApp();
  const onLocalLoopback = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        const h = window.location.hostname;
        return h === "localhost" || h === "127.0.0.1";
      } catch {
        return false;
      }
    },
    () => false
  );
  return disabledInDev || onLocalLoopback || disabledOnElectron;
}

export function PocketSerwistProvider({ children }: { children: ReactNode }) {
  const disable = useDisableSerwistForLocalBrowsing();
  /** EXE: navigation par history patch + SW message kam — real bug reports page duplicate `replace` tha, yeh extra guard. */
  const cacheOnNavigation = !isElectronDesktopApp();

  // Pehle install SW localhost / Electron par bhi intercept karta — disable=true par hata do.
  useEffect(() => {
    if (!disable || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        if (cancelled) return;
        return Promise.all(regs.map((r) => r.unregister()));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [disable]);

  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={disable}
      cacheOnNavigation={cacheOnNavigation}
      // Serwist default `reloadOnOnline=true` = har `online` par `location.reload()` — static/APK me offline→online + kabhi dashboard link par bhi "refresh" + SW `claim` race (InvalidStateError).
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}

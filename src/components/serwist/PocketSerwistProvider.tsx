"use client";

/**
 * Registers `/sw.js` in production browsers + Capacitor remote WebView.
 * Dev me SW band — HMR/cache conflicts kam.
 * `next start` on localhost par bhi SW band: Serwist har Firebase Storage URL ko handle karke console flood + extra latency (400+ attachment rows).
 * Purana SW pehle se `controlling` ho to `disable` matlab "naya register mat" — purana intercept rukta nahi; `useEffect` se unregister.
 */
import { SerwistProvider } from "@serwist/next/react";
import type { ReactNode } from "react";
import { useEffect, useSyncExternalStore } from "react";

function useDisableSerwistForLocalBrowsing(): boolean {
  const disabledInDev = process.env.NODE_ENV === "development";
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
  return disabledInDev || onLocalLoopback;
}

export function PocketSerwistProvider({ children }: { children: ReactNode }) {
  const disable = useDisableSerwistForLocalBrowsing();

  // Pehle install SW localhost:55818 jaisa random port par bhi intercept karta — CORS log flood; disable=true par hata do.
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
    <SerwistProvider swUrl="/sw.js" disable={disable}>
      {children}
    </SerwistProvider>
  );
}

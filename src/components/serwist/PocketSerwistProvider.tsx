"use client";

/**
 * Registers `/sw.js` in production browsers + Capacitor remote WebView.
 * Dev me SW band — HMR/cache conflicts kam.
 * `next start` on localhost par bhi SW band: Serwist har Firebase Storage URL ko handle karke console flood + extra latency (400+ attachment rows).
 */
import { SerwistProvider } from "@serwist/next/react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

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
  return (
    <SerwistProvider swUrl="/sw.js" disable={disable}>
      {children}
    </SerwistProvider>
  );
}

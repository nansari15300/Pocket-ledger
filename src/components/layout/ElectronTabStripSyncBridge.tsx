"use client";

import { useEffect } from "react";
import { useCompany } from "@/hooks/useCompany";

/** Tab strip ↻ se aata hai — `main.js` executeJavaScript event */
export const ELECTRON_TAB_STRIP_SYNC_EVENT = "pocket-ledger-tab-strip-sync";

/**
 * EXE tab strip: background sync — sirf `triggerSync` (registry tick), `reloadLocalCompanyRegistry` mat (poori list hilti).
 * Khatam hone par `plElectronTabBridge` se strip par 2s green ✓.
 */
export function ElectronTabStripSyncBridge() {
  const { triggerSync } = useCompany();

  useEffect(() => {
    const w = window as unknown as {
      plElectronTabBridge?: { notifyTabStripBackgroundSyncDone?: () => void };
    };
    const onStripSync = () => {
      try {
        triggerSync();
      } finally {
        queueMicrotask(() => {
          try {
            w.plElectronTabBridge?.notifyTabStripBackgroundSyncDone?.();
          } catch {
            /* preload sirf Electron packaged tab par */
          }
        });
      }
    };
    window.addEventListener(ELECTRON_TAB_STRIP_SYNC_EVENT, onStripSync);
    return () => window.removeEventListener(ELECTRON_TAB_STRIP_SYNC_EVENT, onStripSync);
  }, [triggerSync]);

  return null;
}

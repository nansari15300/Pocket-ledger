"use client";

import { useEffect } from "react";
import { flushVoucherOutbox } from "@/lib/localVoucherOutbox";

/** Tab strip ↻ se aata hai — `main.js` executeJavaScript event */
export const ELECTRON_TAB_STRIP_SYNC_EVENT = "pocket-ledger-tab-strip-sync";

/**
 * EXE tab strip: background sync — outbox flush only (registry tick se poori UI dubara bind na ho).
 * Khatam hone par `plElectronTabBridge` se strip par 2s green ✓.
 */
export function ElectronTabStripSyncBridge() {
  useEffect(() => {
    const w = window as unknown as {
      plElectronTabBridge?: { notifyTabStripBackgroundSyncDone?: () => void };
    };
    const onStripSync = () => {
      try {
        void flushVoucherOutbox();
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
  }, []);

  return null;
}

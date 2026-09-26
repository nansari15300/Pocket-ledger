"use client";

import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

export const ELECTRON_UI_WAKE_EVENT = "pocket-ledger-ui-wake";

/** EXE: minimize/background ke baad Chromium rAF/React stall — layout + event se UI dubara paint. */
export function nudgeElectronRendererUiWake(reason: string): void {
  if (typeof window === "undefined") return;
  if (!isElectronDesktopApp()) return;
  try {
    window.dispatchEvent(
      new CustomEvent(ELECTRON_UI_WAKE_EVENT, { detail: { reason: String(reason || "wake") } })
    );
  } catch {
    /* ignore */
  }
  try {
    void document.body?.offsetHeight;
  } catch {
    /* ignore */
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        window.dispatchEvent(
          new CustomEvent(`${ELECTRON_UI_WAKE_EVENT}-tick`, {
            detail: { reason: String(reason || "wake") },
          })
        );
      } catch {
        /* ignore */
      }
    });
  });
}

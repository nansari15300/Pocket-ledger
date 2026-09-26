"use client";

import { useEffect } from "react";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import {
  ELECTRON_FOREGROUND_RESUME_EVENT,
  ELECTRON_FOREGROUND_RESUME_MIN_HIDDEN_MS,
} from "@/lib/electronForegroundResume";
import { nudgeElectronRendererUiWake } from "@/lib/electronUiWake";

/**
 * EXE: window focus / minimize se wapas — React clicks dead lagte hain jabki state (company) change ho chuka hota hai.
 * Full page refresh ki jagah pehle paint + sync nudge; tab strip / StaticFastResumeSyncManager ke saath.
 */
export function ElectronForegroundUiWake() {
  useEffect(() => {
    if (!isElectronDesktopApp()) return;

    let hiddenAt: number | null = null;

    const wake = (reason: string, hiddenMs: number) => {
      if (hiddenMs < ELECTRON_FOREGROUND_RESUME_MIN_HIDDEN_MS && reason !== "electron-resume") return;
      nudgeElectronRendererUiWake(reason);
    };

    const onResume = () => {
      const hiddenMs = hiddenAt != null ? Date.now() - hiddenAt : ELECTRON_FOREGROUND_RESUME_MIN_HIDDEN_MS;
      wake("electron-resume", hiddenMs);
      hiddenAt = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        const hiddenMs = hiddenAt != null ? Date.now() - hiddenAt : 0;
        wake("visible", hiddenMs);
        hiddenAt = null;
      }
    };

    const onFocus = () => {
      const hiddenMs = hiddenAt != null ? Date.now() - hiddenAt : ELECTRON_FOREGROUND_RESUME_MIN_HIDDEN_MS;
      wake("focus", hiddenMs);
    };

    const onCompanySwitched = () => {
      nudgeElectronRendererUiWake("company-switched");
    };

    window.addEventListener(ELECTRON_FOREGROUND_RESUME_EVENT, onResume);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pl-company-switched", onCompanySwitched);

    return () => {
      window.removeEventListener(ELECTRON_FOREGROUND_RESUME_EVENT, onResume);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pl-company-switched", onCompanySwitched);
    };
  }, []);

  return null;
}

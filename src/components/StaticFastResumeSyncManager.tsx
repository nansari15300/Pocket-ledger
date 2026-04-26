"use client";

import { useEffect, useRef } from "react";
import { auth } from "@/lib/firebase";
import { isLocalOnlyMode } from "@/lib/localMode";
import { flushVoucherOutbox } from "@/lib/localVoucherOutbox";
import { useCompany } from "@/hooks/useCompany";

/** APK/EXE fast resume: UI pehle local cache se khulta hai, sync/auth background me quietly refresh hote hain. */
export function StaticFastResumeSyncManager() {
  const { triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!isLocalOnlyMode()) return;

    let cancelled = false;
    let removeAppStateListener: (() => void) | undefined;

    const runBackgroundRefresh = (reason: string) => {
      const now = Date.now();
      // Standby se rapid duplicate events (visibility + Capacitor + online) aate hain; one small burst enough.
      if (now - lastRunRef.current < 2500) return;
      lastRunRef.current = now;

      window.setTimeout(() => {
        if (cancelled) return;
        // Local registry reload cheap hai and restored/uploaded companies ko next paint me fresh karta hai.
        reloadLocalCompanyRegistry();
        triggerSync();
        void flushVoucherOutbox();
        void auth.currentUser?.getIdToken(false).catch(() => {
          // Offline APK startup ko slow/blocked mat karo; Firebase token next online event pe retry hoga.
        });
        if (process.env.NODE_ENV !== "production") {
          console.debug("[StaticFastResumeSyncManager] background refresh", reason);
        }
      }, 350);
    };

    const onOnline = () => runBackgroundRefresh("online");
    const onVisibility = () => {
      if (document.visibilityState === "visible") runBackgroundRefresh("visible");
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof navigator !== "undefined" && navigator.onLine) runBackgroundRefresh("mount");

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) runBackgroundRefresh("appStateChange");
        })
      )
      .then((handle) => {
        removeAppStateListener = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        // Desktop/web build me Capacitor plugin absent ho sakta hai; browser events enough hain.
      });

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      removeAppStateListener?.();
    };
  }, [reloadLocalCompanyRegistry, triggerSync]);

  return null;
}

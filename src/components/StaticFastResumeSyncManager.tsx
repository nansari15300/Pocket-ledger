"use client";

import { useEffect, useRef } from "react";
import { auth } from "@/lib/firebase";
import { isLocalOnlyMode } from "@/lib/localMode";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { shouldSkipEmbeddedStartupAuthChurn } from "@/lib/embeddedWarmBootstrapFlags";
import { flushVoucherOutbox } from "@/lib/localVoucherOutbox";
import { useCompany } from "@/hooks/useCompany";

/** APK/EXE fast resume: UI pehle local cache se khulta hai, sync/auth background me quietly refresh hote hain. */
export function StaticFastResumeSyncManager() {
  const { triggerSync, reloadLocalCompanyRegistry } = useCompany();
  const lastRunRef = useRef(0);
  /** Online/offline flap: defer timer cleanup; airplane par pehle `triggerSync()` turant listeners chhedta tha ("refresh" feel). */
  // Deferred reload timer id — browser number; TS `@types/node` conflicts Timeout vs number; `number` keeps next build happy with window.setTimeout.
  const deferredRegistryTimerRef = useRef<number | null>(null);

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
        const embeddedClient =
          isStaticAppBuild() || (typeof window !== "undefined" && isCapacitorNativeApp());
        const uid = auth.currentUser?.uid ?? null;
        // Pehli full warm ke baad cold `mount` par token + registry tick mat chhedo — attachment warm / SQLite ko priority; sync `online`/resume par
        const skipAuthChurnOnMount =
          reason === "mount" &&
          isLocalOnlyMode() &&
          embeddedClient &&
          shouldSkipEmbeddedStartupAuthChurn(null, uid);

        void flushVoucherOutbox();
        if (!skipAuthChurnOnMount) {
          void auth.currentUser?.getIdToken(false).catch(() => {
            // Offline APK startup ko slow/blocked mat karo; Firebase token next online event pe retry hoga.
          });
        }
        if (process.env.NODE_ENV !== "production") {
          console.debug("[StaticFastResumeSyncManager] background refresh", reason);
        }

        if (skipAuthChurnOnMount) {
          return;
        }

        // **Offline → online:** user ko "app refresh" feel aa raha tha; online event par registry/listener tick ko skip rakho.
        // Outbox flush + token warm-up upar ho chuka hota hai, isliye data sync background me chalta rahega bina UI jump ke.
        if (reason === "online") {
          if (deferredRegistryTimerRef.current != null) {
            clearTimeout(deferredRegistryTimerRef.current);
            deferredRegistryTimerRef.current = null;
          }
          return;
        }

        // Visibility/resume: listener tick abhi; SQLite mirror thoda defer (scroll na hile).
        triggerSync();
        if (deferredRegistryTimerRef.current != null) {
          clearTimeout(deferredRegistryTimerRef.current);
          deferredRegistryTimerRef.current = null;
        }
        const delayMs = isCapacitorNativeApp() ? 4_000 : 2_500;
        deferredRegistryTimerRef.current = window.setTimeout(() => {
          deferredRegistryTimerRef.current = null;
          if (cancelled) return;
          reloadLocalCompanyRegistry();
        }, delayMs);
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
      if (deferredRegistryTimerRef.current != null) {
        clearTimeout(deferredRegistryTimerRef.current);
        deferredRegistryTimerRef.current = null;
      }
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      removeAppStateListener?.();
    };
  }, [reloadLocalCompanyRegistry, triggerSync]);

  return null;
}

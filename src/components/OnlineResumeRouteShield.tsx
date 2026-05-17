"use client";

/**
 * Offline→online: outbox flush / SQLite race se silent `/dashboard` jump rokne ke liye ledger URL lock + restore guard.
 * `StaticFastResumeSyncManager` sirf background flush karta hai — navigation yahan shield se cover.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { armOnlineResumeRouteShield } from "@/lib/protectFromUnwantedDashboardRedirect";

function embeddedClient(): boolean {
  return isStaticAppBuild() || (typeof window !== "undefined" && isCapacitorNativeApp());
}

export function OnlineResumeRouteShield() {
  const router = useRouter();
  const online = useNavigatorOnline();
  const prevOnlineRef = useRef(online);

  useEffect(() => {
    if (!embeddedClient()) return;

    const wasOffline = prevOnlineRef.current === false;
    prevOnlineRef.current = online;
    if (!wasOffline || !online) return;

    armOnlineResumeRouteShield(router);
  }, [online, router]);

  // Capacitor: `window` `online` kabhi miss — Network plugin se bhi shield arm karo.
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;
    let removeListener: (() => void) | undefined;
    let prevConnected = true;

    void import("@capacitor/network")
      .then(({ Network }) =>
        Network.addListener("networkStatusChange", (st) => {
          const nowConnected = st.connected;
          const reconnected = !prevConnected && nowConnected;
          prevConnected = nowConnected;
          if (reconnected) armOnlineResumeRouteShield(router);
        })
      )
      .then((handle) => {
        removeListener = () => {
          void handle.remove();
        };
      })
      .catch(() => {});

    return () => {
      removeListener?.();
    };
  }, [router]);

  return null;
}

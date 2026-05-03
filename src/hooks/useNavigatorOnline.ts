"use client";

import { useEffect, useState } from "react";
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/**
 * Online signal:
 * - **Web / Electron:** `navigator.onLine` + window `online`/`offline` (behaviour unchanged).
 * - **Capacitor APK:** `@capacitor/network` device link + periodic real reachability ping — sirf navigator se hota aksar offline tab bhi “online” dikhta hai.
 */

function readNavigatorOnline(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/**
 * `no-cors` opaque response bhi TCP success par hi aata hai; captive / airplane me fail/abort ho jata hai.
 * URL override: `NEXT_PUBLIC_CONNECTIVITY_PING_URL` (GET, no-cors).
 */
async function probeInternetReachable(timeoutMs: number): Promise<boolean> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return true;
  const url =
    typeof process !== "undefined" &&
    typeof process.env.NEXT_PUBLIC_CONNECTIVITY_PING_URL === "string" &&
    process.env.NEXT_PUBLIC_CONNECTIVITY_PING_URL.trim()
      ? process.env.NEXT_PUBLIC_CONNECTIVITY_PING_URL.trim()
      : "https://www.gstatic.com/generate_204";
  const ac = new AbortController();
  const t = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store", signal: ac.signal });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

export function useNavigatorOnline(): boolean {
  const [online, setOnline] = useState(readNavigatorOnline);

  useEffect(() => {
    let cancelled = false;
    let nativeConnected = true;
    let reachable = true;

    const nav = () => readNavigatorOnline();

    const publish = () => {
      if (cancelled) return;
      const next = nav() && nativeConnected && reachable;
      setOnline((prev) => (prev !== next ? next : prev));
    };

    const onNavEvent = () => {
      publish();
      if (isCapacitorNativeApp()) void runProbe();
    };

    window.addEventListener("online", onNavEvent);
    window.addEventListener("offline", onNavEvent);
    publish();

    if (!isCapacitorNativeApp()) {
      return () => {
        cancelled = true;
        window.removeEventListener("online", onNavEvent);
        window.removeEventListener("offline", onNavEvent);
      };
    }

    let probeInterval = 0;
    let netListener: { remove: () => Promise<void> } | undefined;
    let resumeListener: { remove: () => Promise<void> } | undefined;

    async function runProbe() {
      if (cancelled) return;
      if (!nav() || !nativeConnected) {
        reachable = false;
        publish();
        return;
      }
      reachable = await probeInternetReachable(4500);
      publish();
    }

    void (async () => {
      try {
        const { Network } = await import("@capacitor/network");
        const s = await Network.getStatus();
        if (cancelled) return;
        nativeConnected = s.connected;
        publish();
        netListener = await Network.addListener("networkStatusChange", (st) => {
          nativeConnected = st.connected;
          publish();
          void runProbe();
        });
      } catch {
        nativeConnected = true;
        publish();
      }

      try {
        const { App } = await import("@capacitor/app");
        resumeListener = await App.addListener("resume", () => {
          publish();
          void runProbe();
        });
      } catch {
        /* non-native / missing */
      }

      await runProbe();
      probeInterval = window.setInterval(() => void runProbe(), 12_000);
    })();

    return () => {
      cancelled = true;
      window.clearInterval(probeInterval);
      window.removeEventListener("online", onNavEvent);
      window.removeEventListener("offline", onNavEvent);
      void netListener?.remove();
      void resumeListener?.remove();
    };
  }, []);

  return online;
}

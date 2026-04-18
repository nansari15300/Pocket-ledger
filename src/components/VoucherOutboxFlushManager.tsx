"use client";

/**
 * Static build: jaise hi network wapas aaye (ya periodic) pending voucher outbox Firestore pe flush.
 */

import { useEffect } from "react";
import { flushVoucherOutbox } from "@/lib/localVoucherOutbox";
import { isLocalOnlyMode } from "@/lib/localMode";

export function VoucherOutboxFlushManager() {
  useEffect(() => {
    if (!isLocalOnlyMode()) return;
    // Local-first sync engine: default ON for online-category companies, can disable via env flag.
    if (process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "0") return;
    /** Watch stream ko browser "online" ke turant baad settle hone do — flush se race kam (Firestore ca9). */
    const FLUSH_AFTER_ONLINE_MS = 900;
    const ONLINE_DEBOUNCE_MS = 1200;

    // Browser `setTimeout` → number; Node typings `Timeout` se clash avoid (client-only)
    let onlineTimer: number | null = null;
    const pendingFlushTimers: number[] = [];
    const scheduleFlush = (delayMs: number) => {
      const t = window.setTimeout(() => {
        const i = pendingFlushTimers.indexOf(t);
        if (i !== -1) pendingFlushTimers.splice(i, 1);
        void flushVoucherOutbox();
      }, delayMs);
      pendingFlushTimers.push(t);
    };
    const tick = () => {
      void flushVoucherOutbox();
    };
    const onOnline = () => {
      if (onlineTimer != null) clearTimeout(onlineTimer);
      onlineTimer = window.setTimeout(() => {
        onlineTimer = null;
        scheduleFlush(FLUSH_AFTER_ONLINE_MS);
      }, ONLINE_DEBOUNCE_MS);
    };
    window.addEventListener("online", onOnline);
    if (typeof navigator !== "undefined" && navigator.onLine) scheduleFlush(FLUSH_AFTER_ONLINE_MS);
    const iv = setInterval(tick, 45_000);
    return () => {
      if (onlineTimer != null) clearTimeout(onlineTimer);
      pendingFlushTimers.forEach((t) => clearTimeout(t));
      window.removeEventListener("online", onOnline);
      clearInterval(iv);
    };
  }, []);
  return null;
}

"use client";

/**
 * Local-first / embedded: flush pending `sync_outbox` rows to Firestore when the network is up, on focus, or on an interval (~8s).
 * Must also run on Capacitor with Firebase UI mode — previously the manager returned early when `isLocalOnlyMode` was false.
 */

import { useEffect } from "react";
import { flushVoucherOutbox } from "@/lib/localVoucherOutbox";
import { isLocalOnlyMode } from "@/lib/localMode";
import { apkEmbeddedSqliteFirstWritesPreferred } from "@/lib/apkOnlineFirestoreWritePolicy";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import {
  FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT,
  isFirebaseLedgerDataSyncDisabled,
} from "@/lib/firebaseLedgerDataSyncDisabled";

export function VoucherOutboxFlushManager() {
  useEffect(() => {
    // PL Server staff: authoritative queue + SQLite mirror — Firestore outbox flush UI churn na kare.
    if (isPlServerThinStaffClient()) return;
    // Capacitor + Firebase data source: `isLocalOnlyMode` may be false but outbox flush is still required, or masters stay stuck in the queue.
    if (!isLocalOnlyMode() && !apkEmbeddedSqliteFirstWritesPreferred()) return;
    // Local-first sync engine: default ON for online-category companies; disable with env flag.
    if (process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "0") return;
    /** Let the browser "online" event settle before flushing — reduces races with Firestore watch streams (ca9). */
    const FLUSH_AFTER_ONLINE_MS = 900;
    const ONLINE_DEBOUNCE_MS = 1200;

    // Browser `setTimeout` ids are numbers here; Node typings use `Timeout` — this effect is window-only.
    let onlineTimer: number | null = null;
    const pendingFlushTimers: number[] = [];
    const scheduleFlush = (delayMs: number) => {
      const t = window.setTimeout(() => {
        const i = pendingFlushTimers.indexOf(t);
        if (i !== -1) pendingFlushTimers.splice(i, 1);
        if (isFirebaseLedgerDataSyncDisabled()) return;
        void flushVoucherOutbox();
      }, delayMs);
      pendingFlushTimers.push(t);
    };
    const tick = () => {
      if (isFirebaseLedgerDataSyncDisabled()) return;
      void flushVoucherOutbox();
    };
    const onOnline = () => {
      if (onlineTimer != null) clearTimeout(onlineTimer);
      onlineTimer = window.setTimeout(() => {
        onlineTimer = null;
        scheduleFlush(FLUSH_AFTER_ONLINE_MS);
      }, ONLINE_DEBOUNCE_MS);
    };
    const onVisibleOrFocus = () => {
      if (document.visibilityState === "visible") {
        scheduleFlush(350);
      }
    };
    const onDataSyncChanged = (event: Event) => {
      const disabled = Boolean((event as CustomEvent<{ disabled?: boolean }>).detail?.disabled);
      if (!disabled) scheduleFlush(0);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onVisibleOrFocus);
    window.addEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, onDataSyncChanged);
    document.addEventListener("visibilitychange", onVisibleOrFocus);
    if (typeof navigator !== "undefined" && navigator.onLine && !isFirebaseLedgerDataSyncDisabled()) scheduleFlush(FLUSH_AFTER_ONLINE_MS);
    /** Periodic retry jab awaited flush fail / queue baaki ho — 15s→8s taake web/exe cross-device kam late */
    const iv = setInterval(tick, 8_000);
    return () => {
      if (onlineTimer != null) clearTimeout(onlineTimer);
      pendingFlushTimers.forEach((t) => clearTimeout(t));
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onVisibleOrFocus);
      window.removeEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, onDataSyncChanged);
      document.removeEventListener("visibilitychange", onVisibleOrFocus);
      clearInterval(iv);
    };
  }, []);
  return null;
}

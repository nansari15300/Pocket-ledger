"use client";

import { isFirebaseLedgerDeltaSqliteTransportMode } from "@/lib/firebaseLedgerSyncPolicy";

/**
 * Ledger SQLite-first transport (all platforms when deltaa is effective).
 * Writes → SQLite + outbox; remote edits → `_pl_change_log` (no collection onSnapshot).
 * Name kept for call-site compatibility; no longer limited to static/APK shells.
 */
export function isStaticApkLedgerTransportMode(): boolean {
  return isFirebaseLedgerDeltaSqliteTransportMode();
}

"use client";

import { isPlServerThinStaffClient, isPlServerThinStaffCompany } from "@/lib/plServerThinStaffClient";

/**
 * Mirror-first staff: offline is NOT view-only — user saves to SQLite and syncs when Host is reachable.
 * Kept for UI banners that previously gated Save; always returns false so Save stays enabled.
 */
export function plServerStaffOfflineViewOnly(_navigatorOnline: boolean): boolean {
  void _navigatorOnline;
  return false;
}

/**
 * Soft hint only — never blocks save. Offline / Host-down writes go to SQLite + pending queue.
 */
export async function getPlServerStaffSaveBlockedMessage(companyId: string): Promise<string | null> {
  if (!isPlServerThinStaffClient()) return null;
  if (!(await isPlServerThinStaffCompany(companyId))) return null;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return null; // offline save allowed (SQLite mirror)
  }

  return null;
}

/** Staff ledger write — always allowed; routing handles online vs pending vs local. */
export async function assertPlServerStaffWriteAllowed(_companyId: string): Promise<void> {
  /* no-op: mirror-first offline save */
}

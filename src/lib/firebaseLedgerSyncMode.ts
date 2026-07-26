"use client";

/**
 * Device preference for deltaa/live (sidebar → localStorage).
 * Runtime gates use `resolveFirebaseLedgerSyncPolicy()` so Admin plan settings
 * can later override via `getFirebaseLedgerSyncPlanOverride()` without rewriting call sites.
 */

import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";

export type FirebaseLedgerSyncMode = "local" | "full_online";

export const FIREBASE_LEDGER_SYNC_MODE_STORAGE_KEY = "pl_firebase_ledger_sync_mode_v1";
export const FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT = "pl-firebase-ledger-sync-mode-changed";

function defaultFirebaseLedgerSyncMode(): FirebaseLedgerSyncMode {
  return isEmbeddedOfflinePreloadClient() ? "local" : "full_online";
}

let cachedMode: FirebaseLedgerSyncMode | null = null;

function normalizeMode(raw: string | null | undefined): FirebaseLedgerSyncMode | null {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "local" || value === "sqlite" || value === "delta") return "local";
  if (value === "full_online" || value === "full-online" || value === "online") return "full_online";
  return null;
}

function readModeFromStorage(): FirebaseLedgerSyncMode {
  if (typeof window === "undefined") return defaultFirebaseLedgerSyncMode();
  try {
    return normalizeMode(window.localStorage.getItem(FIREBASE_LEDGER_SYNC_MODE_STORAGE_KEY)) ?? defaultFirebaseLedgerSyncMode();
  } catch {
    return defaultFirebaseLedgerSyncMode();
  }
}

function invalidateModeCache(): void {
  cachedMode = null;
}

export function getFirebaseLedgerSyncMode(): FirebaseLedgerSyncMode {
  if (cachedMode === null) cachedMode = readModeFromStorage();
  return cachedMode;
}

/** Device preference (sidebar). Effective mode after plan override: `resolveFirebaseLedgerSyncPolicy()`. */
export function isFirebaseLedgerLocalDeltaMode(): boolean {
  return getFirebaseLedgerSyncMode() === "local";
}

export function isFirebaseLedgerFullOnlineMode(): boolean {
  return getFirebaseLedgerSyncMode() === "full_online";
}

export function setFirebaseLedgerSyncMode(mode: FirebaseLedgerSyncMode): void {
  if (typeof window === "undefined") return;
  const next = normalizeMode(mode) ?? defaultFirebaseLedgerSyncMode();
  try {
    window.localStorage.setItem(FIREBASE_LEDGER_SYNC_MODE_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  cachedMode = next;
  try {
    window.dispatchEvent(
      new CustomEvent(FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, { detail: { mode: next } })
    );
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === FIREBASE_LEDGER_SYNC_MODE_STORAGE_KEY) {
      invalidateModeCache();
      try {
        window.dispatchEvent(
          new CustomEvent(FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, { detail: { mode: getFirebaseLedgerSyncMode() } })
        );
      } catch {
        /* ignore */
      }
    }
  });
}

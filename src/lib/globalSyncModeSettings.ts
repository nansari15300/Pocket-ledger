/**
 * SuperAdmin global: Firebase company sync mode (`app_settings/sync_mode`).
 * `full_online` (default) = Live sync with Firestore collection listeners (~300ms real-time updates).
 * `local` = Delta sync with SQLite + `_pl_change_log` feed (low Firebase reads, smooth on low internet).
 */
import { FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, type FirebaseLedgerSyncMode } from "@/lib/firebaseLedgerSyncMode";

export const SYNC_MODE_SETTINGS_DOC = "app_settings/sync_mode";
export const SYNC_MODE_SETTINGS_COLLECTION = "app_settings";
export const SYNC_MODE_SETTINGS_ID = "sync_mode";

export type GlobalSyncMode = FirebaseLedgerSyncMode; // "local" | "full_online"

export type GlobalSyncModeSettings = {
  mode: GlobalSyncMode;
  updatedAtMs: number;
};

export const DEFAULT_GLOBAL_SYNC_MODE_SETTINGS: GlobalSyncModeSettings = {
  mode: "full_online",
  updatedAtMs: 0,
};

const CACHE_KEY = "pl_global_sync_mode_settings_v1";

export function normalizeGlobalSyncMode(raw: unknown): GlobalSyncMode {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "local" || s === "delta" || s === "deltaa") return "local";
  return "full_online";
}

export function normalizeGlobalSyncModeSettings(raw: unknown): GlobalSyncModeSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GLOBAL_SYNC_MODE_SETTINGS };
  const o = raw as Partial<GlobalSyncModeSettings>;
  return {
    mode: normalizeGlobalSyncMode(o.mode),
    updatedAtMs: Number(o.updatedAtMs) || 0,
  };
}

export function readCachedGlobalSyncModeSettings(): GlobalSyncModeSettings {
  if (typeof window === "undefined") return { ...DEFAULT_GLOBAL_SYNC_MODE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...DEFAULT_GLOBAL_SYNC_MODE_SETTINGS };
    return normalizeGlobalSyncModeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GLOBAL_SYNC_MODE_SETTINGS };
  }
}

export function writeCachedGlobalSyncModeSettings(settings: GlobalSyncModeSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
    window.dispatchEvent(
      new CustomEvent(FIREBASE_LEDGER_SYNC_MODE_CHANGED_EVENT, { detail: { mode: settings.mode } })
    );
  } catch {
    /* ignore */
  }
}

let syncModeHydratePromise: Promise<GlobalSyncModeSettings> | null = null;

export async function ensureGlobalSyncModeSettingsHydrated(): Promise<GlobalSyncModeSettings> {
  if (typeof window === "undefined") return { ...DEFAULT_GLOBAL_SYNC_MODE_SETTINGS };
  if (!syncModeHydratePromise) {
    syncModeHydratePromise = (async () => {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const { firestore } = await import("@/lib/firebase");
        const snap = await getDoc(doc(firestore, SYNC_MODE_SETTINGS_COLLECTION, SYNC_MODE_SETTINGS_ID));
        const next = normalizeGlobalSyncModeSettings(snap.exists() ? snap.data() : undefined);
        writeCachedGlobalSyncModeSettings(next);
        return next;
      } catch {
        return readCachedGlobalSyncModeSettings();
      }
    })();
  }
  return syncModeHydratePromise;
}

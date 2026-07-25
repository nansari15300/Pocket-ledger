/**
 * Firebase company **ledger** data sync kill-switch.
 *
 * Toggle: sidebar switch (web + static/EXE/APK) → `localStorage`.
 * Code force (optional): `FIREBASE_LEDGER_DATA_SYNC_DISABLED_FORCE` agar non-null ho to UI override.
 *
 * Disabled (= sync off) hone par:
 * - Company ledger Firestore upload/download band
 * - Firebase Storage attachment upload/download band (pending sync, preview fetch, warm prefetch)
 * - Local SQLite read/write chalta rahe; `local:` pending attachments device par rahenge
 *
 * Disabled hone par bhi chalu:
 * - Plan sync, auth, billing HTTP, security rules
 *
 * Drive kill-switch alag: `localCloudSync/driveSyncDisabled.ts`
 */

export const FIREBASE_LEDGER_DATA_SYNC_STORAGE_KEY = "pl_firebase_ledger_data_sync_disabled";
export const FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT = "pl-firebase-ledger-data-sync-changed";

/**
 * Build-time force: `true` = hamesha band, `false` = hamesha chalu, `null` = UI/localStorage.
 * Temporary admin lock ke liye; normal use me `null` rakho.
 */
export const FIREBASE_LEDGER_DATA_SYNC_DISABLED_FORCE: boolean | null = null;

/** First visit default — sync OFF (disabled=true). */
const DEFAULT_DISABLED = true;

export const FIREBASE_LEDGER_DATA_SYNC_DISABLED_MESSAGE =
  "Firebase company data sync is temporarily disabled — local SQLite only.";

let cachedDisabled: boolean | null = null;

function readDisabledFromStorage(): boolean {
  if (typeof window === "undefined") return DEFAULT_DISABLED;
  try {
    const raw = window.localStorage.getItem(FIREBASE_LEDGER_DATA_SYNC_STORAGE_KEY);
    if (raw === null || raw === "") return DEFAULT_DISABLED;
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* ignore */
  }
  return DEFAULT_DISABLED;
}

function invalidateDisabledCache(): void {
  cachedDisabled = null;
}

function emitDisabledChanged(disabled: boolean): void {
  if (typeof window === "undefined") return;
  // Toggle handler se sync dispatch mat karo — listener teardown + SQLite reload same tick me EXE hang/crash.
  const dispatch = () => {
    try {
      window.dispatchEvent(
        new CustomEvent(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, { detail: { disabled } })
      );
    } catch {
      /* ignore */
    }
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(dispatch);
    return;
  }
  window.setTimeout(dispatch, 0);
}

/** Ledger Firestore upload/download band? (hot path — memory cache, localStorage har call pe nahi). */
export function isFirebaseLedgerDataSyncDisabled(): boolean {
  if (FIREBASE_LEDGER_DATA_SYNC_DISABLED_FORCE !== null) {
    return FIREBASE_LEDGER_DATA_SYNC_DISABLED_FORCE;
  }
  if (cachedDisabled === null) {
    cachedDisabled = readDisabledFromStorage();
  }
  return cachedDisabled;
}

/** Cloud data sync switch: true = upload/download chalu. */
export function isFirebaseLedgerDataSyncEnabled(): boolean {
  return !isFirebaseLedgerDataSyncDisabled();
}

export function setFirebaseLedgerDataSyncDisabled(disabled: boolean): void {
  if (typeof window === "undefined") return;
  if (FIREBASE_LEDGER_DATA_SYNC_DISABLED_FORCE !== null) return;
  cachedDisabled = disabled;
  try {
    window.localStorage.setItem(FIREBASE_LEDGER_DATA_SYNC_STORAGE_KEY, disabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  emitDisabledChanged(disabled);
}

export function setFirebaseLedgerDataSyncEnabled(enabled: boolean): void {
  setFirebaseLedgerDataSyncDisabled(!enabled);
}

/** Multi-tab: dusri tab ne toggle kiya to cache refresh + same-tab listeners notify. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== FIREBASE_LEDGER_DATA_SYNC_STORAGE_KEY) return;
    invalidateDisabledCache();
    emitDisabledChanged(isFirebaseLedgerDataSyncDisabled());
  });
}

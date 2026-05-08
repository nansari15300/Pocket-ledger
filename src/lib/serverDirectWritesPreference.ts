/**
 * Static/APK: user sidebar switch — ON = voucher/master writes Firestore pe seedha;
 * OFF = SQLite/outbox-first (purana behaviour). Reads mirror SQLite par rehte hain (alag policy).
 */

export const PL_SERVER_DIRECT_WRITES_KEY = "plServerDirectWrites";

/** CustomEvent `type` — multi-tab + React Provider sync */
export const PL_SERVER_DIRECT_WRITES_CHANGED_EVENT = "pl-server-direct-writes-changed";

/** Sync read — `voucherActionsClient` / policy har save par bhi yahi */
export function readServerDirectWritesPreferredSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PL_SERVER_DIRECT_WRITES_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeServerDirectWritesPreferred(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(PL_SERVER_DIRECT_WRITES_KEY, "1");
    else window.localStorage.removeItem(PL_SERVER_DIRECT_WRITES_KEY);
    window.dispatchEvent(new CustomEvent(PL_SERVER_DIRECT_WRITES_CHANGED_EVENT));
  } catch {
    /* quota / private mode */
  }
}

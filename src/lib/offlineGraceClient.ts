/**
 * Offline grace period: app can be used offline only for 7 days.
 * When user goes online, the 7-day window resets from that moment.
 * Used by all builds (Web, EXE, APK, etc.).
 */

const STORAGE_KEY = "pocket_ledger_last_online_at";
export const OFFLINE_GRACE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getLastOnlineAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = parseInt(raw, 10);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function setLastOnlineAt(ms: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(ms));
  } catch {
    // ignore
  }
}

/** Expiry time (ms) for offline use: lastOnlineAt + 7 days. */
export function getOfflineExpiryMs(): number | null {
  const last = getLastOnlineAt();
  if (last == null) return null;
  return last + OFFLINE_GRACE_DAYS * MS_PER_DAY;
}

/** True if currently past the 7-day offline window (and we're offline). */
export function isOfflineGraceExpired(): boolean {
  const last = getLastOnlineAt();
  if (last == null) return false; // no record => allow (will set on next online)
  const expiry = last + OFFLINE_GRACE_DAYS * MS_PER_DAY;
  return Date.now() > expiry;
}

/** Days remaining in offline grace (0 if expired or online). Only meaningful when offline. */
export function getOfflineDaysRemaining(): number {
  const last = getLastOnlineAt();
  if (last == null) return OFFLINE_GRACE_DAYS;
  const expiry = last + OFFLINE_GRACE_DAYS * MS_PER_DAY;
  const now = Date.now();
  if (now >= expiry) return 0;
  const msLeft = expiry - now;
  return Math.max(0, Math.ceil(msLeft / MS_PER_DAY));
}

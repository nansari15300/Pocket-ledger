"use client";

/**
 * Offline company unlock: "Remember for X days" — localStorage me session (token + user) tab tak rakho.
 * Firebase uid + companyId se key; alag account / company alag remember.
 */

const STORAGE_PREFIX = "offlineCompanyUnlockRemember_v1";

/** UI "Never" option: expiry itni door ki practically dubara password na puche (ECMAScript max Date). */
const REMEMBER_UNTIL_MAX_MS = 8640000000000000;

/** Dropdown se "Never" — saveOfflineUnlockSession me days ke saath bhejo. */
export const OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS = -1;

function storageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = firebaseUid?.trim() || "no_uid";
  return `${STORAGE_PREFIX}_${uid}_${companyId}`;
}

export type StoredOfflineUnlockSession = {
  until: number;
  token: string;
  user: { id: string; username: string; displayName?: string; role?: string };
};

/** Abhi tak valid saved session hai ya nahi. */
export function readStoredOfflineUnlockSession(
  firebaseUid: string | undefined,
  companyId: string
): StoredOfflineUnlockSession | null {
  if (typeof window === "undefined" || !companyId) return null;
  try {
    const raw = localStorage.getItem(storageKey(firebaseUid, companyId));
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredOfflineUnlockSession;
    if (typeof data.until !== "number" || data.until <= Date.now()) {
      localStorage.removeItem(storageKey(firebaseUid, companyId));
      return null;
    }
    if (!data.token || !data.user?.id) return null;
    return data;
  } catch {
    return null;
  }
}

/** Successful unlock ke baad — days 0 = mat yaad rakho; NEVER sentinel = max expiry; warna N din. */
export function saveOfflineUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  days: number,
  token: string,
  user: { id: string; username: string; displayName?: string; role?: string }
): void {
  if (typeof window === "undefined" || !companyId) return;
  const key = storageKey(firebaseUid, companyId);
  if (days === 0) {
    localStorage.removeItem(key);
    return;
  }
  const until =
    days === OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS
      ? REMEMBER_UNTIL_MAX_MS
      : Date.now() + days * 24 * 60 * 60 * 1000;
  const payload: StoredOfflineUnlockSession = { until, token, user };
  localStorage.setItem(key, JSON.stringify(payload));
}

export function clearOfflineUnlockSession(firebaseUid: string | undefined, companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  localStorage.removeItem(storageKey(firebaseUid, companyId));
}

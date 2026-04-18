"use client";

/**
 * Online (Firestore) company: owner/shared unlock sirf company password se —
 * "Remember for X days" ke liye offline jaisa hi localStorage expiry (token nahi, sirf until).
 * Firebase login uid + companyId se key; device/account alag ho to alag remember.
 */

import { OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS } from "@/lib/offlineCompanyUnlockRemember";

const STORAGE_PREFIX = "cloudCompanyPasswordUnlock_v1";

/** UI "Never" — practically dubara password na puche */
const REMEMBER_UNTIL_MAX_MS = 8640000000000000;

function storageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = firebaseUid?.trim() || "no_uid";
  return `${STORAGE_PREFIX}_${uid}_${companyId}`;
}

type Stored = { until: number };

/** Abhi valid saved "unlocked" window hai — tab password dialog mat dikhao */
export function readCloudCompanyPasswordUnlockSession(
  firebaseUid: string | undefined,
  companyId: string
): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  try {
    const raw = localStorage.getItem(storageKey(firebaseUid, companyId));
    if (!raw) return false;
    const data = JSON.parse(raw) as Stored;
    if (typeof data.until !== "number" || data.until <= Date.now()) {
      localStorage.removeItem(storageKey(firebaseUid, companyId));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Successful online unlock ke baad — days 0 = mat yaad rakho */
export function saveCloudCompanyPasswordUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  days: number
): void {
  if (typeof window === "undefined" || !companyId) return;
  const key = storageKey(firebaseUid, companyId);
  if (days === 0) {
    localStorage.removeItem(key);
    return;
  }
  const until =
    days === OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS ? REMEMBER_UNTIL_MAX_MS : Date.now() + days * 24 * 60 * 60 * 1000;
  const payload: Stored = { until };
  localStorage.setItem(key, JSON.stringify(payload));
}

export function clearCloudCompanyPasswordUnlockSession(firebaseUid: string | undefined, companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  localStorage.removeItem(storageKey(firebaseUid, companyId));
}

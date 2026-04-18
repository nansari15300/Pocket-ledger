"use client";

/**
 * Shared cloud company unlock: optional "Remember username" — sirf username string,
 * password kabhi store nahi (offline remember session se alag).
 */

const STORAGE_PREFIX = "sharedCompanyUnlockRememberUsername_v1";

function storageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = firebaseUid?.trim() || "no_uid";
  return `${STORAGE_PREFIX}_${uid}_${companyId}`;
}

export function readRememberedSharedUnlockUsername(
  firebaseUid: string | undefined,
  companyId: string
): string | null {
  if (typeof window === "undefined" || !companyId) return null;
  try {
    const raw = localStorage.getItem(storageKey(firebaseUid, companyId))?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function saveRememberedSharedUnlockUsername(
  firebaseUid: string | undefined,
  companyId: string,
  username: string
): void {
  if (typeof window === "undefined" || !companyId) return;
  const u = username.trim();
  if (!u) {
    localStorage.removeItem(storageKey(firebaseUid, companyId));
    return;
  }
  try {
    localStorage.setItem(storageKey(firebaseUid, companyId), u);
  } catch {
    /* quota / private mode */
  }
}

export function clearRememberedSharedUnlockUsername(firebaseUid: string | undefined, companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  try {
    localStorage.removeItem(storageKey(firebaseUid, companyId));
  } catch {
    /* ignore */
  }
}

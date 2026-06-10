"use client";

/**
 * Shared cloud company unlock: optional "Remember username" — sirf username string,
 * password kabhi store nahi (offline remember session se alag).
 */

const STORAGE_PREFIX = "sharedCompanyUnlockRememberUsername_v1";

function normalizeUnlockUid(firebaseUid: string | undefined): string {
  const uid = firebaseUid?.trim() || "";
  if (!uid || uid.startsWith("local:")) return "no_uid";
  return uid;
}

function normalizeUnlockEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

function storageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = normalizeUnlockUid(firebaseUid);
  return `${STORAGE_PREFIX}_${uid}_${companyId}`;
}

function emailStorageKey(email: string | null | undefined, companyId: string): string | null {
  const e = normalizeUnlockEmail(email);
  if (!e || !companyId) return null;
  return `${STORAGE_PREFIX}_email_${e}_${companyId}`;
}

function collectKeys(firebaseUid: string | undefined, companyId: string, userEmail?: string | null): string[] {
  const keys = new Set<string>();
  keys.add(storageKey(firebaseUid, companyId));
  keys.add(storageKey(undefined, companyId));
  const ek = emailStorageKey(userEmail, companyId);
  if (ek) keys.add(ek);
  return [...keys];
}

export function readRememberedSharedUnlockUsername(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): string | null {
  if (typeof window === "undefined" || !companyId) return null;
  try {
    for (const k of collectKeys(firebaseUid, companyId, userEmail)) {
      const raw = localStorage.getItem(k)?.trim();
      if (raw) return raw;
    }
    const suffix = `_${companyId}`;
    const uidNorm = normalizeUnlockUid(firebaseUid);
    const emailNorm = normalizeUnlockEmail(userEmail);
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_PREFIX}_`) || !key.endsWith(suffix)) continue;
      const matches =
        key.includes(`_${uidNorm}_`) ||
        key.includes("_no_uid_") ||
        (emailNorm && key.includes(`_email_${emailNorm}_`));
      if (!matches) continue;
      const raw = localStorage.getItem(key)?.trim();
      if (raw) return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveRememberedSharedUnlockUsername(
  firebaseUid: string | undefined,
  companyId: string,
  username: string,
  userEmail?: string | null
): void {
  if (typeof window === "undefined" || !companyId) return;
  const u = username.trim();
  const keys = collectKeys(firebaseUid, companyId, userEmail);
  if (!u) {
    for (const k of keys) localStorage.removeItem(k);
    return;
  }
  try {
    for (const k of keys) localStorage.setItem(k, u);
  } catch {
    /* quota / private mode */
  }
}

export function clearRememberedSharedUnlockUsername(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): void {
  if (typeof window === "undefined" || !companyId) return;
  try {
    for (const k of collectKeys(firebaseUid, companyId, userEmail)) {
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

export function clearAllRememberedSharedUnlockUsernamesForUser(
  firebaseUid: string | undefined,
  userEmail?: string | null
): void {
  if (typeof window === "undefined") return;
  const uidNorm = normalizeUnlockUid(firebaseUid);
  const emailNorm = normalizeUnlockEmail(userEmail);
  const keysToRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${STORAGE_PREFIX}_`)) continue;
      const matches =
        key.includes(`_${uidNorm}_`) ||
        key.includes("_no_uid_") ||
        (emailNorm && key.includes(`_email_${emailNorm}_`));
      if (matches) keysToRemove.push(key);
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

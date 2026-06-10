"use client";

/**
 * Online (Firestore) company: owner/shared unlock sirf company password se —
 * "Remember for X days" ke liye offline jaisa hi localStorage expiry (token nahi, sirf until).
 * Firebase uid + companyId (+ email backup) se key; har company alag remember.
 */

import { OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS } from "@/lib/offlineCompanyUnlockRemember";

const STORAGE_PREFIX = "cloudCompanyPasswordUnlock_v1";
const PREF_PREFIX = "cloudCompanyPasswordUnlockPref_v1";

/** UI "Never" — practically dubara password na puche */
const REMEMBER_UNTIL_MAX_MS = 8640000000000000;

function normalizeCloudUnlockUid(firebaseUid: string | undefined): string {
  const uid = firebaseUid?.trim() || "";
  if (!uid || uid.startsWith("local:")) return "no_uid";
  return uid;
}

function normalizeUnlockEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

function storageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = normalizeCloudUnlockUid(firebaseUid);
  return `${STORAGE_PREFIX}_${uid}_${companyId}`;
}

function emailStorageKey(email: string | null | undefined, companyId: string): string | null {
  const e = normalizeUnlockEmail(email);
  if (!e || !companyId) return null;
  return `${STORAGE_PREFIX}_email_${e}_${companyId}`;
}

function prefStorageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = normalizeCloudUnlockUid(firebaseUid);
  return `${PREF_PREFIX}_${uid}_${companyId}`;
}

function prefEmailStorageKey(email: string | null | undefined, companyId: string): string | null {
  const e = normalizeUnlockEmail(email);
  if (!e || !companyId) return null;
  return `${PREF_PREFIX}_email_${e}_${companyId}`;
}

type Stored = { until: number };

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Stored;
    if (typeof data.until !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

function isStoredValid(data: Stored | null): boolean {
  return !!data && typeof data.until === "number" && data.until > Date.now();
}

function isStoredExpired(data: Stored | null): boolean {
  return !!data && typeof data.until === "number" && data.until <= Date.now();
}

function collectUnlockKeys(firebaseUid: string | undefined, companyId: string, userEmail?: string | null): string[] {
  const keys = new Set<string>();
  keys.add(storageKey(firebaseUid, companyId));
  keys.add(storageKey(undefined, companyId));
  const ek = emailStorageKey(userEmail, companyId);
  if (ek) keys.add(ek);
  return [...keys];
}

function collectPrefKeys(firebaseUid: string | undefined, companyId: string, userEmail?: string | null): string[] {
  const keys = new Set<string>();
  keys.add(prefStorageKey(firebaseUid, companyId));
  keys.add(prefStorageKey(undefined, companyId));
  const ek = prefEmailStorageKey(userEmail, companyId);
  if (ek) keys.add(ek);
  return [...keys];
}

/** APK/EXE: uid late hydrate — kisi bhi valid key par company remember mil jaye. */
function readAnyStoredCloudUnlockForCompany(
  companyId: string,
  firebaseUid?: string,
  userEmail?: string | null
): Stored | null {
  if (typeof window === "undefined" || !companyId) return null;
  const suffix = `_${companyId}`;
  const uidNorm = normalizeCloudUnlockUid(firebaseUid);
  const emailNorm = normalizeUnlockEmail(userEmail);
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_PREFIX}_`) || !key.endsWith(suffix)) continue;
      const matchesUser =
        key.includes(`_${uidNorm}_`) ||
        key.includes("_no_uid_") ||
        (emailNorm && key.includes(`_email_${emailNorm}_`));
      if (!matchesUser) continue;
      const data = parseStored(localStorage.getItem(key));
      if (isStoredValid(data)) return data;
      if (isStoredExpired(data)) localStorage.removeItem(key);
      continue;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function migrateLegacySyntheticCloudUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): boolean {
  if (typeof window === "undefined") return false;
  const targetKeys = collectUnlockKeys(firebaseUid, companyId, userEmail);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith(`${STORAGE_PREFIX}_local:`) || !k.endsWith(`_${companyId}`)) continue;
      const data = parseStored(localStorage.getItem(k));
      if (!isStoredValid(data)) {
        localStorage.removeItem(k);
        continue;
      }
      for (const tk of targetKeys) localStorage.setItem(tk, JSON.stringify({ until: data.until }));
      localStorage.removeItem(k);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function migrateLegacySyntheticCloudPref(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): number {
  if (typeof window === "undefined") return 0;
  const targetKeys = collectPrefKeys(firebaseUid, companyId, userEmail);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith(`${PREF_PREFIX}_local:`) || !k.endsWith(`_${companyId}`)) continue;
      const raw = localStorage.getItem(k);
      if (raw == null || raw === "") {
        localStorage.removeItem(k);
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        localStorage.removeItem(k);
        continue;
      }
      for (const tk of targetKeys) localStorage.setItem(tk, String(n));
      localStorage.removeItem(k);
      return n;
    }
  } catch {
    return 0;
  }
  return 0;
}

function migrateNoUidCloudUnlockSessionToUser(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): boolean {
  const real = firebaseUid?.trim();
  if (!real || real === "no_uid") return false;
  const orphanKey = storageKey(undefined, companyId);
  const data = parseStored(localStorage.getItem(orphanKey));
  if (!isStoredValid(data)) {
    if (data) localStorage.removeItem(orphanKey);
    return false;
  }
  for (const tk of collectUnlockKeys(firebaseUid, companyId, userEmail)) {
    localStorage.setItem(tk, JSON.stringify({ until: data.until }));
  }
  localStorage.removeItem(orphanKey);
  return true;
}

function migrateNoUidCloudPrefToUser(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): number {
  const real = firebaseUid?.trim();
  if (!real || real === "no_uid") return 0;
  const orphanKey = prefStorageKey(undefined, companyId);
  const raw = localStorage.getItem(orphanKey);
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    localStorage.removeItem(orphanKey);
    return 0;
  }
  for (const tk of collectPrefKeys(firebaseUid, companyId, userEmail)) {
    localStorage.setItem(tk, String(n));
  }
  localStorage.removeItem(orphanKey);
  return n;
}

/** Last successful "Remember for" days (0 = har baar poochho) — sirf local, multi-company per key. */
export function readCloudCompanyPasswordUnlockPreferenceDays(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): number {
  if (typeof window === "undefined" || !companyId) return 0;
  try {
    for (const k of collectPrefKeys(firebaseUid, companyId, userEmail)) {
      const raw = localStorage.getItem(k);
      if (raw != null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
      }
    }
    const migrated = migrateNoUidCloudPrefToUser(firebaseUid, companyId, userEmail);
    if (migrated) return migrated;
    return migrateLegacySyntheticCloudPref(firebaseUid, companyId, userEmail);
  } catch {
    return 0;
  }
}

function saveCloudCompanyPasswordUnlockPreferenceDays(
  firebaseUid: string | undefined,
  companyId: string,
  days: number,
  userEmail?: string | null
): void {
  if (typeof window === "undefined" || !companyId) return;
  const keys = collectPrefKeys(firebaseUid, companyId, userEmail);
  if (days === 0) {
    for (const k of keys) localStorage.removeItem(k);
    return;
  }
  for (const k of keys) localStorage.setItem(k, String(days));
}

/** Abhi valid saved "unlocked" window hai — tab password dialog mat dikhao */
export function readCloudCompanyPasswordUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  try {
    for (const key of collectUnlockKeys(firebaseUid, companyId, userEmail)) {
      const data = parseStored(localStorage.getItem(key));
      if (isStoredValid(data)) return true;
      if (isStoredExpired(data)) localStorage.removeItem(key);
    }
    if (migrateNoUidCloudUnlockSessionToUser(firebaseUid, companyId, userEmail)) return true;
    if (migrateLegacySyntheticCloudUnlockSession(firebaseUid, companyId, userEmail)) return true;
    const any = readAnyStoredCloudUnlockForCompany(companyId, firebaseUid, userEmail);
    if (any) {
      for (const tk of collectUnlockKeys(firebaseUid, companyId, userEmail)) {
        localStorage.setItem(tk, JSON.stringify({ until: any.until }));
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Successful online unlock ke baad — days 0 = mat yaad rakho */
export function saveCloudCompanyPasswordUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  days: number,
  userEmail?: string | null
): void {
  if (typeof window === "undefined" || !companyId) return;
  const keys = collectUnlockKeys(firebaseUid, companyId, userEmail);
  if (days === 0) {
    for (const k of keys) localStorage.removeItem(k);
    saveCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, companyId, 0, userEmail);
    return;
  }
  const until =
    days === OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS ? REMEMBER_UNTIL_MAX_MS : Date.now() + days * 24 * 60 * 60 * 1000;
  const payload: Stored = { until };
  for (const k of keys) localStorage.setItem(k, JSON.stringify(payload));
  saveCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, companyId, days, userEmail);
}

export function clearCloudCompanyPasswordUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): void {
  if (typeof window === "undefined" || !companyId) return;
  for (const k of collectUnlockKeys(firebaseUid, companyId, userEmail)) {
    localStorage.removeItem(k);
  }
  saveCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, companyId, 0, userEmail);
}

/** Logout: is account ke saare company unlock remember entries hatao. */
export function clearAllCloudCompanyPasswordUnlockSessionsForUser(
  firebaseUid: string | undefined,
  userEmail?: string | null
): void {
  if (typeof window === "undefined") return;
  const uidNorm = normalizeCloudUnlockUid(firebaseUid);
  const emailNorm = normalizeUnlockEmail(userEmail);
  const keysToRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isUnlock = key.startsWith(`${STORAGE_PREFIX}_`);
      const isPref = key.startsWith(`${PREF_PREFIX}_`);
      if (!isUnlock && !isPref) continue;
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

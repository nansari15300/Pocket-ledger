"use client";

/**
 * Offline company unlock: "Remember for X days" — localStorage me session (token + user) tab tak rakho.
 * Firebase uid + companyId (+ email backup) se key; alag account / company alag remember.
 */

const STORAGE_PREFIX = "offlineCompanyUnlockRemember_v1";
const PREF_PREFIX = "offlineCompanyUnlockPref_v1";

/** UI "Never" option: expiry itni door ki practically dubara password na puche (ECMAScript max Date). */
const REMEMBER_UNTIL_MAX_MS = 8640000000000000;

/** Dropdown se "Never" — saveOfflineUnlockSession me days ke saath bhejo. */
export const OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS = -1;

function normalizeUnlockEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

function normalizeOfflineUnlockUid(firebaseUid: string | undefined): string {
  const uid = firebaseUid?.trim() || "";
  if (!uid || uid.startsWith("local:")) return "no_uid";
  return uid;
}

function storageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = normalizeOfflineUnlockUid(firebaseUid);
  return `${STORAGE_PREFIX}_${uid}_${companyId}`;
}

function emailStorageKey(email: string | null | undefined, companyId: string): string | null {
  const e = normalizeUnlockEmail(email);
  if (!e || !companyId) return null;
  return `${STORAGE_PREFIX}_email_${e}_${companyId}`;
}

function prefStorageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = normalizeOfflineUnlockUid(firebaseUid);
  return `${PREF_PREFIX}_${uid}_${companyId}`;
}

function prefEmailStorageKey(email: string | null | undefined, companyId: string): string | null {
  const e = normalizeUnlockEmail(email);
  if (!e || !companyId) return null;
  return `${PREF_PREFIX}_email_${e}_${companyId}`;
}

function collectUnlockKeys(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): string[] {
  const keys = new Set<string>();
  keys.add(storageKey(firebaseUid, companyId));
  keys.add(storageKey(undefined, companyId));
  const ek = emailStorageKey(userEmail, companyId);
  if (ek) keys.add(ek);
  return [...keys];
}

function collectPrefKeys(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): string[] {
  const keys = new Set<string>();
  keys.add(prefStorageKey(firebaseUid, companyId));
  keys.add(prefStorageKey(undefined, companyId));
  const ek = prefEmailStorageKey(userEmail, companyId);
  if (ek) keys.add(ek);
  return [...keys];
}

export type StoredOfflineUnlockSession = {
  until: number;
  token: string;
  user: { id: string; username: string; displayName?: string; role?: string };
};

function parseStored(raw: string | null): StoredOfflineUnlockSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as StoredOfflineUnlockSession;
    if (typeof data.until !== "number") return null;
    if (!data.token || !data.user?.id) return null;
    return data;
  } catch {
    return null;
  }
}

function isStoredValid(data: StoredOfflineUnlockSession | null): boolean {
  return !!data && typeof data.until === "number" && data.until > Date.now();
}

function isStoredExpired(data: StoredOfflineUnlockSession | null): boolean {
  return !!data && typeof data.until === "number" && data.until <= Date.now();
}

/** Fast-start: remembered local company session ko uid ke bina bhi dhundo (APK cold boot me Firebase uid late aata hai). */
export function readAnyStoredOfflineUnlockSessionForCompany(companyId: string): StoredOfflineUnlockSession | null {
  if (typeof window === "undefined" || !companyId) return null;
  try {
    const suffix = `_${companyId}`;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_PREFIX}_`) || !key.endsWith(suffix)) continue;
      if (key.startsWith(PREF_PREFIX)) continue;
      const data = parseStored(localStorage.getItem(key));
      if (isStoredValid(data)) return data;
      if (isStoredExpired(data)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore malformed remembered sessions */
  }
  return null;
}

function migrateNoUidOfflineUnlockSessionToUser(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): StoredOfflineUnlockSession | null {
  const real = firebaseUid?.trim();
  if (!real || real === "no_uid") return null;
  const orphanKey = storageKey(undefined, companyId);
  const data = parseStored(localStorage.getItem(orphanKey));
  if (!isStoredValid(data)) {
    if (data) localStorage.removeItem(orphanKey);
    return null;
  }
  const raw = JSON.stringify(data);
  for (const tk of collectUnlockKeys(firebaseUid, companyId, userEmail)) {
    localStorage.setItem(tk, raw);
  }
  localStorage.removeItem(orphanKey);
  return data;
}

function migrateNoUidOfflinePrefToUser(
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

/** Abhi tak valid saved session hai ya nahi. */
export function readStoredOfflineUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): StoredOfflineUnlockSession | null {
  if (typeof window === "undefined" || !companyId) return null;
  try {
    for (const key of collectUnlockKeys(firebaseUid, companyId, userEmail)) {
      const data = parseStored(localStorage.getItem(key));
      if (isStoredValid(data)) return data;
      if (isStoredExpired(data)) localStorage.removeItem(key);
    }
    const migrated = migrateNoUidOfflineUnlockSessionToUser(firebaseUid, companyId, userEmail);
    if (migrated) return migrated;
    return null;
  } catch {
    return null;
  }
}

export function hasValidStoredOfflineUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): boolean {
  return readStoredOfflineUnlockSession(firebaseUid, companyId, userEmail) != null;
}

/** Last chosen "Remember for" days — dialog reopen par wahi default. */
export function readOfflineUnlockPreferenceDays(
  firebaseUid: string | undefined,
  companyId: string,
  userEmail?: string | null
): number {
  if (typeof window === "undefined" || !companyId) return 0;
  try {
    for (const key of collectPrefKeys(firebaseUid, companyId, userEmail)) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    const migrated = migrateNoUidOfflinePrefToUser(firebaseUid, companyId, userEmail);
    if (migrated) return migrated;
  } catch {
    /* ignore */
  }
  return 0;
}

function saveOfflineUnlockPreferenceDays(
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

/** Successful unlock ke baad — days 0 = mat yaad rakho; NEVER sentinel = max expiry; warna N din. */
export function saveOfflineUnlockSession(
  firebaseUid: string | undefined,
  companyId: string,
  days: number,
  token: string,
  user: { id: string; username: string; displayName?: string; role?: string },
  userEmail?: string | null
): void {
  if (typeof window === "undefined" || !companyId) return;
  const keys = collectUnlockKeys(firebaseUid, companyId, userEmail);
  if (days === 0) {
    for (const k of keys) localStorage.removeItem(k);
    saveOfflineUnlockPreferenceDays(firebaseUid, companyId, 0, userEmail);
    return;
  }
  const until =
    days === OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS
      ? REMEMBER_UNTIL_MAX_MS
      : Date.now() + days * 24 * 60 * 60 * 1000;
  const payload: StoredOfflineUnlockSession = { until, token, user };
  const raw = JSON.stringify(payload);
  for (const k of keys) localStorage.setItem(k, raw);
  saveOfflineUnlockPreferenceDays(firebaseUid, companyId, days, userEmail);
}

export function clearOfflineUnlockSession(firebaseUid: string | undefined, companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  for (const k of collectUnlockKeys(firebaseUid, companyId)) {
    localStorage.removeItem(k);
  }
  saveOfflineUnlockPreferenceDays(firebaseUid, companyId, 0);
}

/** Gate delete / company purge — saari remember keys is company ke liye (uid/email variants). */
export function clearAllOfflineUnlockSessionsForCompany(companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  const cid = String(companyId).trim();
  if (!cid) return;
  const suffix = `_${cid}`;
  const keysToRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        (key.startsWith(`${STORAGE_PREFIX}_`) || key.startsWith(`${PREF_PREFIX}_`)) &&
        key.endsWith(suffix)
      ) {
        keysToRemove.push(key);
      }
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Logout: is account ke saare offline company unlock sessions hatao. */
export function clearAllOfflineUnlockSessionsForUser(firebaseUid: string | undefined): void {
  if (typeof window === "undefined") return;
  const uidNorm = normalizeOfflineUnlockUid(firebaseUid);
  const keysToRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${STORAGE_PREFIX}_`) && !key?.startsWith(PREF_PREFIX)) continue;
      if (key.includes(`_${uidNorm}_`) || key.includes("_no_uid_") || key.includes("_email_")) {
        keysToRemove.push(key);
      }
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

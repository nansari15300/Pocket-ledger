"use client";

/**
 * Online (Firestore) company: owner/shared unlock sirf company password se —
 * "Remember for X days" ke liye offline jaisa hi localStorage expiry (token nahi, sirf until).
 * Firebase login uid + companyId se key; device/account alag ho to alag remember.
 * `no_uid` fallback: unlock ke waqt kabhi `user.uid` late ho to entry galat key par save ho sakti thi —
 * read par migrate karke current uid par bandho (offline remember jaisa strict multi-company local).
 */

import { OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS } from "@/lib/offlineCompanyUnlockRemember";

const STORAGE_PREFIX = "cloudCompanyPasswordUnlock_v1";
/** Last "Remember for" dropdown — session expiry ke baad bhi default ke liye (server par nahi). */
const PREF_PREFIX = "cloudCompanyPasswordUnlockPref_v1";

/** UI "Never" — practically dubara password na puche */
const REMEMBER_UNTIL_MAX_MS = 8640000000000000;

function normalizeCloudUnlockUid(firebaseUid: string | undefined): string {
  const uid = firebaseUid?.trim() || "";
  // Embedded/local synthetic uid stable auth identity nahi hota; remember key ko shared fallback bucket par rakho.
  if (!uid || uid.startsWith("local:")) return "no_uid";
  return uid;
}

function storageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = normalizeCloudUnlockUid(firebaseUid);
  return `${STORAGE_PREFIX}_${uid}_${companyId}`;
}

function prefStorageKey(firebaseUid: string | undefined, companyId: string): string {
  const uid = normalizeCloudUnlockUid(firebaseUid);
  return `${PREF_PREFIX}_${uid}_${companyId}`;
}

type Stored = { until: number };

function migrateLegacySyntheticCloudUnlockSession(firebaseUid: string | undefined, companyId: string): boolean {
  if (typeof window === "undefined") return false;
  const canonicalKey = storageKey(firebaseUid, companyId);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Purana format: `cloudCompanyPasswordUnlock_v1_local:*_{companyId}` — normalize karke canonical key me le aao.
      if (!k.startsWith(`${STORAGE_PREFIX}_local:`) || !k.endsWith(`_${companyId}`)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const data = JSON.parse(raw) as Stored;
      if (typeof data.until !== "number" || data.until <= Date.now()) {
        localStorage.removeItem(k);
        continue;
      }
      localStorage.setItem(canonicalKey, JSON.stringify({ until: data.until }));
      localStorage.removeItem(k);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function migrateLegacySyntheticCloudPref(firebaseUid: string | undefined, companyId: string): number {
  if (typeof window === "undefined") return 0;
  const canonicalKey = prefStorageKey(firebaseUid, companyId);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Purana format: `cloudCompanyPasswordUnlockPref_v1_local:*_{companyId}` ko canonical pref key me migrate.
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
      localStorage.setItem(canonicalKey, String(n));
      localStorage.removeItem(k);
      return n;
    }
  } catch {
    return 0;
  }
  return 0;
}

/** Purani `no_uid` session ko real Firebase uid key par shift karo taaki dubara password na puche. */
function migrateNoUidCloudUnlockSessionToUser(firebaseUid: string | undefined, companyId: string): boolean {
  const real = firebaseUid?.trim();
  if (!real || real === "no_uid") return false;
  const orphanKey = storageKey(undefined, companyId);
  const canonicalKey = storageKey(firebaseUid, companyId);
  if (orphanKey === canonicalKey) return false;
  try {
    const raw = localStorage.getItem(orphanKey);
    if (!raw) return false;
    const data = JSON.parse(raw) as Stored;
    if (typeof data.until !== "number" || data.until <= Date.now()) {
      localStorage.removeItem(orphanKey);
      return false;
    }
    localStorage.removeItem(orphanKey);
    localStorage.setItem(canonicalKey, JSON.stringify({ until: data.until }));
    return true;
  } catch {
    return false;
  }
}

/** Dropdown default: pehle exact uid, phir `no_uid` pref migrate. */
function migrateNoUidCloudPrefToUser(firebaseUid: string | undefined, companyId: string): number {
  const real = firebaseUid?.trim();
  if (!real || real === "no_uid") return 0;
  const orphanKey = prefStorageKey(undefined, companyId);
  const canonicalKey = prefStorageKey(firebaseUid, companyId);
  if (orphanKey === canonicalKey) return 0;
  try {
    const raw = localStorage.getItem(orphanKey);
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      localStorage.removeItem(orphanKey);
      return 0;
    }
    localStorage.removeItem(orphanKey);
    localStorage.setItem(canonicalKey, String(n));
    return n;
  } catch {
    return 0;
  }
}

/** Last successful "Remember for" days (0 = har baar poochho) — sirf local, multi-company per key. */
export function readCloudCompanyPasswordUnlockPreferenceDays(
  firebaseUid: string | undefined,
  companyId: string
): number {
  if (typeof window === "undefined" || !companyId) return 0;
  try {
    const k = prefStorageKey(firebaseUid, companyId);
    const raw = localStorage.getItem(k);
    if (raw != null && raw !== "") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    const migrated = migrateNoUidCloudPrefToUser(firebaseUid, companyId);
    if (migrated) return migrated;
    return migrateLegacySyntheticCloudPref(firebaseUid, companyId);
  } catch {
    return 0;
  }
}

function saveCloudCompanyPasswordUnlockPreferenceDays(
  firebaseUid: string | undefined,
  companyId: string,
  days: number
): void {
  if (typeof window === "undefined" || !companyId) return;
  const key = prefStorageKey(firebaseUid, companyId);
  if (days === 0) {
    localStorage.removeItem(key);
    const orphan = prefStorageKey(undefined, companyId);
    if (orphan !== key) localStorage.removeItem(orphan);
    return;
  }
  localStorage.setItem(key, String(days));
  const orphan = prefStorageKey(undefined, companyId);
  const real = firebaseUid?.trim();
  if (real && real !== "no_uid" && orphan !== key) localStorage.removeItem(orphan);
}

/** Abhi valid saved "unlocked" window hai — tab password dialog mat dikhao */
export function readCloudCompanyPasswordUnlockSession(
  firebaseUid: string | undefined,
  companyId: string
): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  try {
    const key = storageKey(firebaseUid, companyId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw) as Stored;
      if (typeof data.until === "number" && data.until > Date.now()) {
        // Canonical valid ho to purani `no_uid` duplicate session hatao (storage + confusion dono se bachne ke liye).
        const orphanSess = storageKey(undefined, companyId);
        if (orphanSess !== key) localStorage.removeItem(orphanSess);
        return true;
      }
      if (typeof data.until === "number" && data.until <= Date.now()) localStorage.removeItem(key);
    }
    // `no_uid` par save hua ho + ab `user.uid` loaded hai — migrate karke auto-login restore.
    if (migrateNoUidCloudUnlockSessionToUser(firebaseUid, companyId)) return true;
    // Legacy synthetic keys (local:* uid) ko normalize key par shift karke same-company re-unlock preserve karo.
    if (migrateLegacySyntheticCloudUnlockSession(firebaseUid, companyId)) return true;
    return false;
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
    const orphan = storageKey(undefined, companyId);
    if (orphan !== key) localStorage.removeItem(orphan);
    saveCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, companyId, 0);
    return;
  }
  const until =
    days === OFFLINE_UNLOCK_REMEMBER_NEVER_DAYS ? REMEMBER_UNTIL_MAX_MS : Date.now() + days * 24 * 60 * 60 * 1000;
  const payload: Stored = { until };
  localStorage.setItem(key, JSON.stringify(payload));
  // Duble entry na rahe: real uid save ke baad orphan hatao.
  const orphan = storageKey(undefined, companyId);
  const real = firebaseUid?.trim();
  if (real && real !== "no_uid" && orphan !== key) localStorage.removeItem(orphan);
  saveCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, companyId, days);
}

export function clearCloudCompanyPasswordUnlockSession(firebaseUid: string | undefined, companyId: string): void {
  if (typeof window === "undefined" || !companyId) return;
  localStorage.removeItem(storageKey(firebaseUid, companyId));
  const orphan = storageKey(undefined, companyId);
  if (orphan !== storageKey(firebaseUid, companyId)) localStorage.removeItem(orphan);
  saveCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, companyId, 0);
}

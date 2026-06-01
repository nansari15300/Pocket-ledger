/**
 * EXE/APK-only app lock: 6-digit PIN (hash localStorage) + APK optional biometric (OS keystore).
 * Session: `sessionStorage` — dubara PIN tab tak nahi jab tak JS session zinda (logout par clear).
 * Firebase session alag rehti hai; ye sirf device par extra gate hai.
 */

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/** Electron preload / UA — Capacitor WebView ko Electron mat samjho. */
function isElectronPackagedShell(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp()) return false;
  try {
    const w = window as unknown as { electron?: unknown; process?: { versions?: { electron?: string } } };
    if (w.electron != null) return true;
    if (w.process?.versions?.electron) return true;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron")) return true;
  return false;
}

/** Sirf desktop `.exe` + Capacitor APK — browser static build yahan force nahi. */
export function isEmbeddedDeviceLockShell(): boolean {
  return typeof window !== "undefined" && (isCapacitorNativeApp() || isElectronPackagedShell());
}

export type EmbeddedLockShellKind = "none" | "exe" | "apk";

export function getEmbeddedLockShellKind(): EmbeddedLockShellKind {
  if (typeof window === "undefined") return "none";
  if (isCapacitorNativeApp()) return "apk";
  if (isElectronPackagedShell()) return "exe";
  return "none";
}

const SESSION_UNLOCK_KEY = "pl_embedded_unlock_v1";
/** APK: native biometric activity ke baad WebView reload/resume par `sessionStorage` khali ho sakta hai — unlock yahan bhi likho */
const PERSISTENT_UNLOCK_KEY = "pl_embedded_unlock_persist_v1";
const PIN_HASH_SUFFIX = "pl_embedded_pin_hash_v1";
const PIN_SALT_SUFFIX = "pl_embedded_pin_salt_v1";
const BIO_FLAG_SUFFIX = "pl_embedded_bio_on_v1";
/** APK: user ne khud 6-digit backup PIN set kiya (biometric-only lock par ye false reh sakta hai). */
const USER_PIN_FLAG_SUFFIX = "pl_embedded_user_pin_v1";
/** User choice: setup gate par "Skip PIN for now" select kiya ho to startup par force setup mat karo. */
const SETUP_SKIP_SUFFIX = "pl_embedded_lock_setup_skip_v1";

function hashKey(uid: string) {
  return `${PIN_HASH_SUFFIX}_${uid}`;
}
function saltKey(uid: string) {
  return `${PIN_SALT_SUFFIX}_${uid}`;
}
function bioKey(uid: string) {
  return `${BIO_FLAG_SUFFIX}_${uid}`;
}
function userPinKey(uid: string) {
  return `${USER_PIN_FLAG_SUFFIX}_${uid}`;
}
function setupSkipKey(uid: string) {
  return `${SETUP_SKIP_SUFFIX}_${uid}`;
}

export function embeddedPinLength(): number {
  return 6;
}

export function isSixDigitNumericPin(pin: string): boolean {
  return /^\d{6}$/.test(pin.trim());
}

export function hasEmbeddedPinConfigured(firebaseUid: string): boolean {
  if (!firebaseUid || firebaseUid.startsWith("local:")) return false;
  try {
    return Boolean(localStorage.getItem(hashKey(firebaseUid)) && localStorage.getItem(saltKey(firebaseUid)));
  } catch {
    return false;
  }
}

/** APK: user ne settings/setup me khud PIN choose kiya — unlock screen par backup PIN dikhane ke liye. */
export function hasUserChosenEmbeddedPin(firebaseUid: string): boolean {
  try {
    return localStorage.getItem(userPinKey(firebaseUid)) === "1";
  } catch {
    return false;
  }
}

export function setUserChosenEmbeddedPin(firebaseUid: string, chosen: boolean): void {
  try {
    if (chosen) localStorage.setItem(userPinKey(firebaseUid), "1");
    else localStorage.removeItem(userPinKey(firebaseUid));
  } catch {
    /* ignore */
  }
}

/** Setup gate optional: user ne PIN setup postpone kiya hai ya nahi (per account, per device). */
export function hasEmbeddedLockSetupSkipped(firebaseUid: string): boolean {
  try {
    return localStorage.getItem(setupSkipKey(firebaseUid)) === "1";
  } catch {
    return false;
  }
}

export function setEmbeddedLockSetupSkipped(firebaseUid: string, skipped: boolean): void {
  try {
    if (skipped) localStorage.setItem(setupSkipKey(firebaseUid), "1");
    else localStorage.removeItem(setupSkipKey(firebaseUid));
  } catch {
    /* ignore */
  }
}

/**
 * Device lock configured? EXE = PIN hash; APK = biometric flag ya PIN hash
 * (biometric-only par bhi andar internal hash hota hai, lekin gate is flag se decide karta hai).
 */
export function hasEmbeddedLockConfigured(firebaseUid: string): boolean {
  if (!firebaseUid || firebaseUid.startsWith("local:")) return false;
  if (getEmbeddedLockShellKind() === "apk") {
    return hasEmbeddedPinConfigured(firebaseUid) || readBiometricUnlockEnabled(firebaseUid);
  }
  return hasEmbeddedPinConfigured(firebaseUid);
}

/** APK biometric-only setup: user ko PIN na dikhate andar verify ke liye random 6-digit. */
export function generateInternalDeviceLockPin(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => String(b % 10)).join("");
}

export function readBiometricUnlockEnabled(firebaseUid: string): boolean {
  try {
    return localStorage.getItem(bioKey(firebaseUid)) === "1";
  } catch {
    return false;
  }
}

export function setBiometricUnlockEnabled(firebaseUid: string, enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(bioKey(firebaseUid), "1");
    else localStorage.removeItem(bioKey(firebaseUid));
  } catch {
    /* ignore */
  }
}

export function isEmbeddedSessionUnlocked(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1") return true;
    // APK: fingerprint dialog se wapas aane par sessionStorage reset ho to bhi gate na atke
    if (isCapacitorNativeApp() && localStorage.getItem(PERSISTENT_UNLOCK_KEY) === "1") return true;
    return false;
  } catch {
    try {
      return isCapacitorNativeApp() && localStorage.getItem(PERSISTENT_UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  }
}

export function markEmbeddedSessionUnlocked(): void {
  try {
    sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
  try {
    if (isCapacitorNativeApp()) {
      localStorage.setItem(PERSISTENT_UNLOCK_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

/** Logout / sign-out: agla cold open dubara PIN/biometric maange — PIN hash mat todo. */
export function clearEmbeddedSessionUnlock(): void {
  try {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(PERSISTENT_UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveEmbeddedPinHash(firebaseUid: string, pin: string): Promise<void> {
  const salt = randomSalt();
  const hash = await sha256Hex(`${salt}:${pin}`);
  localStorage.setItem(saltKey(firebaseUid), salt);
  localStorage.setItem(hashKey(firebaseUid), hash);
}

export async function verifyEmbeddedPin(firebaseUid: string, pin: string): Promise<boolean> {
  const salt = localStorage.getItem(saltKey(firebaseUid));
  const stored = localStorage.getItem(hashKey(firebaseUid));
  if (!salt || !stored) return false;
  const hash = await sha256Hex(`${salt}:${pin}`);
  return hash === stored;
}

/** Account switch / settings: pura device lock hatao (hashes + biometric store). */
export async function wipeEmbeddedDeviceLockForUser(firebaseUid: string): Promise<void> {
  clearEmbeddedSessionUnlock();
  try {
    localStorage.removeItem(hashKey(firebaseUid));
    localStorage.removeItem(saltKey(firebaseUid));
    localStorage.removeItem(bioKey(firebaseUid));
    localStorage.removeItem(userPinKey(firebaseUid));
    // Reset flow: skip preference bhi clear ho taaki next setup decision fresh rahe.
    localStorage.removeItem(setupSkipKey(firebaseUid));
  } catch {
    /* ignore */
  }
  if (isCapacitorNativeApp()) {
    try {
      const { wipeNativeBiometricLockCredentials } = await import("@/lib/embeddedDeviceLockBiometric");
      await wipeNativeBiometricLockCredentials();
    } catch {
      /* ignore */
    }
  }
}

"use client";

import { decryptData, encryptData } from "@/lib/encryption";
import type { PlanId } from "@/config/plans";

/** localStorage list — device par encrypted credentials (APK/EXE quick account switch). */
const STORAGE_KEY = "pl_saved_login_accounts_v1";
const DEVICE_KEY_STORAGE = "pl_saved_acct_device_key_v1";
const MAX_SAVED_ACCOUNTS = 8;

export type SavedLoginAuthMethod = "password" | "google";

export type SavedLoginAccountRecord = {
  uid: string;
  email: string;
  displayName?: string | null;
  authMethod: SavedLoginAuthMethod;
  /** AES envelope — sirf `authMethod === "password"`. */
  encryptedPassword?: string;
  planIdAtSave: PlanId;
  savedAt: number;
};

function readDeviceEncryptionSecret(): string {
  try {
    let k = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!k) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      k = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE_KEY_STORAGE, k);
    }
    return k;
  } catch {
    return "pl-device-fallback-key";
  }
}

function readRawList(): SavedLoginAccountRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is SavedLoginAccountRecord =>
        row != null &&
        typeof row === "object" &&
        typeof (row as SavedLoginAccountRecord).uid === "string" &&
        typeof (row as SavedLoginAccountRecord).email === "string" &&
        ((row as SavedLoginAccountRecord).authMethod === "password" ||
          (row as SavedLoginAccountRecord).authMethod === "google")
    );
  } catch {
    return [];
  }
}

function writeRawList(rows: SavedLoginAccountRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_SAVED_ACCOUNTS)));
  } catch {
    /* quota */
  }
}

/** Login page + logout dialog — saved rows (newest first). */
export function listSavedLoginAccounts(): SavedLoginAccountRecord[] {
  return readRawList().sort((a, b) => b.savedAt - a.savedAt);
}

export function removeSavedLoginAccount(uid: string): void {
  const id = uid.trim();
  if (!id) return;
  writeRawList(readRawList().filter((r) => r.uid !== id));
}

export async function decryptSavedLoginPassword(record: SavedLoginAccountRecord): Promise<string | null> {
  if (record.authMethod !== "password" || !record.encryptedPassword) return null;
  try {
    return await decryptData(record.encryptedPassword, readDeviceEncryptionSecret());
  } catch {
    return null;
  }
}

/** Logout par save — same uid update; password optional for Google-only rows. */
export async function upsertSavedLoginAccount(input: {
  uid: string;
  email: string;
  displayName?: string | null;
  authMethod: SavedLoginAuthMethod;
  password?: string | null;
  planIdAtSave: PlanId;
}): Promise<void> {
  const uid = input.uid.trim();
  const email = input.email.trim();
  if (!uid || !email) return;

  let encryptedPassword: string | undefined;
  if (input.authMethod === "password" && input.password?.trim()) {
    encryptedPassword = await encryptData(input.password.trim(), readDeviceEncryptionSecret());
  }

  const nextRow: SavedLoginAccountRecord = {
    uid,
    email,
    displayName: input.displayName?.trim() || null,
    authMethod: input.authMethod,
    encryptedPassword,
    planIdAtSave: input.planIdAtSave,
    savedAt: Date.now(),
  };

  const rest = readRawList().filter((r) => r.uid !== uid);
  writeRawList([nextRow, ...rest]);
}

/** Firebase user providers se auth method guess — logout save ke liye. */
export function detectSavedLoginAuthMethod(providerIds: readonly string[]): SavedLoginAuthMethod {
  const hasPassword = providerIds.includes("password");
  const hasGoogle = providerIds.includes("google.com");
  if (hasPassword) return "password";
  if (hasGoogle) return "google";
  return "password";
}

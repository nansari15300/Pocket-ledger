"use client";

import { Capacitor } from "@capacitor/core";

const BACKUP_SAVE_PREFS_KEY = "pl_backup_save_location_v1";
const BACKUP_IDB_NAME = "pocket-ledger-device-settings";
const BACKUP_IDB_STORE = "backup-location";
const BACKUP_IDB_HANDLE_KEY = "web-directory-handle";
/** Device-local company mirror files (Backup & Restore → Data save location) — backup handle se alag. */
const LIVE_DATA_WEB_HANDLE_KEY = "web-live-data-directory-handle";
/** Random passphrase for AES-GCM mirror files (same browser profile; not user-entered). */
const LIVE_MIRROR_AUTO_PASSPHRASE_KEY = "web-live-mirror-auto-passphrase-v1";

function randomMirrorPassphrase(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type BackupNativeDirectory = "DOCUMENTS" | "EXTERNAL";

export type BackupSaveLocationPrefs = {
  webUseSelectedFolder: boolean;
  /** Leaf folder name from File System Access handle (browser) — poora path nahi hota. */
  webFolderLabel: string | null;
  /** Desktop EXE / known absolute path — UI me D:\Backup PL\… jaisa dikhane ke liye. */
  webFolderDisplayPath: string | null;
  nativeDirectory: BackupNativeDirectory;
  nativeSubfolder: string;
  /** Native APK: user-picked absolute folder path from Device location dialog (if available). */
  nativeFolderPath: string | null;
};

const DEFAULT_PREFS: BackupSaveLocationPrefs = {
  webUseSelectedFolder: false,
  webFolderLabel: null,
  webFolderDisplayPath: null,
  nativeDirectory: "DOCUMENTS",
  nativeSubfolder: "PocketLedgerBackups",
  nativeFolderPath: null,
};

/** Device settings: load persisted backup location preferences with safe defaults. */
export function readBackupSaveLocationPrefs(): BackupSaveLocationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(BACKUP_SAVE_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<BackupSaveLocationPrefs>;
    return {
      webUseSelectedFolder: parsed.webUseSelectedFolder === true,
      webFolderLabel: typeof parsed.webFolderLabel === "string" && parsed.webFolderLabel.trim() ? parsed.webFolderLabel : null,
      webFolderDisplayPath:
        typeof parsed.webFolderDisplayPath === "string" && parsed.webFolderDisplayPath.trim()
          ? parsed.webFolderDisplayPath.trim()
          : null,
      nativeDirectory: parsed.nativeDirectory === "EXTERNAL" ? "EXTERNAL" : "DOCUMENTS",
      nativeSubfolder:
        typeof parsed.nativeSubfolder === "string" && parsed.nativeSubfolder.trim()
          ? parsed.nativeSubfolder.trim()
          : DEFAULT_PREFS.nativeSubfolder,
      nativeFolderPath:
        typeof parsed.nativeFolderPath === "string" && parsed.nativeFolderPath.trim()
          ? parsed.nativeFolderPath.trim()
          : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Device settings: persist backup location preferences for both PC web and native static app. */
export function saveBackupSaveLocationPrefs(next: BackupSaveLocationPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKUP_SAVE_PREFS_KEY, JSON.stringify(next));
}

function isWebDirectoryPickerSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as any).showDirectoryPicker === "function";
}

/** Device settings: only show native location controls on APK/static native runtime. */
export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

/** Device settings: open folder picker support check for web/desktop static builds. */
export function canPickWebBackupFolder(): boolean {
  return !isNativeRuntime() && isWebDirectoryPickerSupported();
}

/**
 * Static/native backup writes: ask storage permission up-front when platform requires it.
 * Returns true if permission is already granted or successfully granted.
 */
export async function ensureNativeBackupStoragePermission(): Promise<boolean> {
  if (!isNativeRuntime()) return true;
  try {
    const { Filesystem } = await import("@capacitor/filesystem");
    const checker = (Filesystem as unknown as { checkPermissions?: () => Promise<any> }).checkPermissions;
    const requester = (Filesystem as unknown as { requestPermissions?: () => Promise<any> }).requestPermissions;
    const checked = typeof checker === "function" ? await checker.call(Filesystem) : null;
    const publicStorage = String(checked?.publicStorage || "").toLowerCase();
    if (publicStorage === "granted") return true;
    const requested = typeof requester === "function" ? await requester.call(Filesystem) : null;
    const requestedState = String(requested?.publicStorage || "").toLowerCase();
    return requestedState === "granted" || requestedState === "";
  } catch {
    // If plugin doesn't expose explicit permission APIs, allow flow to continue (write call will decide).
    return true;
  }
}

async function openBackupLocationDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(BACKUP_IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BACKUP_IDB_STORE)) {
        db.createObjectStore(BACKUP_IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/** Persist selected web folder handle in IndexedDB so backup can save directly without asking each time. */
export async function storeWebBackupDirectoryHandle(handle: any): Promise<boolean> {
  const db = await openBackupLocationDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readwrite");
    tx.objectStore(BACKUP_IDB_STORE).put(handle, BACKUP_IDB_HANDLE_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

/** Read persisted web folder handle for direct backup save when "Use selected folder" is enabled. */
export async function readWebBackupDirectoryHandle(): Promise<any | null> {
  const db = await openBackupLocationDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readonly");
    const req = tx.objectStore(BACKUP_IDB_STORE).get(BACKUP_IDB_HANDLE_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

/** Allow users to reset configured web folder if they want to choose another location later. */
export async function clearWebBackupDirectoryHandle(): Promise<void> {
  const db = await openBackupLocationDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readwrite");
    tx.objectStore(BACKUP_IDB_STORE).delete(BACKUP_IDB_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Live data folder (local-company mirrors) — web File System Access handle. */
export async function storeWebLiveDataDirectoryHandle(handle: unknown): Promise<boolean> {
  const db = await openBackupLocationDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readwrite");
    tx.objectStore(BACKUP_IDB_STORE).put(handle, LIVE_DATA_WEB_HANDLE_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function readWebLiveDataDirectoryHandle(): Promise<unknown | null> {
  const db = await openBackupLocationDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readonly");
    const req = tx.objectStore(BACKUP_IDB_STORE).get(LIVE_DATA_WEB_HANDLE_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function clearWebLiveDataDirectoryHandle(): Promise<void> {
  const db = await openBackupLocationDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readwrite");
    tx.objectStore(BACKUP_IDB_STORE).delete(LIVE_DATA_WEB_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Persisted mirror encryption secret (device IndexedDB). Files stay unreadable without this profile. */
export async function readLiveMirrorAutoPassphrase(): Promise<string | null> {
  const db = await openBackupLocationDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readonly");
    const req = tx.objectStore(BACKUP_IDB_STORE).get(LIVE_MIRROR_AUTO_PASSPHRASE_KEY);
    req.onsuccess = () => {
      const v = req.result;
      resolve(typeof v === "string" && v.trim().length >= 16 ? v.trim() : null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function ensureLiveMirrorAutoPassphrase(): Promise<string> {
  const existing = await readLiveMirrorAutoPassphrase();
  if (existing) return existing;
  const next = randomMirrorPassphrase();
  const db = await openBackupLocationDb();
  if (!db) return next;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readwrite");
    tx.objectStore(BACKUP_IDB_STORE).put(next, LIVE_MIRROR_AUTO_PASSPHRASE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb write"));
  });
  return next;
}

export async function clearLiveMirrorAutoPassphrase(): Promise<void> {
  const db = await openBackupLocationDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(BACKUP_IDB_STORE, "readwrite");
    tx.objectStore(BACKUP_IDB_STORE).delete(LIVE_MIRROR_AUTO_PASSPHRASE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}


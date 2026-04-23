"use client";

import { Capacitor } from "@capacitor/core";

const BACKUP_SAVE_PREFS_KEY = "pl_backup_save_location_v1";
const BACKUP_IDB_NAME = "pocket-ledger-device-settings";
const BACKUP_IDB_STORE = "backup-location";
const BACKUP_IDB_HANDLE_KEY = "web-directory-handle";

export type BackupNativeDirectory = "DOCUMENTS" | "EXTERNAL";

export type BackupSaveLocationPrefs = {
  webUseSelectedFolder: boolean;
  webFolderLabel: string | null;
  nativeDirectory: BackupNativeDirectory;
  nativeSubfolder: string;
};

const DEFAULT_PREFS: BackupSaveLocationPrefs = {
  webUseSelectedFolder: false,
  webFolderLabel: null,
  nativeDirectory: "DOCUMENTS",
  nativeSubfolder: "PocketLedgerBackups",
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
      nativeDirectory: parsed.nativeDirectory === "EXTERNAL" ? "EXTERNAL" : "DOCUMENTS",
      nativeSubfolder:
        typeof parsed.nativeSubfolder === "string" && parsed.nativeSubfolder.trim()
          ? parsed.nativeSubfolder.trim()
          : DEFAULT_PREFS.nativeSubfolder,
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


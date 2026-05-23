"use client";

import { readBackupSaveLocationPrefs, isNativeRuntime } from "@/lib/backupSaveLocation";

/** SAF/content URI ko user-friendly storage path label me badlo (UI display only). */
export function formatNativeFolderDisplayPath(folderPath: string | null): string {
  const raw = String(folderPath || "").trim();
  if (!raw) return "Not set";
  if (!raw.startsWith("content://")) return raw;
  try {
    const treeEncoded = raw.includes("/tree/") ? raw.split("/tree/")[1] ?? "" : "";
    const treeDecoded = decodeURIComponent(treeEncoded);
    const [volumeRaw, ...segments] = treeDecoded.split(":");
    const volume = String(volumeRaw || "").trim().toLowerCase();
    const root = volume === "primary" ? "storage" : `storage/${volume || "selected"}`;
    const suffix = segments.join(":").replace(/^\/+/, "");
    return suffix ? `${root}/${suffix}` : root;
  } catch {
    return raw;
  }
}

/** Backup & Restore card — chosen backup folder ka poora/local path jahan available ho. */
export function readBackupLocationDisplayLabel(): string {
  const prefs = readBackupSaveLocationPrefs();
  if (isNativeRuntime()) {
    if (prefs.nativeFolderPath) return formatNativeFolderDisplayPath(prefs.nativeFolderPath);
    const sub = String(prefs.nativeSubfolder || "").trim();
    const dir = prefs.nativeDirectory === "EXTERNAL" ? "External storage" : "Documents";
    return sub ? `${dir}/${sub}` : dir;
  }
  if (prefs.webUseSelectedFolder) {
    // Electron/desktop: poora path (D:\…) — browser picker par sirf folder name fallback.
    if (prefs.webFolderDisplayPath) return prefs.webFolderDisplayPath;
    if (prefs.webFolderLabel) return prefs.webFolderLabel;
  }
  return "Not set (Save As each time)";
}

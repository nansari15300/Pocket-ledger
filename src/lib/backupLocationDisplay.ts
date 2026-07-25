"use client";

import { readBackupSaveLocationPrefs, isNativeRuntime } from "@/lib/backupSaveLocation";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

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

/** Path me drive letter / slash ho to poora path samjho (sirf folder name nahi). */
export function isBackupLocationFullPathDisplay(label: string): boolean {
  const s = String(label || "").trim();
  if (!s || s.startsWith("Not set")) return false;
  return /[:\\/]/.test(s) || s.startsWith("storage/");
}

/** Backup & Restore card — chosen backup folder ka poora/local path jahan available ho. */
export function readBackupLocationDisplayLabel(): string {
  const prefs = readBackupSaveLocationPrefs();

  const webFullPath = String(prefs.webFolderDisplayPath || "").trim();
  if (webFullPath) return webFullPath;

  if (isNativeRuntime()) {
    if (prefs.nativeFolderPath) return formatNativeFolderDisplayPath(prefs.nativeFolderPath);
    const sub = String(prefs.nativeSubfolder || "").trim();
    const dir = prefs.nativeDirectory === "EXTERNAL" ? "External storage" : "Documents";
    return sub ? `${dir}/${sub}` : dir;
  }

  if (prefs.webUseSelectedFolder && prefs.webFolderLabel) {
    return prefs.webFolderLabel;
  }
  return "Not set (Save As each time)";
}

/** Jab sirf folder name dikhe (web browser) — user ko short hint. */
export function readBackupLocationDisplayHint(): string | null {
  const label = readBackupLocationDisplayLabel();
  if (isBackupLocationFullPathDisplay(label)) return null;
  if (label.startsWith("Not set")) return null;

  if (typeof window !== "undefined" && isElectronDesktopApp()) {
    return "Full drive path not saved yet. Open Backup location → Browse again to store the complete path.";
  }

  return null;
}

/** Auto backup preview — base path + company + timestamp subfolders. */
export function formatAutoBackupPathPreview(basePath: string): string {
  const base = String(basePath || "").trim().replace(/[/\\]+$/, "");
  if (!base || base.startsWith("Not set")) return "";
  const sep = base.includes("\\") ? "\\" : "/";
  return `${base}${sep}{company}${sep}{date-time}${sep}`;
}

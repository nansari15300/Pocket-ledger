"use client";

import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

type PlElectronBackupApi = {
  pickDirectory: () => Promise<{ ok?: boolean; path?: string; cancelled?: boolean; error?: string }>;
  writeBackupFile: (args: {
    dirPath: string;
    fileName: string;
    base64: string;
    /** Electron main: nested `{company}/{timestamp}/` under chosen dir. */
    relativeSubdir?: string;
  }) => Promise<{ ok?: boolean; error?: string }>;
};

function electronBackupApi(): PlElectronBackupApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { plElectronBackup?: PlElectronBackupApi }).plElectronBackup;
  return api?.pickDirectory && api?.writeBackupFile ? api : null;
}

/** Desktop EXE: native folder dialog se poora path (D:\…) mil sakta hai. */
export function canPickElectronBackupDirectory(): boolean {
  return isElectronDesktopApp() && electronBackupApi() != null;
}

/** Electron main process dialog — full filesystem path return karta hai. */
export async function pickElectronBackupDirectory(): Promise<{ path: string | null; cancelled: boolean }> {
  const api = electronBackupApi();
  if (!api) return { path: null, cancelled: true };
  const resp = await api.pickDirectory();
  if (resp.cancelled) return { path: null, cancelled: true };
  if (!resp.ok || !String(resp.path || "").trim()) {
    throw new Error(resp.error || "Could not select backup folder.");
  }
  return { path: String(resp.path).trim(), cancelled: false };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result || "");
      resolve(dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl);
    };
    r.onerror = () => reject(r.error ?? new Error("Failed to read blob"));
    r.readAsDataURL(blob);
  });
}

/** Electron EXE: chosen folder path par backup file likho (File System Access handle ki jagah). */
export async function writeElectronBackupFile(
  dirPath: string,
  fileName: string,
  blob: Blob,
  relativeSubdir?: string
): Promise<void> {
  const api = electronBackupApi();
  if (!api) throw new Error("Electron backup folder API not available.");
  const base64 = await blobToBase64(blob);
  const resp = await api.writeBackupFile({
    dirPath,
    fileName,
    base64,
    relativeSubdir: relativeSubdir?.trim() || undefined,
  });
  if (!resp.ok) throw new Error(resp.error || "Could not write backup file.");
}

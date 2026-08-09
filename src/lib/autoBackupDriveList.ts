"use client";

import {
  isNativeRuntime,
  readBackupSaveLocationPrefs,
  readWebBackupDirectoryHandle,
} from "@/lib/backupSaveLocation";
import { readBackupLocationDisplayLabel } from "@/lib/backupLocationDisplay";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { companyBackupFileNameSlug, sanitizeBackupFolderSegment } from "@/lib/autoBackupPath";

export type AutoBackupDriveFileCandidate = {
  fileName: string;
  /** Backup root se relative — `Company/2026/July/03/file.plbp` */
  relativePath: string;
  companyFolder: string;
  modifiedAt: number;
  sizeBytes: number;
  readBlob: () => Promise<Blob>;
};

export type AutoBackupDriveListResult = {
  files: AutoBackupDriveFileCandidate[];
  /** Device backup root — UI / errors. */
  scanRoot: string;
};

function pathBasename(p: string): string {
  const s = String(p || "").replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function companyFolderFromRelativePath(relativePath: string): string {
  const seg = String(relativePath || "").replace(/\\/g, "/").split("/").filter(Boolean)[0];
  return seg || "company";
}

async function ensureWebBackupDirReadAccess(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dirHandle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  try {
    if (typeof h.queryPermission !== "function") return true;
    let p = await h.queryPermission({ mode: "readwrite" });
    if (p === "granted") return true;
    if (typeof h.requestPermission === "function") {
      p = await h.requestPermission({ mode: "readwrite" });
      return p === "granted";
    }
    return false;
  } catch {
    return false;
  }
}

async function listFromWebBackupDir(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ""
): Promise<AutoBackupDriveFileCandidate[]> {
  const h = dirHandle as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (typeof h.entries !== "function") return [];
  const rows: AutoBackupDriveFileCandidate[] = [];
  for await (const [name, handle] of h.entries()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      try {
        rows.push(...(await listFromWebBackupDir(handle as FileSystemDirectoryHandle, rel)));
      } catch {
        /* skip */
      }
      continue;
    }
    if (handle.kind !== "file" || !name.toLowerCase().endsWith(".plbp")) continue;
    const fileHandle = handle as FileSystemFileHandle;
    rows.push({
      fileName: name,
      relativePath: rel.replace(/\\/g, "/"),
      companyFolder: companyFolderFromRelativePath(rel),
      modifiedAt: 0,
      sizeBytes: 0,
      readBlob: async () => {
        const file = await fileHandle.getFile();
        return file;
      },
    });
  }
  for (const row of rows) {
    try {
      const file = await row.readBlob();
      row.modifiedAt = (file instanceof File ? file.lastModified : 0) || Date.now();
      row.sizeBytes = file.size || 0;
    } catch {
      row.modifiedAt = Date.now();
    }
  }
  rows.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return rows;
}

type ElectronBackupApi = {
  listBackupFiles?: (dirPath: string) => Promise<{
    ok?: boolean;
    files?: Array<string | { name?: string; relativePath?: string; mtimeMs?: number; size?: number }>;
  }>;
  readBackupFile?: (args: {
    dirPath: string;
    fileName: string;
    asBinary?: boolean;
  }) => Promise<{ ok?: boolean; text?: string; base64?: string }>;
};

function electronBackupApi(): ElectronBackupApi | null {
  if (typeof window === "undefined" || !isElectronDesktopApp()) return null;
  const api = (window as unknown as { plElectronBackup?: ElectronBackupApi }).plElectronBackup;
  if (!api?.listBackupFiles || !api?.readBackupFile) return null;
  return api;
}

async function listFromElectronBackupDir(dirPath: string): Promise<AutoBackupDriveFileCandidate[]> {
  const api = electronBackupApi();
  if (!api) return [];
  try {
    const listed = await api.listBackupFiles!(dirPath);
    const files = listed.files || [];
    const rows = files
      .map((f) => {
        if (typeof f === "string") {
          const relativePath = f.replace(/\\/g, "/");
          return {
            fileName: pathBasename(relativePath),
            relativePath,
            companyFolder: companyFolderFromRelativePath(relativePath),
            modifiedAt: Date.now(),
            sizeBytes: 0,
            readBlob: async () => {
              const r = await api.readBackupFile!({ dirPath, fileName: relativePath, asBinary: true });
              if (!r.ok) throw new Error("read failed");
              if (r.base64) {
                const bin = atob(r.base64);
                const buf = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                return new Blob([buf], { type: "application/octet-stream" });
              }
              return new Blob([String(r.text || "")], { type: "application/octet-stream" });
            },
          };
        }
        const relativePath = String(f.relativePath || f.name || "").replace(/\\/g, "/");
        const fileName = String(f.name || pathBasename(relativePath)).trim();
        return {
          fileName,
          relativePath: relativePath || fileName,
          companyFolder: companyFolderFromRelativePath(relativePath || fileName),
          modifiedAt:
            typeof f.mtimeMs === "number" && Number.isFinite(f.mtimeMs) ? f.mtimeMs : Date.now(),
          sizeBytes: typeof f.size === "number" && Number.isFinite(f.size) ? f.size : 0,
          readBlob: async () => {
            const r = await api.readBackupFile!({
              dirPath,
              fileName: relativePath || fileName,
              asBinary: true,
            });
            if (!r.ok) throw new Error("read failed");
            if (r.base64) {
              const bin = atob(r.base64);
              const buf = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
              return new Blob([buf], { type: "application/octet-stream" });
            }
            return new Blob([String(r.text || "")], { type: "application/octet-stream" });
          },
        };
      })
      .filter((r) => r.fileName.toLowerCase().endsWith(".plbp"));
    rows.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return rows;
  } catch {
    return [];
  }
}

/**
 * Saved backup location se saari `.plbp` files — nested `{company}/{year}/{Month}/{day}/` walk.
 * Same roots as backup save: Electron path → web folder handle.
 */
export async function listAutoBackupDriveFileCandidates(): Promise<AutoBackupDriveListResult> {
  const scanRoot = readBackupLocationDisplayLabel();
  if (typeof window === "undefined") return { files: [], scanRoot };

  const prefs = readBackupSaveLocationPrefs();
  let rows: AutoBackupDriveFileCandidate[] = [];

  if (isElectronDesktopApp() && prefs.webFolderDisplayPath?.trim()) {
    rows = await listFromElectronBackupDir(prefs.webFolderDisplayPath.trim());
  }

  if (rows.length === 0 && !isNativeRuntime() && prefs.webUseSelectedFolder) {
    const dirHandle = (await readWebBackupDirectoryHandle()) as FileSystemDirectoryHandle | null;
    if (dirHandle && (await ensureWebBackupDirReadAccess(dirHandle))) {
      try {
        rows = await listFromWebBackupDir(dirHandle);
      } catch {
        rows = [];
      }
    }
  }

  return { files: rows, scanRoot };
}

/** Dialog open — browser folder read permission prompt (backup scan ke liye). */
export async function warmUpBackupFolderReadAccess(): Promise<void> {
  if (typeof window === "undefined" || isNativeRuntime()) return;
  const prefs = readBackupSaveLocationPrefs();
  if (!prefs.webUseSelectedFolder) return;
  const dirHandle = (await readWebBackupDirectoryHandle()) as FileSystemDirectoryHandle | null;
  if (dirHandle) await ensureWebBackupDirReadAccess(dirHandle);
}

export function autoBackupFolderMatchesCompany(companyFolder: string, companyName: string, companyId: string): boolean {
  const folder = String(companyFolder || "").trim();
  if (!folder) return false;
  const name = String(companyName || "").trim();
  const nameSeg = sanitizeBackupFolderSegment(companyName || companyId);
  const slug = companyBackupFileNameSlug(companyName || companyId);
  const folderNorm = folder.toLowerCase();
  return (
    folder === nameSeg ||
    folder === name ||
    folder === slug ||
    folderNorm === nameSeg.toLowerCase() ||
    folderNorm === name.toLowerCase() ||
    folderNorm === slug.toLowerCase() ||
    folder.replace(/_/g, " ").toLowerCase() === name.toLowerCase()
  );
}

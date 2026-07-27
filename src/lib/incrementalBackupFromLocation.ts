"use client";

/**
 * Saved backup folder me pichla `.plbp` — attachment bytes reuse (incremental backup).
 * Nayi refs server se; purani refs dubara download nahi.
 *
 * Merge policy (current snapshot wins):
 * - Company DATA hamesha abhi ke SQLite/Firestore se — purani `.plbp` se rows merge nahi.
 * - Attachments: sirf abhi ke refs backup me; purane backup ki files jo delete ho chuki hain → nayi `.plbp` me nahi.
 * - Purane bytes sirf tab reuse jab ref ab bhi company data me ho.
 */

import type { AttachmentZipManifest, AttachmentZipManifestEntry } from "@/lib/attachmentBackupBundle";
import { decryptBytes } from "@/lib/encryption";
import { isPlbpZipPayload, unpackPlbpZipBackup } from "@/lib/plbpBackupZip";
import {
  isNativeRuntime,
  readBackupSaveLocationPrefs,
  readWebBackupDirectoryHandle,
} from "@/lib/backupSaveLocation";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";

export type IncrementalAttachmentCacheEntry = {
  entry: AttachmentZipManifestEntry;
  fileBytes: Uint8Array;
};

/** Ref key → pichle backup se bytes (same company + password). */
export type IncrementalAttachmentCache = Map<string, IncrementalAttachmentCacheEntry>;

export type LoadIncrementalAttachmentCacheResult = {
  cache: IncrementalAttachmentCache;
  /** Kaun si `.plbp` se reuse hua — progress UI ke liye. */
  sourceFileName: string | null;
};

function companyBackupNameSlug(companyName: string): string {
  return String(companyName || "")
    .trim()
    .replace(/\s+/g, "_");
}

function pathBasename(p: string): string {
  const s = String(p || "").replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

/** Filename: `Manual_backup_` / `Auto_backup_` / legacy `*_ledger_backup_*`. */
function plbpFileNameMatchesCompany(fileName: string, companyName: string): boolean {
  const slug = companyBackupNameSlug(companyName);
  if (!slug) return false;
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".plbp")) return false;
  return (
    fileName.startsWith(`Manual_backup_${slug}_`) ||
    fileName.startsWith(`Auto_backup_${slug}_`) ||
    fileName.startsWith(`Manual_ledger_backup_${slug}_`) ||
    fileName.startsWith(`Auto_ledger_backup_${slug}_`) ||
    fileName.startsWith(`ledger_backup_${slug}_`) ||
    fileName.startsWith(`pocket-ledger_backup_${slug}_`)
  );
}

type PlbpFileCandidate = { name: string; readEncryptedText: () => Promise<string> };

async function listPlbpCandidatesFromWebBackupDir(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ""
): Promise<PlbpFileCandidate[]> {
  const h = dirHandle as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (typeof h.entries !== "function") return [];
  const rows: PlbpFileCandidate[] = [];
  for await (const [name, handle] of h.entries()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      try {
        const nested = await listPlbpCandidatesFromWebBackupDir(
          handle as FileSystemDirectoryHandle,
          rel
        );
        rows.push(...nested);
      } catch {
        /* skip unreadable folder */
      }
      continue;
    }
    if (handle.kind !== "file" || !name.toLowerCase().endsWith(".plbp")) continue;
    const fileHandle = handle as FileSystemFileHandle;
    rows.push({
      name,
      readEncryptedText: async () => {
        const file = await fileHandle.getFile();
        return await file.text();
      },
    });
  }
  rows.sort((a, b) => b.name.localeCompare(a.name));
  return rows;
}

/** Encrypted `.plbp` → attachment ref map (sirf v3 zip + includesAttachments). */
async function attachmentCacheFromEncryptedPlbp(
  encryptedText: string,
  password: string,
  companyId: string
): Promise<IncrementalAttachmentCache | null> {
  let plainBytes: Uint8Array;
  try {
    plainBytes = await decryptBytes(encryptedText.trim(), password);
  } catch {
    return null;
  }
  if (!isPlbpZipPayload(plainBytes)) return null;
  let manifest: Record<string, unknown>;
  let filesByPath: Map<string, Uint8Array>;
  try {
    const unpacked = unpackPlbpZipBackup(plainBytes);
    manifest = unpacked.manifest;
    filesByPath = unpacked.filesByPath;
  } catch {
    return null;
  }
  const details = manifest.companyDetails as Array<{ id?: string }> | undefined;
  const backupCompanyId = String(details?.[0]?.id || "").trim();
  if (backupCompanyId !== companyId.trim()) return null;
  if (manifest.includesAttachments !== true) return null;
  const zipMan = manifest.attachmentZipManifest as AttachmentZipManifest | undefined;
  if (!Array.isArray(zipMan?.entries) || zipMan.entries.length === 0) return null;

  const cache: IncrementalAttachmentCache = new Map();
  for (const entry of zipMan.entries) {
    if (!entry?.key || !entry.zipPath) continue;
    const bytes = filesByPath.get(entry.zipPath);
    if (!bytes?.length) continue;
    cache.set(entry.key, { entry, fileBytes: bytes });
  }
  return cache.size > 0 ? cache : null;
}

/**
 * Backup location par sabse naya matching `.plbp` kholo — attachment bytes incremental reuse.
 * Koi file nahi / decrypt fail → khali cache (full download).
 */
export async function loadIncrementalAttachmentCacheFromBackupLocation(args: {
  companyId: string;
  companyPassword: string;
  companyName: string;
}): Promise<LoadIncrementalAttachmentCacheResult> {
  const empty: LoadIncrementalAttachmentCacheResult = { cache: new Map(), sourceFileName: null };
  if (typeof window === "undefined") return empty;

  const prefs = readBackupSaveLocationPrefs();
  let candidates: PlbpFileCandidate[] = [];

  // Web / Chromium: saved DirectoryHandle
  if (!isNativeRuntime() && prefs.webUseSelectedFolder) {
    const dirHandle = (await readWebBackupDirectoryHandle()) as FileSystemDirectoryHandle | null;
    if (dirHandle) {
      try {
        const q = (dirHandle as FileSystemDirectoryHandle & {
          queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
        }).queryPermission;
        if (typeof q === "function") {
          const p = await q.call(dirHandle, { mode: "read" });
          if (p !== "granted") return empty;
        }
        candidates = await listPlbpCandidatesFromWebBackupDir(dirHandle);
      } catch {
        return empty;
      }
    }
  }

  // Electron EXE: absolute folder path (read via preload agar available ho)
  if (candidates.length === 0 && isElectronDesktopApp() && prefs.webFolderDisplayPath?.trim()) {
    try {
      const api = (
        window as unknown as {
          plElectronBackup?: {
            listBackupFiles?: (dirPath: string) => Promise<{ ok?: boolean; files?: string[] }>;
            readBackupFile?: (args: { dirPath: string; fileName: string }) => Promise<{ ok?: boolean; text?: string }>;
          };
        }
      ).plElectronBackup;
      const dirPath = prefs.webFolderDisplayPath.trim();
      if (api?.listBackupFiles && api?.readBackupFile) {
        const listed = await api.listBackupFiles(dirPath);
        type ListedFile = string | { name?: string; relativePath?: string };
        const files = (listed.files || []) as ListedFile[];
        const rows = files
          .map((f) => {
            if (typeof f === "string") {
              return { name: pathBasename(f), relativePath: f.replace(/\\/g, "/") };
            }
            const relativePath = String(f.relativePath || f.name || "").replace(/\\/g, "/");
            const name = String(f.name || pathBasename(relativePath) || "").trim();
            return { name, relativePath: relativePath || name };
          })
          .filter((f) => f.name.toLowerCase().endsWith(".plbp"))
          .sort((a, b) => b.relativePath.localeCompare(a.relativePath));
        candidates = rows.map((row) => ({
          name: row.name,
          readEncryptedText: async () => {
            const r = await api.readBackupFile!({
              dirPath,
              fileName: row.relativePath || row.name,
            });
            if (!r.ok || typeof r.text !== "string") throw new Error("read failed");
            return r.text;
          },
        }));
      }
    } catch {
      /* full backup fallback */
    }
  }

  const slugFiltered = candidates.filter((c) => plbpFileNameMatchesCompany(c.name, args.companyName));
  for (const cand of slugFiltered) {
    try {
      const encrypted = await cand.readEncryptedText();
      const cache = await attachmentCacheFromEncryptedPlbp(encrypted, args.companyPassword, args.companyId);
      if (cache && cache.size > 0) {
        return { cache, sourceFileName: cand.name };
      }
    } catch {
      continue;
    }
  }
  return empty;
}

/** Preflight/collect: in refs ke liye download skip — pichle backup se mil chuke hain. */
export function refsMissingFromIncrementalCache(
  refs: string[],
  cache: IncrementalAttachmentCache
): string[] {
  return refs.filter((r) => {
    const row = cache.get(r);
    return !(row?.fileBytes?.length);
  });
}

/** Incremental merge summary — UI/progress: reuse vs new vs deleted-from-company excluded. */
export function summarizeIncrementalAttachmentMerge(
  currentRefs: string[],
  cache: IncrementalAttachmentCache
): {
  reusedCount: number;
  newDownloadCount: number;
  /** Purane backup me thi lekin ab company data me ref nahi — nayi backup me skip. */
  excludedRemovedCount: number;
} {
  const refSet = new Set(currentRefs);
  let reusedCount = 0;
  for (const r of currentRefs) {
    if (cache.get(r)?.fileBytes?.length) reusedCount += 1;
  }
  const excludedRemovedCount = [...cache.keys()].filter((k) => !refSet.has(k)).length;
  const newDownloadCount = refsMissingFromIncrementalCache(currentRefs, cache).length;
  return { reusedCount, newDownloadCount, excludedRemovedCount };
}

export function formatIncrementalMergeProgressDetail(args: {
  sourceFileName: string | null;
  reusedCount: number;
  newDownloadCount: number;
  excludedRemovedCount: number;
}): string {
  const parts: string[] = [];
  if (args.sourceFileName && args.reusedCount > 0) {
    parts.push(`Reusing ${args.reusedCount} file(s) from ${args.sourceFileName}`);
  }
  if (args.newDownloadCount > 0) {
    parts.push(`${args.newDownloadCount} new to fetch`);
  }
  if (args.excludedRemovedCount > 0) {
    parts.push(`${args.excludedRemovedCount} removed from company — not included`);
  }
  if (parts.length === 0) return "No previous backup reuse; full attachment fetch.";
  return parts.join("; ") + ".";
}

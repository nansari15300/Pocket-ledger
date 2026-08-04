"use client";

import type { AutoBackupDrivePrefs } from "@/lib/autoBackupDrivePrefs";
import {
  autoBackupFolderMatchesCompany,
  listAutoBackupDriveFileCandidates,
  type AutoBackupDriveFileCandidate,
} from "@/lib/autoBackupDriveList";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import { isBackupSaveLocationConfigured } from "@/lib/backupSaveLocation";

const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

function formatDriveUploadError(fileName: string, raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw || "Upload failed");
  // Localhost pe galti se local Next API hit ho to yeh error aata hai — secret hosted pe already hai.
  if (/GOOGLE_CLIENT_SECRET/i.test(msg)) {
    return `${fileName}: Drive API could not refresh tokens (GOOGLE_CLIENT_SECRET missing on this server). Voucher sync uses the hosted API — backup upload should too. Try again after refresh; if it persists, redeploy pocket-ledger.com with the latest code.`;
  }
  if (/404|not found|Failed to fetch|NetworkError|CORS/i.test(msg)) {
    return `${fileName}: Backup upload API unavailable on server (${msg}). Deploy latest code to pocket-ledger.com, then retry.`;
  }
  return `${fileName}: ${msg}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function filterCandidatesForPrefs(
  rows: AutoBackupDriveFileCandidate[],
  prefs: AutoBackupDrivePrefs,
  companies: Array<{ id: string; name: string }>
): AutoBackupDriveFileCandidate[] {
  const selectedIds = prefs.uploadCompanyIds?.length
    ? new Set(prefs.uploadCompanyIds)
    : new Set(companies.map((c) => c.id));
  const selectedCompanies = companies.filter((c) => selectedIds.has(c.id));
  const cutoff =
    prefs.uploadMode === "days" ? Date.now() - prefs.uploadDays * 24 * 60 * 60 * 1000 : 0;

  return rows.filter((row) => {
    if (prefs.uploadMode === "days" && row.modifiedAt < cutoff) return false;
    if (!selectedCompanies.length) return false;
    return selectedCompanies.some((c) =>
      autoBackupFolderMatchesCompany(row.companyFolder, c.name, c.id)
    );
  });
}

export type AutoBackupDriveUploadProgress = {
  phase: "listing" | "uploading" | "done" | "error";
  total: number;
  done: number;
  currentFile?: string;
  uploaded: number;
  skipped: number;
  pruned: number;
  error?: string;
  /** Pehli skip ki wajah — UI toast / status. */
  skipReason?: string;
};

export async function runAutoBackupDriveUpload(input: {
  prefs: AutoBackupDrivePrefs;
  companies: Array<{ id: string; name: string }>;
  /** Sirf is timestamp ke baad modified files (auto-upload after backup). */
  onlySinceMs?: number;
  onProgress?: (p: AutoBackupDriveUploadProgress) => void;
}): Promise<AutoBackupDriveUploadProgress> {
  const report = (partial: Partial<AutoBackupDriveUploadProgress>) => {
    input.onProgress?.({
      phase: "listing",
      total: 0,
      done: 0,
      uploaded: 0,
      skipped: 0,
      pruned: 0,
      ...partial,
    });
  };

  if (!isBackupSaveLocationConfigured()) {
    const err = "Choose a backup folder first (Backup location).";
    report({ phase: "error", error: err });
    return { phase: "error", total: 0, done: 0, uploaded: 0, skipped: 0, pruned: 0, error: err };
  }

  report({ phase: "listing" });
  const { files: all, scanRoot } = await listAutoBackupDriveFileCandidates();
  let queue = filterCandidatesForPrefs(all, input.prefs, input.companies);
  if (typeof input.onlySinceMs === "number" && input.onlySinceMs > 0) {
    queue = queue.filter((row) => row.modifiedAt >= input.onlySinceMs!);
  }

  if (!input.prefs.uploadCompanyIds?.length) {
    const err = "Select at least one company to upload.";
    report({ phase: "error", error: err, total: 0 });
    return { phase: "error", total: 0, done: 0, uploaded: 0, skipped: 0, pruned: 0, error: err };
  }

  if (!all.length) {
    const err = `No .plbp files found in backup folder: ${scanRoot}. Expected folders like {company}/{year}/July/{day}/file.plbp`;
    report({ phase: "error", error: err, total: 0 });
    return { phase: "error", total: 0, done: 0, uploaded: 0, skipped: 0, pruned: 0, error: err };
  }

  if (!queue.length) {
    const err = `Found ${all.length} backup file(s) under ${scanRoot}, but none match selected companies or upload range.`;
    report({ phase: "error", error: err, total: 0 });
    return { phase: "error", total: 0, done: 0, uploaded: 0, skipped: 0, pruned: 0, error: err };
  }

  let uploaded = 0;
  let skipped = 0;
  let pruned = 0;
  let skipReason: string | undefined;
  const total = queue.length;

  for (let i = 0; i < queue.length; i++) {
    const row = queue[i]!;
    report({
      phase: "uploading",
      total,
      done: i,
      currentFile: row.fileName,
      uploaded,
      skipped,
      pruned,
      skipReason,
    });

    let blob: Blob;
    try {
      blob = await row.readBlob();
    } catch (e) {
      skipped++;
      if (!skipReason) {
        skipReason = `Could not read ${row.fileName}: ${e instanceof Error ? e.message : String(e)}`;
      }
      continue;
    }
    if (!blob.size) {
      skipped++;
      if (!skipReason) skipReason = `${row.fileName} is empty (0 bytes).`;
      continue;
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      skipped++;
      if (!skipReason) {
        skipReason = `${row.fileName} is larger than 45 MB — split/smaller backup, then retry.`;
      }
      continue;
    }

    const parts = row.relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
    const fileName = parts[parts.length - 1] || row.fileName;
    const companyFolder = parts[0] || row.companyFolder;
    const relativeDir = parts.slice(1, -1).join("/");

    try {
      const base64 = await blobToBase64(blob);
      const res = await postDriveJsonViaClient<{
        ok?: boolean;
        remotePath?: string;
        pruned?: number;
      }>("/api/local-cloud-sync/drive/upload-auto-backup", {
        mainFolderName: input.prefs.mainFolderName,
        companyFolderName: sanitizeDriveFolderSegment(companyFolder),
        relativeDir,
        fileName,
        base64,
        keepPerCompany: input.prefs.keepPerCompany,
      });
      uploaded++;
      pruned += Number(res.pruned) || 0;
    } catch (e) {
      skipped++;
      if (!skipReason) {
        skipReason = formatDriveUploadError(fileName, e);
      }
    }
  }

  const done: AutoBackupDriveUploadProgress = {
    phase: uploaded > 0 ? "done" : "error",
    total,
    done: total,
    uploaded,
    skipped,
    pruned,
    skipReason,
    error:
      uploaded > 0
        ? undefined
        : skipReason || "Upload failed — files were found but none uploaded.",
  };
  report(done);
  return done;
}

function sanitizeDriveFolderSegment(raw: string): string {
  return (
    String(raw || "")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "company"
  );
}

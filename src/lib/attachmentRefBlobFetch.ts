"use client";

import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import {
  getBlobFromLocalFileRef,
  getPendingFiles,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
} from "@/lib/localPendingFiles";
import { isDriveFileRef, remotePathFromDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { looksLikeFirebaseStorageObjectPath } from "@/lib/firebaseStorageDownloadUrl";

/** IndexedDB/native offline cache key — `PL_ATTACH` ko decode karke stable `drive:`/`local:`/https ref. */
export function offlineCacheKeyForAttachmentRef(rawUrl: string): string {
  return normalizeAttachmentUrlForDevicePreview(rawUrl);
}

export function isOfflineCacheableAttachmentRef(raw: string): boolean {
  const u = offlineCacheKeyForAttachmentRef(raw);
  if (!u) return false;
  if (/^https?:\/\//i.test(u)) return true;
  if (looksLikeFirebaseStorageObjectPath(u)) return true;
  if (isLocalFileRef(u) || isDriveFileRef(u)) return true;
  return false;
}

export type FetchAttachmentRefBlobOptions = {
  galleryUrls?: readonly string[];
  signal?: AbortSignal;
};

/** Preview/hover callers — gallery me parallel `local:` match ke liye. */
export type AttachmentPreviewBlobLoadOptions = {
  galleryUrls?: readonly string[];
};

/**
 * Preview / prefetch / open: pending `local:` pehle, phir `drive:` (gallery/local filename match),
 * phir Firebase HTTPS / Storage path.
 */
export async function fetchAttachmentRefBlob(
  rawUrl: string,
  options?: FetchAttachmentRefBlobOptions
): Promise<Blob | null> {
  const u = offlineCacheKeyForAttachmentRef(rawUrl);
  if (!u) return null;

  if (isLocalFileRef(u)) {
    const blob = await getBlobFromLocalFileRef(u, { context: "fetchAttachmentRefBlob" });
    if (blob && blob.size > 0) return blob;
  }

  if (isDriveFileRef(u)) {
    const gallery = options?.galleryUrls;
    if (gallery?.length) {
      const rawTrim = String(rawUrl).trim();
      const idx = gallery.findIndex((g) => {
        const gt = String(g || "").trim();
        return gt === rawTrim || offlineCacheKeyForAttachmentRef(g) === u;
      });
      if (idx >= 0) {
        const peer = offlineCacheKeyForAttachmentRef(String(gallery[idx] || ""));
        if (isLocalFileRef(peer)) {
          const localBlob = await getBlobFromLocalFileRef(peer, { context: "fetchAttachmentRefBlob" });
          if (localBlob && localBlob.size > 0) return localBlob;
        }
      }
    }
    const logical = remotePathFromDriveFileRef(u) || u;
    const fileTail = logical.split("/").pop()?.trim().toLowerCase() || "";
    if (fileTail) {
      try {
        for (const row of await getPendingFiles()) {
          const fn = String(row.fileName || "")
            .trim()
            .toLowerCase();
          if (!fn || fn !== fileTail) continue;
          const localBlob = await getBlobFromLocalFileRef(`${LOCAL_FILE_PREFIX}${row.id}`, {
            context: "fetchAttachmentRefBlob",
          });
          if (localBlob && localBlob.size > 0) return localBlob;
        }
      } catch {
        /* pending optional */
      }
    }
    const driveBlob = await getBlobFromLocalFileRef(u, { context: "fetchAttachmentRefBlobDrive" });
    if (driveBlob && driveBlob.size > 0) return driveBlob;
  }

  if (/^https?:\/\//i.test(u) || looksLikeFirebaseStorageObjectPath(u)) {
    const { fetchHttpsAttachmentBlobForPrefetchMiss } = await import("@/lib/offlineAttachmentUrlCache");
    const httpsBlob = await fetchHttpsAttachmentBlobForPrefetchMiss(u, options?.signal);
    if (httpsBlob && httpsBlob.size > 0) return httpsBlob;
  }

  return null;
}

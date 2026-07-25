"use client";

import type { AttachmentPreviewBlobLoadOptions } from "@/lib/attachmentRefBlobFetch";
import { fetchAttachmentRefBlob } from "@/lib/attachmentRefBlobFetch";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import { getBlobFromLocalFileRef, isLocalFileRef } from "@/lib/localPendingFiles";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";
import {
  getOfflineCachedAttachmentBlob,
  getRemoteAttachmentBlobPreferOfflineCache,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";

export type { AttachmentPreviewBlobLoadOptions };

/**
 * Mobile/APK/EXE + PC preview: pehle offline blob cache (Firebase warm / SQLite+files on native),
 * phir pending `local:` / gallery match, phir network hydrate.
 */
export async function getBlobFromAttachmentRefPreferLocalFirst(
  rawUrl: string,
  options?: AttachmentPreviewBlobLoadOptions
): Promise<Blob | null> {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;
  const normalized = normalizeAttachmentUrlForDevicePreview(trimmed) || trimmed;

  // Hot path: pending IndexedDB blob — SHA cache loop se pehle (local company tick open).
  if (isLocalFileRef(normalized)) {
    const pendingBlob = await getBlobFromLocalFileRef(normalized, {
      context: "preferLocalFirst",
      companyId: options?.companyId,
    });
    if (pendingBlob && pendingBlob.size > 0) return pendingBlob;
  }

  // Drive ref: pehle device offline cache — har open par pocket-ledger Drive API mat.
  if (isDriveFileRef(normalized)) {
    const cachedDrive = await getOfflineCachedAttachmentBlob(normalized);
    if (cachedDrive && cachedDrive.size > 0) return cachedDrive;
    if (trimmed !== normalized) {
      const altDrive = await getOfflineCachedAttachmentBlob(trimmed);
      if (altDrive && altDrive.size > 0) return altDrive;
    }
  }

  const cached = await tryOfflineCachedAttachmentBlobMultiKey(normalized);
  if (cached && cached.size > 0) return cached;
  if (normalized !== trimmed) {
    const altCached = await tryOfflineCachedAttachmentBlobMultiKey(trimmed);
    if (altCached && altCached.size > 0) return altCached;
  }

  if (isLocalFileRef(normalized) || isDriveFileRef(normalized) || options?.companyId) {
    const localOrRemote = await fetchAttachmentRefBlob(normalized, {
      galleryUrls: options?.galleryUrls,
      companyId: options?.companyId,
      localOnly: options?.localLedgerOnly,
    });
    if (localOrRemote && localOrRemote.size > 0) return localOrRemote;
  }

  if (options?.localLedgerOnly) return null;

  return getRemoteAttachmentBlobPreferOfflineCache(normalized, undefined, {
    galleryUrls: options?.galleryUrls,
    companyId: options?.companyId,
    localOnly: options?.localLedgerOnly,
  });
}

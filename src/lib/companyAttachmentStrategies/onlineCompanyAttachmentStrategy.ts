"use client";

import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import {
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  isLocalFileRef,
} from "@/lib/localPendingFiles";
import {
  ensureOfflineCachedAttachmentDisplay,
  getOfflineCachedAttachmentNativeRef,
  getRemoteAttachmentBlobPreferOfflineCache,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";
import { isFirebaseLedgerDeltaSqliteTransportMode } from "@/lib/firebaseLedgerSyncPolicy";
import { isFirebaseLedgerDataSyncDisabled } from "@/lib/firebaseLedgerDataSyncDisabled";
import { isFirebaseLedgerCompanyAttachmentSyncEnabled } from "@/lib/firebaseLedgerCompanySyncPrefs";
import { looksLikeFirebaseStorageDownloadUrl } from "@/lib/storageGetBlobFromDownloadUrl";
import { usesEmbeddedNativeAttachmentStorage } from "@/lib/usesEmbeddedNativeAttachmentStorage";
import type { AttachmentDisplayOptions, AttachmentDisplayResult } from "@/lib/companyAttachmentStrategies/types";

function isHttpsAttachmentRef(raw: string): boolean {
  return /^https?:\/\//i.test(String(raw || "").trim());
}

async function resolveCompanyId(explicit?: string): Promise<string | undefined> {
  if (explicit?.trim()) return explicit.trim();
  const { readActiveAttachmentCompanyId } = await import("@/lib/firestorePermissionSuppress");
  return readActiveAttachmentCompanyId() ?? undefined;
}

/** Online/Firebase company: web uses HTTPS; embedded static clients use cache/blob first. */
export async function resolveOnlineCompanyAttachmentDisplay(
  rawUrl: string,
  options?: AttachmentDisplayOptions
): Promise<AttachmentDisplayResult> {
  const url = normalizeAttachmentUrlForDevicePreview(String(rawUrl || "").trim());
  if (!url) return { displayUrl: null, blob: null, contentType: null };
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return { displayUrl: url, blob: null, contentType: null };
  }

  const companyId = await resolveCompanyId(options?.companyId);
  const cacheOpts = { companyId, signal: options?.signal };
  const isEmbeddedNative = usesEmbeddedNativeAttachmentStorage();
  const online = typeof navigator !== "undefined" && navigator.onLine;

  if (isLocalFileRef(url)) {
    if (isEmbeddedNative) {
      const meta = getLocalFileRefMetaSync(url) ?? (await getLocalFileRefMeta(url));
      if (meta?.displayUrl) {
        return { displayUrl: meta.displayUrl, blob: null, contentType: meta.contentType ?? null };
      }
    }
    const blob = await getBlobFromLocalFileRef(url, { companyId });
    return { displayUrl: null, blob, contentType: blob?.type ?? null };
  }

  if (!isHttpsAttachmentRef(url)) {
    return ensureOfflineCachedAttachmentDisplay(url, options?.signal, cacheOpts);
  }

  if (isEmbeddedNative && online) {
    const blob = await getRemoteAttachmentBlobPreferOfflineCache(url, options?.signal, {
      awaitDiskWrite: false,
      companyId,
    });
    if (blob && blob.size > 0) {
      return { displayUrl: null, blob, contentType: blob.type || null };
    }
    if (looksLikeFirebaseStorageDownloadUrl(url)) {
      return { displayUrl: null, blob: null, contentType: null };
    }
    return { displayUrl: url, blob: null, contentType: null };
  }

  const native = await getOfflineCachedAttachmentNativeRef(url);
  if (native?.displayUrl) {
    return { displayUrl: native.displayUrl, blob: null, contentType: native.contentType };
  }

  const cached = await tryOfflineCachedAttachmentBlobMultiKey(url);
  if (cached && cached.size > 0) {
    return { displayUrl: null, blob: cached, contentType: cached.type || null };
  }

  if (isEmbeddedNative && !online) {
    const ensured = await ensureOfflineCachedAttachmentDisplay(url, options?.signal, cacheOpts);
    if (ensured.displayUrl || ensured.blob) return ensured;
    return { displayUrl: null, blob: null, contentType: null };
  }

  // Cloud data sync off: browser ko seedha Firebase HTTPS mat do — sirf pehle se cached blob.
  if (
    isFirebaseLedgerDataSyncDisabled() ||
    (companyId ? !isFirebaseLedgerCompanyAttachmentSyncEnabled(companyId) : false)
  ) {
    return { displayUrl: null, blob: null, contentType: null };
  }

  return { displayUrl: url, blob: null, contentType: null };
}

export const onlineCompanyAttachmentStrategy = {
  mode: "online" as const,
  usesSqliteFirstLedgerWrites: isFirebaseLedgerDeltaSqliteTransportMode,
  requiresLocalAttachmentUrlsOnly: false,
  prefersLocalAttachmentDisplayFirst: usesEmbeddedNativeAttachmentStorage,
  resolveAttachmentDisplay: resolveOnlineCompanyAttachmentDisplay,
};

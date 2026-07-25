"use client";

import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import {
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  isLocalFileRef,
} from "@/lib/localPendingFiles";
import {
  getOfflineCachedAttachmentNativeRef,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";
import { normalizeFirebaseStorageObjectPathForSdk } from "@/lib/firebaseStorageDownloadUrl";
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

async function readLocalAttachmentCacheOnly(
  url: string,
  companyId?: string
): Promise<AttachmentDisplayResult> {
  const native = await getOfflineCachedAttachmentNativeRef(url);
  if (native?.displayUrl) {
    return { displayUrl: native.displayUrl, blob: null, contentType: native.contentType };
  }

  const cached = await tryOfflineCachedAttachmentBlobMultiKey(url);
  if (cached && cached.size > 0) {
    return { displayUrl: null, blob: cached, contentType: cached.type || null };
  }

  const norm = normalizeFirebaseStorageObjectPathForSdk(url, { companyId });
  if (norm && norm !== url) {
    const altNative = await getOfflineCachedAttachmentNativeRef(norm);
    if (altNative?.displayUrl) {
      return { displayUrl: altNative.displayUrl, blob: null, contentType: altNative.contentType };
    }
    const altCached = await tryOfflineCachedAttachmentBlobMultiKey(norm);
    if (altCached && altCached.size > 0) {
      return { displayUrl: null, blob: altCached, contentType: altCached.type || null };
    }
  }

  return { displayUrl: null, blob: null, contentType: null };
}

/** Local SQLite company: preview from local/native/cache only — Firebase network mat. */
export async function resolveLocalCompanyAttachmentDisplay(
  rawUrl: string,
  options?: AttachmentDisplayOptions
): Promise<AttachmentDisplayResult> {
  const url = normalizeAttachmentUrlForDevicePreview(String(rawUrl || "").trim());
  if (!url) return { displayUrl: null, blob: null, contentType: null };
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return { displayUrl: url, blob: null, contentType: null };
  }

  const companyId = await resolveCompanyId(options?.companyId);

  if (isLocalFileRef(url)) {
    if (usesEmbeddedNativeAttachmentStorage()) {
      const meta = getLocalFileRefMetaSync(url) ?? (await getLocalFileRefMeta(url));
      if (meta?.displayUrl) {
        return { displayUrl: meta.displayUrl, blob: null, contentType: meta.contentType ?? null };
      }
    }
    const blob = await getBlobFromLocalFileRef(url, { companyId });
    return { displayUrl: null, blob, contentType: blob?.type ?? null };
  }

  return readLocalAttachmentCacheOnly(url, companyId);
}

export const localCompanyAttachmentStrategy = {
  mode: "local" as const,
  usesSqliteFirstLedgerWrites: true,
  requiresLocalAttachmentUrlsOnly: true,
  prefersLocalAttachmentDisplayFirst: true,
  resolveAttachmentDisplay: resolveLocalCompanyAttachmentDisplay,
};

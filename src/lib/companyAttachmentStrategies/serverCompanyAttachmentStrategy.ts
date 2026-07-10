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
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";
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

/** PL server company: local ref first, then LAN/server attachment endpoint. */
export async function resolveServerCompanyAttachmentDisplay(
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

  if (isLocalFileRef(url)) {
    if (usesEmbeddedNativeAttachmentStorage()) {
      const meta = getLocalFileRefMetaSync(url) ?? (await getLocalFileRefMeta(url));
      if (meta?.displayUrl) {
        return { displayUrl: meta.displayUrl, blob: null, contentType: meta.contentType ?? null };
      }
    }
    let blob = await getBlobFromLocalFileRef(url, { companyId });
    if ((!blob || blob.size <= 0) && companyId) {
      const { resolvePlServerStaffAttachmentPreviewBlob } = await import("@/lib/plServerAttachmentFetch");
      blob = await resolvePlServerStaffAttachmentPreviewBlob(url, {
        companyId,
        signal: options?.signal,
      });
    }
    return { displayUrl: null, blob, contentType: blob?.type ?? null };
  }

  if (!isHttpsAttachmentRef(url)) {
    return ensureOfflineCachedAttachmentDisplay(url, options?.signal, cacheOpts);
  }

  const native = await getOfflineCachedAttachmentNativeRef(url);
  if (native?.displayUrl) {
    return { displayUrl: native.displayUrl, blob: null, contentType: native.contentType };
  }

  const cached = await tryOfflineCachedAttachmentBlobMultiKey(url);
  if (cached && cached.size > 0) {
    return { displayUrl: null, blob: cached, contentType: cached.type || null };
  }

  if (options?.localLedgerOnly === true) {
    const ensured = await ensureOfflineCachedAttachmentDisplay(url, options?.signal, cacheOpts);
    if (ensured.displayUrl || ensured.blob) return ensured;
    return { displayUrl: null, blob: null, contentType: null };
  }

  return { displayUrl: url, blob: null, contentType: null };
}

export const serverCompanyAttachmentStrategy = {
  mode: "server" as const,
  usesSqliteFirstLedgerWrites: true,
  requiresLocalAttachmentUrlsOnly: true,
  prefersLocalAttachmentDisplayFirst: true,
  resolveAttachmentDisplay: resolveServerCompanyAttachmentDisplay,
};

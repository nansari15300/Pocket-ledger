"use client";

import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import {
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  getBlobFromLocalFileRef,
  isLocalFileRef,
} from "@/lib/localPendingFiles";
import {
  ensureOfflineCachedAttachmentDisplay,
  getOfflineCachedAttachmentNativeRef,
  getRemoteAttachmentBlobPreferOfflineCache,
  tryOfflineCachedAttachmentBlobMultiKey,
} from "@/lib/offlineAttachmentUrlCache";
import type { Company } from "@/hooks/useCompany";
import { isServerGateCompany, shouldReadLedgerFromSqliteOnly } from "@/lib/companyStorageKind";
import {
  usesEmbeddedNativeAttachmentStorage,
} from "@/lib/usesEmbeddedNativeAttachmentStorage";

/** Local / server-gate ledger: static app me HTTPS thumbnail mat — disk cache ya download → local URL. */
export function companyRequiresLocalAttachmentUrlsOnly(
  company: (Company & { plServerShared?: boolean }) | null | undefined
): boolean {
  if (!company) return false;
  return shouldReadLedgerFromSqliteOnly(company) || isServerGateCompany(company);
}

/** EXE/APK: hamesha pl-attachments / blob cache pehle; web browser alag rehta hai. */
export function prefersLocalAttachmentDisplayFirst(
  company: (Company & { plServerShared?: boolean }) | null | undefined
): boolean {
  if (companyRequiresLocalAttachmentUrlsOnly(company)) return true;
  return usesEmbeddedNativeAttachmentStorage();
}

export type StaticAttachmentDisplayResult = {
  displayUrl: string | null;
  blob: Blob | null;
  contentType: string | null;
};

function isHttpsAttachmentRef(raw: string): boolean {
  return /^https?:\/\//i.test(String(raw || "").trim());
}

/**
 * Preview/display resolve.
 * EXE/APK online: local cache pehle, miss par turant HTTPS + background disk save.
 * Offline / server-gate: sirf local bytes.
 */
export async function resolveStaticAttachmentDisplay(
  rawUrl: string,
  options?: { localLedgerOnly?: boolean; signal?: AbortSignal; companyId?: string }
): Promise<StaticAttachmentDisplayResult> {
  const url = normalizeAttachmentUrlForDevicePreview(String(rawUrl || "").trim());
  if (!url) return { displayUrl: null, blob: null, contentType: null };

  const { readActiveAttachmentCompanyId } = await import("@/lib/firestorePermissionSuppress");
  const companyId = options?.companyId ?? readActiveAttachmentCompanyId() ?? undefined;
  const cacheOpts = { companyId, signal: options?.signal };

  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return { displayUrl: url, blob: null, contentType: null };
  }

  if (isLocalFileRef(url)) {
    if (usesEmbeddedNativeAttachmentStorage()) {
      const meta = getLocalFileRefMetaSync(url) ?? (await getLocalFileRefMeta(url));
      if (meta?.displayUrl) {
        return {
          displayUrl: meta.displayUrl,
          blob: null,
          contentType: meta.contentType ?? null,
        };
      }
    }
    let blob = await getBlobFromLocalFileRef(url, { companyId });
    if ((!blob || blob.size <= 0) && companyId) {
      const { fetchPlServerAttachmentBlob } = await import("@/lib/plServerAttachmentFetch");
      blob = await fetchPlServerAttachmentBlob(companyId, url, options?.signal);
    }
    return { displayUrl: null, blob, contentType: blob?.type ?? null };
  }

  const isEmbeddedNative = usesEmbeddedNativeAttachmentStorage();
  const localLedgerOnly = options?.localLedgerOnly === true;

  if (!isHttpsAttachmentRef(url) && !localLedgerOnly) {
    return ensureOfflineCachedAttachmentDisplay(url, options?.signal, cacheOpts);
  }

  if (!isHttpsAttachmentRef(url)) {
    return ensureOfflineCachedAttachmentDisplay(url, options?.signal, cacheOpts);
  }

  const online = typeof navigator !== "undefined" && navigator.onLine;

  // EXE/APK online (cloud): turant HTTPS — poora disk blob read click par mat karo (20ms jaisa pehle).
  if (isEmbeddedNative && online && !localLedgerOnly) {
    void getRemoteAttachmentBlobPreferOfflineCache(url, options?.signal, {
      awaitDiskWrite: false,
      companyId,
    });
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

  if (localLedgerOnly || (isEmbeddedNative && !online)) {
    const ensured = await ensureOfflineCachedAttachmentDisplay(url, options?.signal, cacheOpts);
    if (ensured.displayUrl || ensured.blob) return ensured;
    return { displayUrl: null, blob: null, contentType: null };
  }

  if (isHttpsAttachmentRef(url)) {
    return { displayUrl: url, blob: null, contentType: null };
  }

  return { displayUrl: null, blob: null, contentType: null };
}

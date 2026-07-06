"use client";

import {
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  getBlobFromLocalFileRef,
  isLocalFileRef,
} from "@/lib/localPendingFiles";
import { isOfflineCachedAttachmentOnDevice } from "@/lib/offlineAttachmentUrlCache";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import { peekHoverCachedBlobUrl } from "@/lib/attachmentHoverBlobCache";
import { isDriveFileRef } from "@/lib/legacyDriveFileRef";

async function resolveAttachmentCompanyId(explicit?: string): Promise<string | undefined> {
  const trimmed = String(explicit || "").trim();
  if (trimmed) return trimmed;
  const { readActiveAttachmentCompanyId } = await import("@/lib/firestorePermissionSuppress");
  return readActiveAttachmentCompanyId() ?? undefined;
}

export type AttachmentUrlLoadStatus = "unknown" | "loading" | "ready";

const statusByUrl = new Map<string, AttachmentUrlLoadStatus>();
const storeListeners = new Set<() => void>();

function urlKey(raw: string): string {
  return normalizeAttachmentUrlForDevicePreview(String(raw || "").trim());
}

function publishAttachmentLoadStore(): void {
  for (const l of storeListeners) l();
}

export function subscribeAttachmentLoadStore(onChange: () => void): () => void {
  storeListeners.add(onChange);
  return () => {
    storeListeners.delete(onChange);
  };
}

export function getAttachmentUrlLoadStatus(raw: string): AttachmentUrlLoadStatus {
  const k = urlKey(raw);
  if (!k) return "ready";
  return statusByUrl.get(k) ?? "unknown";
}

/** Cache / disk / local pending hit — poora blob read nahi. */
export async function isAttachmentUrlReadyOnDevice(
  raw: string,
  companyId?: string,
  galleryUrls?: readonly string[]
): Promise<boolean> {
  const u = String(raw || "").trim();
  if (!u) return true;
  if (peekHoverCachedBlobUrl(u)) return true;
  const cid = await resolveAttachmentCompanyId(companyId);
  if (isLocalFileRef(u)) {
    const meta = getLocalFileRefMetaSync(u) ?? (await getLocalFileRefMeta(u));
    if (meta?.displayUrl?.trim() || meta?.filePath?.trim()) return true;
    const blob = await getBlobFromLocalFileRef(u, { companyId: cid });
    if (blob && blob.size > 0) return true;
    if (cid && galleryUrls?.length) {
      const { fetchAttachmentRefBlob } = await import("@/lib/attachmentRefBlobFetch");
      const paired = await fetchAttachmentRefBlob(u, { companyId: cid, galleryUrls });
      return !!(paired && paired.size > 0);
    }
    return false;
  }
  if (isDriveFileRef(u)) {
    if (await isOfflineCachedAttachmentOnDevice(u)) return true;
    if (cid) {
      const blob = await getBlobFromLocalFileRef(u, { companyId: cid });
      return !!(blob && blob.size > 0);
    }
    return false;
  }
  return isOfflineCachedAttachmentOnDevice(u);
}

export function markAttachmentUrlReady(raw: string): void {
  const k = urlKey(raw);
  if (!k) return;
  if (statusByUrl.get(k) === "ready") return;
  statusByUrl.set(k, "ready");
  publishAttachmentLoadStore();
}

export function computeAttachmentUrlsReadyState(urls: readonly string[]): "loading" | "ready" {
  const list = urls.map((u) => String(u || "").trim()).filter(Boolean);
  if (list.length === 0) return "ready";
  for (const u of list) {
    if (getAttachmentUrlLoadStatus(u) !== "ready") return "loading";
  }
  return "ready";
}

const warmInFlight = new Set<string>();

/** Background: bytes cache / hover LRU — green tick jab ready. */
export async function ensureAttachmentUrlReadyOnDevice(
  raw: string,
  companyId?: string,
  galleryUrls?: readonly string[]
): Promise<boolean> {
  const u = String(raw || "").trim();
  if (!u) return true;
  const k = urlKey(u);
  if (statusByUrl.get(k) === "ready") return true;
  if (warmInFlight.has(k)) return false;

  const cid = await resolveAttachmentCompanyId(companyId);

  if (await isAttachmentUrlReadyOnDevice(u, cid, galleryUrls)) {
    markAttachmentUrlReady(u);
    return true;
  }

  statusByUrl.set(k, "loading");
  publishAttachmentLoadStore();
  warmInFlight.add(k);
  try {
    const { ensureOfflineCachedAttachmentDisplay } = await import("@/lib/offlineAttachmentUrlCache");
    const { prewarmVisibleAttachmentRefsForInstantOpen } = await import(
      "@/components/vouchers/attachmentHoverPreviewBody"
    );
    await prewarmVisibleAttachmentRefsForInstantOpen([u], { maxUrls: 1, companyId: cid });
    if (await isAttachmentUrlReadyOnDevice(u, cid, galleryUrls)) {
      markAttachmentUrlReady(u);
      return true;
    }
    const got = await ensureOfflineCachedAttachmentDisplay(u, undefined, {
      companyId: cid,
      galleryUrls,
    });
    if (got.displayUrl || (got.blob && got.blob.size > 0)) {
      markAttachmentUrlReady(u);
      return true;
    }
    statusByUrl.set(k, "unknown");
    publishAttachmentLoadStore();
    return false;
  } catch {
    statusByUrl.set(k, "unknown");
    publishAttachmentLoadStore();
    return false;
  } finally {
    warmInFlight.delete(k);
  }
}

export function queueAttachmentUrlsWarm(
  urls: readonly string[],
  companyId?: string,
  galleryUrls?: readonly string[]
): void {
  const gallery = galleryUrls ?? urls;
  for (const u of urls) {
    const trimmed = String(u || "").trim();
    if (!trimmed) continue;
    void ensureAttachmentUrlReadyOnDevice(trimmed, companyId, gallery);
  }
}

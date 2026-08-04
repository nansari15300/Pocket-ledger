"use client";

import {
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  getBlobFromLocalFileRef,
  isLocalFileRef,
} from "@/lib/localPendingFiles";
import {
  getOfflineCachedAttachmentNativeRef,
  isOfflineCachedAttachmentOnDevice,
} from "@/lib/offlineAttachmentUrlCache";
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
let attachmentUiRefreshTick = 0;
let attachmentUiRefreshListenersInstalled = false;
let lastWindowRefreshAt = 0;
const WINDOW_REFRESH_THROTTLE_MS = 800;

function urlKey(raw: string): string {
  return normalizeAttachmentUrlForDevicePreview(String(raw || "").trim());
}

function isInlinePreviewUrl(raw: string): boolean {
  return /^(data:|blob:)/i.test(String(raw || "").trim());
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

export function getAttachmentUiRefreshTick(): number {
  return attachmentUiRefreshTick;
}

let attachmentUiRefreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const ATTACHMENT_UI_REFRESH_DEBOUNCE_MS = 280;

function flushAttachmentUiRefresh(): void {
  attachmentUiRefreshDebounceTimer = null;
  attachmentUiRefreshTick = (attachmentUiRefreshTick + 1) % Number.MAX_SAFE_INTEGER;
  publishAttachmentLoadStore();
}

export function requestAttachmentUiRefresh(): void {
  if (attachmentUiRefreshDebounceTimer != null) return;
  attachmentUiRefreshDebounceTimer = setTimeout(flushAttachmentUiRefresh, ATTACHMENT_UI_REFRESH_DEBOUNCE_MS);
}

export function ensureAttachmentUiRefreshListeners(): void {
  if (attachmentUiRefreshListenersInstalled) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  attachmentUiRefreshListenersInstalled = true;

  const requestFromWindow = () => {
    if (document.visibilityState === "hidden") return;
    const now = Date.now();
    if (now - lastWindowRefreshAt < WINDOW_REFRESH_THROTTLE_MS) return;
    lastWindowRefreshAt = now;
    requestAttachmentUiRefresh();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") requestFromWindow();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", requestFromWindow);
  window.addEventListener("pageshow", requestFromWindow);
  window.addEventListener("online", requestFromWindow);
}

export function getAttachmentUrlLoadStatus(raw: string): AttachmentUrlLoadStatus {
  const k = urlKey(raw);
  if (!k) return "ready";
  if (isInlinePreviewUrl(k)) return "ready";
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
  if (isInlinePreviewUrl(u)) return true;
  if (peekHoverCachedBlobUrl(u)) return true;
  const cid = await resolveAttachmentCompanyId(companyId);
  if (isLocalFileRef(u)) {
    const meta = getLocalFileRefMetaSync(u) ?? (await getLocalFileRefMeta(u));
    if (meta?.displayUrl?.trim() || meta?.filePath?.trim()) return true;
    const blob = await getBlobFromLocalFileRef(u, { companyId: cid });
    if (blob && blob.size > 0) return true;
    if (await isOfflineCachedAttachmentOnDevice(u)) return true;
    try {
      const native = await getOfflineCachedAttachmentNativeRef(u);
      if (native?.displayUrl?.trim()) return true;
    } catch {
      /* optional */
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
  // useSyncExternalStore needs a changed snapshot, not only a listener callback.
  requestAttachmentUiRefresh();
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
const warmRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const warmAttemptByUrl = new Map<string, number>();
const WARM_RETRY_MS = 5_000;
const WARM_MAX_ATTEMPTS = 3;

function scheduleAttachmentWarmRetry(
  raw: string,
  companyId?: string,
  galleryUrls?: readonly string[]
): void {
  const k = urlKey(raw);
  if (!k || warmRetryTimers.has(k)) return;
  const attempts = (warmAttemptByUrl.get(k) ?? 0) + 1;
  warmAttemptByUrl.set(k, attempts);
  if (attempts >= WARM_MAX_ATTEMPTS) {
    markAttachmentUrlReady(raw);
    return;
  }
  warmRetryTimers.set(
    k,
    setTimeout(() => {
      warmRetryTimers.delete(k);
      void ensureAttachmentUrlReadyOnDevice(raw, companyId, galleryUrls);
    }, WARM_RETRY_MS)
  );
}

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

  if (!await isAttachmentUrlReadyOnDevice(u, cid, galleryUrls)) {
    const { isOnlineCompanyAttachmentFilesTickEnabled } = await import("@/lib/attachmentNetworkGate");
    if (cid && !isOnlineCompanyAttachmentFilesTickEnabled(cid)) {
      statusByUrl.set(k, "loading");
      publishAttachmentLoadStore();
      return false;
    }
  }

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
    statusByUrl.set(k, "loading");
    publishAttachmentLoadStore();
    scheduleAttachmentWarmRetry(u, cid, galleryUrls);
    return false;
  } catch {
    statusByUrl.set(k, "loading");
    publishAttachmentLoadStore();
    scheduleAttachmentWarmRetry(u, cid, galleryUrls);
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

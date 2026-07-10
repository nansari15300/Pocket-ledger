"use client";

import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";

/** Dubara hover / tick par turant — blob URL session LRU (attachmentHoverPreviewBody se shared). */
const HOVER_HTTPS_UI_CACHE_MAX = 80;
const hoverHttpsBlobUrlByKey = new Map<string, string>();
const hoverHttpsBlobUrlLru: string[] = [];

function hoverPreviewBlobCacheKey(urlKey: string): string {
  return normalizeAttachmentUrlForDevicePreview(String(urlKey || "").trim());
}

export function peekHoverCachedBlobUrl(urlKey: string): string | undefined {
  const k = hoverPreviewBlobCacheKey(urlKey);
  const ou = hoverHttpsBlobUrlByKey.get(k);
  if (!ou) return undefined;
  const i = hoverHttpsBlobUrlLru.indexOf(k);
  if (i >= 0) {
    hoverHttpsBlobUrlLru.splice(i, 1);
    hoverHttpsBlobUrlLru.push(k);
  }
  return ou;
}

function removeHoverBlobUrlLruKey(key: string): void {
  const idx = hoverHttpsBlobUrlLru.indexOf(key);
  if (idx >= 0) hoverHttpsBlobUrlLru.splice(idx, 1);
}

function revokeObjectUrlIfUnreferenced(objectUrl: string): void {
  if (!objectUrl.startsWith("blob:")) return;
  for (const value of hoverHttpsBlobUrlByKey.values()) {
    if (value === objectUrl) return;
  }
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    /* ignore */
  }
}

export function forgetHoverBlobUrl(urlKey: string, expectedObjectUrl?: string): void {
  const k = hoverPreviewBlobCacheKey(urlKey);
  const existing = hoverHttpsBlobUrlByKey.get(k);
  if (!existing) return;
  if (expectedObjectUrl && existing !== expectedObjectUrl) return;
  hoverHttpsBlobUrlByKey.delete(k);
  removeHoverBlobUrlLruKey(k);
  revokeObjectUrlIfUnreferenced(existing);
}

export function rememberHoverBlobUrl(urlKey: string, objectUrl: string): void {
  const k = hoverPreviewBlobCacheKey(urlKey);
  const existing = hoverHttpsBlobUrlByKey.get(k);
  hoverHttpsBlobUrlByKey.set(k, objectUrl);
  if (existing && existing !== objectUrl) {
    revokeObjectUrlIfUnreferenced(existing);
  }
  const idx = hoverHttpsBlobUrlLru.indexOf(k);
  if (idx >= 0) hoverHttpsBlobUrlLru.splice(idx, 1);
  hoverHttpsBlobUrlLru.push(k);
  while (hoverHttpsBlobUrlLru.length > HOVER_HTTPS_UI_CACHE_MAX) {
    const drop = hoverHttpsBlobUrlLru.shift();
    if (!drop) break;
    const ou = hoverHttpsBlobUrlByKey.get(drop);
    hoverHttpsBlobUrlByKey.delete(drop);
    if (ou) {
      revokeObjectUrlIfUnreferenced(ou);
    }
  }
  void import("@/lib/attachmentLoadReady").then((m) => m.markAttachmentUrlReady(urlKey));
}

"use client";

import { getActiveGate, normalizeServerUrl } from "@/lib/gates/gateStore";
import { resolveLocalServerGateAccessToken } from "@/lib/gates/gateRuntime";
import { gateHttpFetchBlob } from "@/lib/gates/gateServerFetch";
import {
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getLocalFileRefMetaSync,
  isLocalFileRef,
  LOCAL_FILE_PREFIX,
} from "@/lib/localPendingFiles";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import { readDevClientAccessToken } from "@/lib/plServerAccessContext";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import { usesEmbeddedNativeAttachmentStorage } from "@/lib/usesEmbeddedNativeAttachmentStorage";
import { getBlobFromAttachmentRefPreferLocalFirst } from "@/lib/attachmentPreviewResolve";
import { sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { resolvePlServerHostLoopbackTransport } from "@/lib/plServerHostMirrorPublish";

/** LAN `/__pl_attachment` kabhi `application/octet-stream` bhejta hai — PDF.js / sniff branch ke liye type fix. */
async function normalizePlServerAttachmentBlob(blob: Blob, contentType?: string | null): Promise<Blob> {
  const ct = String(contentType || blob.type || "").toLowerCase();
  if (ct.includes("pdf")) {
    if (blob.type === "application/pdf") return blob;
    return new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
  }
  if (ct.startsWith("image/")) {
    if (blob.type === ct) return blob;
    return new Blob([await blob.arrayBuffer()], { type: ct });
  }
  if (blob.type && blob.type !== "application/octet-stream") return blob;
  const kind = await sniffBlobKindForPreview(blob);
  if (kind === "pdf") return new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
  if (kind === "image") {
    const mime = ct.startsWith("image/") ? ct : "image/jpeg";
    return new Blob([await blob.arrayBuffer()], { type: mime });
  }
  return blob;
}

/** Staff preview/open: pehle local bytes (host), phir `/__pl_attachment` se server fetch. */
export async function resolvePlServerStaffAttachmentPreviewBlob(
  rawUrl: string,
  options?: { companyId?: string; galleryUrls?: readonly string[]; signal?: AbortSignal }
): Promise<Blob | null> {
  const budgetMs = 22_000;
  const budgetCtrl = new AbortController();
  const budgetTimer = setTimeout(() => budgetCtrl.abort(), budgetMs);
  const linked = options?.signal
    ? (() => {
        if (options.signal!.aborted) budgetCtrl.abort();
        else options.signal!.addEventListener("abort", () => budgetCtrl.abort(), { once: true });
        return budgetCtrl.signal;
      })()
    : budgetCtrl.signal;

  const run = async (): Promise<Blob | null> => {
    const cid = String(options?.companyId || "").trim();
    const u = normalizeAttachmentUrlForDevicePreview(String(rawUrl || "").trim());
    if (!u || !isLocalFileRef(u)) return null;

    try {
      const { tryOfflineCachedAttachmentBlobMultiKey, getOfflineCachedAttachmentNativeRef } = await import(
        "@/lib/offlineAttachmentUrlCache"
      );
      const cached = await tryOfflineCachedAttachmentBlobMultiKey(u);
      if (cached && cached.size > 0) return cached;
      const native = await getOfflineCachedAttachmentNativeRef(u);
      if (native?.displayUrl?.trim()) {
        const diskBlob = await tryOfflineCachedAttachmentBlobMultiKey(u);
        if (diskBlob && diskBlob.size > 0) return diskBlob;
      }
    } catch {
      /* cache optional */
    }

    if (usesEmbeddedNativeAttachmentStorage()) {
      const meta = getLocalFileRefMetaSync(u) ?? (await getLocalFileRefMeta(u));
      if (meta?.filePath || meta?.fileUri) {
        const local = await getBlobFromLocalFileRef(u, { companyId: cid || undefined });
        if (local && local.size > 0) return local;
      }
    }

    const fromChain = await getBlobFromAttachmentRefPreferLocalFirst(u, {
      companyId: cid || undefined,
      galleryUrls: options?.galleryUrls,
    });
    if (fromChain && fromChain.size > 0) return fromChain;

    if (cid) {
      const remote = await fetchPlServerAttachmentBlob(cid, u, linked);
      if (remote && remote.size > 0) return remote;
    }
    return null;
  };

  try {
    return await run();
  } catch {
    return null;
  } finally {
    clearTimeout(budgetTimer);
  }
}

function plServerAttachmentRefFromUrl(rawUrl: string): string | null {
  const normalized = normalizeAttachmentUrlForDevicePreview(String(rawUrl || "").trim());
  if (!normalized || !isLocalFileRef(normalized)) return null;
  const id = normalized.slice(LOCAL_FILE_PREFIX.length).trim();
  return id || null;
}

function resolvePlServerAttachmentEndpointFromGate(): { baseUrl: string; accessToken: string } | null {
  if (typeof window === "undefined") return null;
  if (isPlRemoteServerClientMode()) {
    const token = readDevClientAccessToken();
    if (!token) return null;
    return { baseUrl: normalizeServerUrl(window.location.origin), accessToken: token };
  }
  const gate = getActiveGate();
  if (gate.type !== "local_server" || !gate.serverUrl) return null;
  const accessToken = resolveLocalServerGateAccessToken(gate);
  if (!accessToken) return null;
  return { baseUrl: normalizeServerUrl(gate.serverUrl), accessToken };
}

async function resolvePlServerAttachmentEndpoint(
  companyId: string
): Promise<{ baseUrl: string; accessToken: string } | null> {
  const gateEndpoint = resolvePlServerAttachmentEndpointFromGate();
  if (gateEndpoint) return gateEndpoint;

  // Host visible window: attachment bytes written by staff land in the hidden server-data bridge.
  // Fetch them back through the local sharing endpoint instead of requiring this visible renderer
  // to have the same in-memory pending-file cache.
  const loopback = await resolvePlServerHostLoopbackTransport(companyId);
  return loopback ? { baseUrl: loopback.baseUrl, accessToken: loopback.accessToken } : null;
}

/** Client / plServerShared mirror: `local:` bytes server PC se `/__pl_attachment` par. */
export async function fetchPlServerAttachmentBlob(
  companyId: string,
  rawUrl: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  const cid = String(companyId || "").trim();
  const ref = plServerAttachmentRefFromUrl(rawUrl);
  if (!cid || !ref) return null;

  const endpoint = await resolvePlServerAttachmentEndpoint(cid);
  if (!endpoint?.baseUrl) return null;

  const url = `${endpoint.baseUrl.replace(/\/$/, "")}/__pl_attachment?${new URLSearchParams({
    companyId: cid,
    ref,
  }).toString()}`;

  try {
    const { status, blob, contentType } = await gateHttpFetchBlob(url, endpoint.accessToken, signal);
    if (status >= 400 || !blob || blob.size <= 0) return null;
    return await normalizePlServerAttachmentBlob(blob, contentType);
  } catch {
    return null;
  }
}

export function canFetchPlServerAttachmentForCompany(companyId?: string | null): boolean {
  if (!String(companyId || "").trim()) return false;
  return resolvePlServerAttachmentEndpointFromGate() != null || isLocalAppServerHost();
}

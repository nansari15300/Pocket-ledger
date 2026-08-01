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
  putPendingFile,
} from "@/lib/localPendingFiles";
import { isPlRemoteServerClientMode, isPlSharingServerPortOrigin } from "@/lib/plRemoteServerClient";
import { normalizeAttachmentUrlForDevicePreview } from "@/lib/attachmentHoldClipboard";
import { usesEmbeddedNativeAttachmentStorage } from "@/lib/usesEmbeddedNativeAttachmentStorage";
import { getBlobFromAttachmentRefPreferLocalFirst } from "@/lib/attachmentPreviewResolve";
import { sniffBlobKindForPreview } from "@/lib/attachmentFormatLabel";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { resolvePlServerHostLoopbackTransport } from "@/lib/plServerHostDeltaPublish";

/** LAN gallery: 3 was dial-up feel (10 thumbs ~20s). Keep modest for Wi‑Fi + host disk. */
const PL_SERVER_ATTACHMENT_FETCH_CONCURRENCY = 10;
let activePlServerAttachmentFetches = 0;
const plServerAttachmentFetchQueue: Array<() => void> = [];
const inFlightPlServerAttachmentFetches = new Map<string, Promise<Blob | null>>();

/**
 * Host par bytes nahi mile (404) to wahi ref har render / hover pe dobara mangna
 * console + LAN ko flood karta hai. Miss ko short TTL ke liye yaad rakho.
 */
const PL_SERVER_ATTACHMENT_MISS_TTL_MS = 60_000;
const plServerAttachmentMissUntil = new Map<string, number>();

function plServerAttachmentMissKey(hostCompanyId: string, ref: string): string {
  return `${hostCompanyId}|${ref}`;
}

function isPlServerAttachmentMissCached(hostCompanyId: string, ref: string): boolean {
  const key = plServerAttachmentMissKey(hostCompanyId, ref);
  const until = plServerAttachmentMissUntil.get(key);
  if (!until) return false;
  if (Date.now() < until) return true;
  plServerAttachmentMissUntil.delete(key);
  return false;
}

function rememberPlServerAttachmentMiss(hostCompanyId: string, ref: string): void {
  plServerAttachmentMissUntil.set(
    plServerAttachmentMissKey(hostCompanyId, ref),
    Date.now() + PL_SERVER_ATTACHMENT_MISS_TTL_MS
  );
}

/** Naya upload / restore ke baad wahi ref turant fetch ho sake. */
export function clearPlServerAttachmentMissCache(ref?: string | null): void {
  const needle = String(ref || "").trim();
  if (!needle) {
    plServerAttachmentMissUntil.clear();
    return;
  }
  const id = needle.startsWith(LOCAL_FILE_PREFIX) ? needle.slice(LOCAL_FILE_PREFIX.length) : needle;
  for (const key of Array.from(plServerAttachmentMissUntil.keys())) {
    if (key.endsWith(`|${id}`)) plServerAttachmentMissUntil.delete(key);
  }
}

function runWithPlServerAttachmentFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activePlServerAttachmentFetches += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activePlServerAttachmentFetches = Math.max(0, activePlServerAttachmentFetches - 1);
          const next = plServerAttachmentFetchQueue.shift();
          if (next) next();
        });
    };
    if (activePlServerAttachmentFetches < PL_SERVER_ATTACHMENT_FETCH_CONCURRENCY) run();
    else plServerAttachmentFetchQueue.push(run);
  });
}

async function waitForPlServerAttachmentFetch(
  task: Promise<Blob | null>,
  signal?: AbortSignal
): Promise<Blob | null> {
  if (!signal) return task;
  if (signal.aborted) return null;
  return Promise.race([
    task,
    new Promise<Blob | null>((resolve) => {
      signal.addEventListener("abort", () => resolve(null), { once: true });
    }),
  ]);
}

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

export async function seedPlServerAttachmentUiCaches(localRef: string, blob: Blob): Promise<void> {
  if (!localRef || !blob?.size) return;
  await import("@/lib/offlineAttachmentUrlCache")
    .then((m) => m.seedOfflineAttachmentCacheFromBlob(localRef, blob))
    .catch(() => false);
  try {
    const kind = await sniffBlobKindForPreview(blob);
    const { rememberHoverBlobUrl } = await import("@/lib/attachmentHoverBlobCache");
    const { markAttachmentUrlReady } = await import("@/lib/attachmentLoadReady");
    const { seedOfflineAttachmentCacheFromBlob } = await import("@/lib/offlineAttachmentUrlCache");
    if (kind === "pdf") {
      const pdfBlob =
        blob.type === "application/pdf"
          ? blob
          : new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(pdfBlob);
      rememberHoverBlobUrl(localRef, objectUrl);
      const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
      const small = await convertPdfFirstPageToImage(pdfBlob, 0.55, 96);
      rememberHoverBlobUrl(`${localRef}::cell-thumb`, small.thumbnailUrl);
      void seedOfflineAttachmentCacheFromBlob(`${localRef}::cell-thumb`, small.thumbnailBlob);
      markAttachmentUrlReady(localRef);
      void convertPdfFirstPageToImage(pdfBlob, 0.92, 1800)
        .then((full) => {
          rememberHoverBlobUrl(`${localRef}::pdf-portal`, full.thumbnailUrl);
          void seedOfflineAttachmentCacheFromBlob(`${localRef}::pdf-portal`, full.thumbnailBlob);
        })
        .catch(() => undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    rememberHoverBlobUrl(localRef, objectUrl);
    rememberHoverBlobUrl(`${localRef}::cell-thumb`, objectUrl);
    markAttachmentUrlReady(localRef);
  } catch {
    /* preview seed optional */
  }
}

async function persistFetchedPlServerAttachmentRef(
  companyId: string,
  ref: string,
  blob: Blob
): Promise<void> {
  const cid = String(companyId || "").trim();
  const id = String(ref || "").replace(/^local:/, "").trim();
  if (!cid || !id || !blob?.size) return;
  try {
    await putPendingFile(
      {
        id,
        blob,
        contentType: blob.type || "application/octet-stream",
        docPath: `companies/${cid}/vouchers/${id}`,
        field: "fileUrls",
        storagePathPrefix: `voucher-files/${cid}/pl-server`,
        fileName: id,
        requireSqliteIndex: usesEmbeddedNativeAttachmentStorage(),
      },
      { skipPlServerAttachmentUploadEnqueue: true }
    );
  } catch {
    /* offline cache above is enough for preview; pending-file hydration is best-effort */
  }
}

/** Staff preview/open: pehle local bytes (host), phir `/__pl_attachment` se server fetch. */
export async function resolvePlServerStaffAttachmentPreviewBlob(
  rawUrl: string,
  options?: { companyId?: string; galleryUrls?: readonly string[]; signal?: AbortSignal }
): Promise<Blob | null> {
  /** Budget starts when work begins — not while waiting behind the concurrency queue. */
  const budgetMs = 22_000;

  const run = async (): Promise<Blob | null> => {
    if (options?.signal?.aborted) return null;
    const budgetCtrl = new AbortController();
    const budgetTimer = setTimeout(() => budgetCtrl.abort(), budgetMs);
    const linked = options?.signal
      ? (() => {
          if (options.signal!.aborted) budgetCtrl.abort();
          else options.signal!.addEventListener("abort", () => budgetCtrl.abort(), { once: true });
          return budgetCtrl.signal;
        })()
      : budgetCtrl.signal;

    try {
      const cid = String(options?.companyId || "").trim();
      const u = normalizeAttachmentUrlForDevicePreview(String(rawUrl || "").trim());
      if (!u || !isLocalFileRef(u)) return null;

      // Instant portal/open: hover LRU already has blob URL — no /__pl_attachment round-trip.
      try {
        const { peekHoverCachedBlobUrl } = await import("@/lib/attachmentHoverBlobCache");
        const hoverUrl = peekHoverCachedBlobUrl(u);
        if (hoverUrl) {
          const fromHover = await fetch(hoverUrl, { signal: linked }).then((r) => (r.ok ? r.blob() : null));
          if (fromHover && fromHover.size > 0) return fromHover;
        }
      } catch {
        /* optional */
      }

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

      /** Staff / gate tab: bytes host par — local SQLite/disk scan slow + spinner loop; server pehle. */
      if ((isPlRemoteServerClientMode() || isPlSharingServerPortOrigin()) && cid) {
        const remoteEarly = await fetchPlServerAttachmentBlob(cid, u, linked);
        if (remoteEarly && remoteEarly.size > 0) {
          void import("@/lib/offlineAttachmentUrlCache").then((m) =>
            m.seedOfflineAttachmentCacheFromBlob(u, remoteEarly)
          );
          void seedPlServerAttachmentUiCaches(u, remoteEarly);
          return remoteEarly;
        }
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
        if (remote && remote.size > 0) {
          // Next open / tile: host re-fetch skip — staff device pe cache seed.
          void import("@/lib/offlineAttachmentUrlCache").then((m) =>
            m.seedOfflineAttachmentCacheFromBlob(u, remote)
          );
          void seedPlServerAttachmentUiCaches(u, remote);
          return remote;
        }
      }
      return null;
    } finally {
      clearTimeout(budgetTimer);
    }
  };

  try {
    return await run();
  } catch {
    return null;
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
  // Staff thin client OR browser tab on PL sharing port (`:3001`) — same-origin `/__pl_attachment`.
  if (isPlRemoteServerClientMode() || isPlSharingServerPortOrigin()) {
    return { baseUrl: normalizeServerUrl(window.location.origin), accessToken: "" };
  }
  const gate = getActiveGate();
  if (gate.type !== "local_server" || !gate.serverUrl) return null;
  const accessToken = resolveLocalServerGateAccessToken(gate);
  return { baseUrl: normalizeServerUrl(gate.serverUrl), accessToken: accessToken || "" };
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

  const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
  const hostCompanyId = (await resolvePlServerHostCompanyId(cid)) || cid;
  if (isPlServerAttachmentMissCached(hostCompanyId, ref)) return null;

  const url = `${endpoint.baseUrl.replace(/\/$/, "")}/__pl_attachment?${new URLSearchParams({
    companyId: hostCompanyId,
    ref,
  }).toString()}`;
  const fetchKey = `${endpoint.baseUrl}|${endpoint.accessToken}|${hostCompanyId}|${ref}`;

  let shared = inFlightPlServerAttachmentFetches.get(fetchKey);
  if (!shared) {
    shared = runWithPlServerAttachmentFetchSlot(async () => {
      try {
        const { status, blob, contentType } = await gateHttpFetchBlob(url, endpoint.accessToken);
        if (status >= 400 || !blob || blob.size <= 0) {
          // 404 = bytes host par nahi (restore/foreign ref). Repeat request rok do.
          if (status === 404 || status === 410) rememberPlServerAttachmentMiss(hostCompanyId, ref);
          return null;
        }
        const normalized = await normalizePlServerAttachmentBlob(blob, contentType);
        await seedPlServerAttachmentUiCaches(`${LOCAL_FILE_PREFIX}${ref}`, normalized);
        // Thumb path: don't block next gallery tiles on SQLite/disk pending write.
        void persistFetchedPlServerAttachmentRef(cid, ref, normalized);
        return normalized;
      } catch {
        return null;
      }
    }).finally(() => {
      inFlightPlServerAttachmentFetches.delete(fetchKey);
    });
    inFlightPlServerAttachmentFetches.set(fetchKey, shared);
  }
  return waitForPlServerAttachmentFetch(shared, signal);
}

export function canFetchPlServerAttachmentForCompany(companyId?: string | null): boolean {
  if (!String(companyId || "").trim()) return false;
  if (isPlSharingServerPortOrigin() || isPlRemoteServerClientMode()) return true;
  return resolvePlServerAttachmentEndpointFromGate() != null || isLocalAppServerHost();
}

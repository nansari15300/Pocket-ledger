"use client";

import { isServerGateCompany } from "@/lib/companyStorageKind";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isLocalAppServerHost } from "@/lib/localAppServerDevPreview";
import { isLocalServerShareableCompany } from "@/lib/localServerShareableCompanies";
import { gateHttpPost } from "@/lib/gates/gateServerFetch";
import { shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import { isPlRemoteServerClientMode } from "@/lib/plRemoteServerClient";
import {
  LOCAL_FILE_PREFIX,
  getPendingPayloadForLocalRef,
  resolvePendingPayloadCompanyId,
  type PendingFilePayload,
} from "@/lib/localPendingFiles";
import { computeSha256HexFromBlob } from "@/lib/security/sha256Hex";
import { resolvePlServerMirrorTransport } from "@/lib/plServerClientMirrorPush";

const UPLOAD_DEBOUNCE_MS = 400;
const UPLOAD_RETRY_MS = 4_000;

type QueuedAttachment = {
  companyId: string;
  localId: string;
  docPath?: string;
  field?: string;
  storagePathPrefix?: string;
  fileName?: string;
  contentType?: string;
};

const queuedAttachments = new Map<string, QueuedAttachment>();
const pendingFlushByCompany = new Map<string, ReturnType<typeof setTimeout>>();
const retryFlushByCompany = new Map<string, ReturnType<typeof setTimeout>>();

function queueKey(companyId: string, localId: string): string {
  return `${companyId}::${localId}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((ab) => {
    const bytes = new Uint8Array(ab);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  });
}

/** Server PC: shareable source company — bytes already on this device. */
async function shouldSkipPlServerAttachmentUploadAsHost(companyId: string): Promise<boolean> {
  if (isPlRemoteServerClientMode()) return false;
  if (typeof window === "undefined" || !isLocalAppServerHost()) return false;
  if (typeof window.__plListShareableLocalCompanies !== "function") return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
    const reg = await getLocalCompanyById(id, { includeDeleted: true });
    if (!reg || !isLocalServerShareableCompany(reg)) return false;
    if (isServerGateCompany(reg)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function shouldEnqueuePlServerAttachmentUpload(companyId: string): Promise<boolean> {
  if (typeof window === "undefined" || !shouldFetchPlServerAccessContext()) return false;
  if (isPlRemoteServerClientMode()) return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  if (await shouldSkipPlServerAttachmentUploadAsHost(id)) return false;
  const transport = resolvePlServerMirrorTransport(id);
  if (!transport) return false;
  if (!transport.gateAllowed && !transport.unlockedLocally) return false;
  return true;
}

function scheduleAttachmentUploadFlush(companyId: string): void {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  const prev = pendingFlushByCompany.get(cid);
  if (prev) clearTimeout(prev);
  pendingFlushByCompany.set(
    cid,
    setTimeout(() => {
      pendingFlushByCompany.delete(cid);
      void flushPlServerAttachmentUploadQueue(cid);
    }, UPLOAD_DEBOUNCE_MS)
  );
}

function scheduleAttachmentUploadRetry(companyId: string): void {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  if (retryFlushByCompany.has(cid)) return;
  retryFlushByCompany.set(
    cid,
    setTimeout(() => {
      retryFlushByCompany.delete(cid);
      void flushPlServerAttachmentUploadQueue(cid);
    }, UPLOAD_RETRY_MS)
  );
}

/** Generic enqueue — call after successful `putPendingFile()` (not from voucher JSON scan). */
export function enqueuePlServerAttachmentUpload(payload: PendingFilePayload): void {
  void (async () => {
    const localId = String(payload.id || "").trim();
    if (!localId) return;
    const companyId = resolvePendingPayloadCompanyId(payload);
    if (!companyId) return;
    if (!(await shouldEnqueuePlServerAttachmentUpload(companyId))) return;
    queuedAttachments.set(queueKey(companyId, localId), {
      companyId,
      localId,
      docPath: payload.docPath,
      field: payload.field,
      storagePathPrefix: payload.storagePathPrefix,
      fileName: payload.fileName,
      contentType: payload.contentType || payload.blob?.type || "application/octet-stream",
    });
    scheduleAttachmentUploadFlush(companyId);
  })();
}

async function flushPlServerAttachmentUploadQueue(companyId: string): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  if (!(await shouldEnqueuePlServerAttachmentUpload(cid))) return;
  const transport = resolvePlServerMirrorTransport(cid);
  if (!transport) return;

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_attachment`;
  const keysForCompany = [...queuedAttachments.entries()]
    .filter(([key]) => key.startsWith(`${cid}::`))
    .map(([key]) => key);

  let hadFailure = false;

  for (const key of keysForCompany) {
    const item = queuedAttachments.get(key);
    if (!item) continue;
    const pending = await getPendingPayloadForLocalRef(`${LOCAL_FILE_PREFIX}${item.localId}`);
    if (!pending?.blob || pending.blob.size <= 0) {
      hadFailure = true;
      continue;
    }
    let base64 = "";
    let sha256Hex = "";
    try {
      base64 = await blobToBase64(pending.blob);
      sha256Hex = await computeSha256HexFromBlob(pending.blob);
    } catch {
      hadFailure = true;
      continue;
    }
    try {
      const { status, body } = await gateHttpPost(url, transport.accessToken, {
        companyId: cid,
        id: item.localId,
        base64,
        sha256Hex,
        contentType: item.contentType || pending.contentType || pending.blob.type || "application/octet-stream",
        fileName: item.fileName || pending.fileName || item.localId,
        storagePathPrefix: item.storagePathPrefix || pending.storagePathPrefix,
        docPath: item.docPath || pending.docPath,
        field: item.field || pending.field,
      });
      if (!status || status >= 400) {
        console.warn("[plServerAttachmentUpload] upload failed", {
          companyId: cid,
          localId: item.localId,
          status,
          body: String(body || "").slice(0, 200),
        });
        hadFailure = true;
        continue;
      }
      let parsed: { ok?: boolean; error?: string; deduped?: boolean } = {};
      const trimmed = String(body || "").trim();
      if (trimmed) {
        try {
          parsed = JSON.parse(trimmed) as typeof parsed;
        } catch {
          parsed = {};
        }
      }
      if (parsed.ok === false) {
        console.warn("[plServerAttachmentUpload] upload rejected", {
          companyId: cid,
          localId: item.localId,
          error: parsed.error,
        });
        hadFailure = true;
        continue;
      }
      queuedAttachments.delete(key);
    } catch (e) {
      console.warn("[plServerAttachmentUpload] upload network error", {
        companyId: cid,
        localId: item.localId,
        error: e instanceof Error ? e.message : String(e),
      });
      hadFailure = true;
    }
  }

  if (hadFailure) scheduleAttachmentUploadRetry(cid);
}

export function isPlServerAttachmentUploadPending(companyId: string, localId: string): boolean {
  return queuedAttachments.has(queueKey(String(companyId || "").trim(), String(localId || "").trim()));
}

/** Dev / tests: force flush without debounce. */
export async function flushPlServerAttachmentUploadQueueNow(companyId: string): Promise<void> {
  await flushPlServerAttachmentUploadQueue(String(companyId || "").trim());
}

export function localRefFromPendingId(localId: string): string {
  return `${LOCAL_FILE_PREFIX}${String(localId || "").trim()}`;
}

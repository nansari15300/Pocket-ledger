"use client";

import { gateHttpPost } from "@/lib/gates/gateServerFetch";
import { shouldFetchPlServerAccessContext } from "@/lib/plServerAccessContext";
import {
  LOCAL_FILE_PREFIX,
  getPendingPayloadForLocalRef,
  resolvePendingPayloadCompanyId,
  type PendingFilePayload,
} from "@/lib/localPendingFiles";
import { computeSha256HexFromBytes } from "@/lib/security/sha256Hex";
import { resolvePlServerDeltaTransport } from "@/lib/plServerClientDeltaSync";
import { resolvePlServerHostLoopbackTransport } from "@/lib/plServerHostDeltaPublish";

const UPLOAD_DEBOUNCE_MS = 400;
const UPLOAD_RETRY_MS = 4_000;
/** Base timeout — chhote files; bade files size se scale (pehle 15s → pl_server_post_timeout → voucher host pe nahi jata). */
const UPLOAD_SAVE_TIMEOUT_MIN_MS = 60_000;
const UPLOAD_SAVE_TIMEOUT_MAX_MS = 180_000;

function attachmentUploadTimeoutMs(byteLength: number): number {
  const n = Number.isFinite(byteLength) ? Math.max(0, byteLength) : 0;
  // ~40 KB/s floor + 60s headroom for encode/bridge
  const scaled = UPLOAD_SAVE_TIMEOUT_MIN_MS + Math.ceil(n / 40_000) * 1000;
  return Math.min(UPLOAD_SAVE_TIMEOUT_MAX_MS, scaled);
}

type QueuedAttachment = {
  companyId: string;
  localId: string;
  docPath?: string;
  field?: string;
  storagePathPrefix?: string;
  fileName?: string;
  contentType?: string;
};

type AttachmentUploadTransport = {
  baseUrl: string;
  accessToken: string;
  viaHostLoopback: boolean;
};

export type PlServerAttachmentUploadFlushResult = {
  ok: boolean;
  uploaded: number;
  failed: number;
  missingBytes: number;
  pending: number;
  error?: string;
};

const queuedAttachments = new Map<string, QueuedAttachment>();
const pendingFlushByCompany = new Map<string, ReturnType<typeof setTimeout>>();
const retryFlushByCompany = new Map<string, ReturnType<typeof setTimeout>>();

function queueKey(companyId: string, localId: string): string {
  return `${companyId}::${localId}`;
}

function arrayBufferToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Host main window → loopback bridge storage; staff → active gate URL. */
async function resolvePlServerAttachmentUploadTransport(
  companyId: string
): Promise<AttachmentUploadTransport | null> {
  const id = String(companyId || "").trim();
  if (!id) return null;

  const hostLoopback = await resolvePlServerHostLoopbackTransport(id);
  if (hostLoopback) {
    return { ...hostLoopback, viaHostLoopback: true };
  }

  if (!shouldFetchPlServerAccessContext()) return null;
  const transport = resolvePlServerDeltaTransport(id);
  if (!transport) return null;
  let gateOk = transport.gateAllowed || transport.unlockedLocally;
  if (!gateOk) {
    try {
      const { getLocalCompanyById } = await import("@/lib/localCompanyStore");
      const { isServerGateCompany } = await import("@/lib/companyStorageKind");
      const row = await getLocalCompanyById(id, { includeDeleted: true });
      if (row && isServerGateCompany(row)) gateOk = true;
    } catch {
      /* keep */
    }
  }
  if (!gateOk) return null;
  return {
    baseUrl: transport.baseUrl,
    accessToken: transport.accessToken,
    viaHostLoopback: false,
  };
}

export async function shouldEnqueuePlServerAttachmentUpload(companyId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  return (await resolvePlServerAttachmentUploadTransport(id)) != null;
}

/**
 * Party/master rule: stage (`putPendingFile`) ke baad `/__pl_attachment` race-budget flush,
 * phir SQLite/doc sync — pehle bytes, baad me JSON tip.
 */
export async function flushPlServerAttachmentsAfterStagingBudgeted(
  companyId: string,
  options?: { localIds?: readonly string[]; budgetMs?: number }
): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  if (!(await shouldEnqueuePlServerAttachmentUpload(cid))) return;
  const budgetMs = Math.max(1_000, Number(options?.budgetMs ?? 20_000) || 20_000);
  await Promise.race([
    flushPlServerAttachmentUploadQueueNow(cid, { localIds: options?.localIds }),
    new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
  ]);
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
    // docPath kabhi host/authoritative id rakhta hai; queue key staff local SQLite company id se match hona chahiye.
    const { resolveRegistryCompanyIdForPendingItem } = await import("@/lib/localPendingFiles");
    const companyId =
      (await resolveRegistryCompanyIdForPendingItem(payload)) ||
      resolvePendingPayloadCompanyId(payload);
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

function normalizeLocalIdSet(localIds?: readonly string[]): Set<string> | null {
  if (!localIds?.length) return null;
  const out = new Set<string>();
  for (const id of localIds) {
    const s = String(id || "").trim();
    if (s) out.add(s);
  }
  return out.size > 0 ? out : null;
}

function countQueuedAttachmentsForCompany(companyId: string, localIds?: readonly string[]): number {
  const cid = String(companyId || "").trim();
  if (!cid) return 0;
  const allowed = normalizeLocalIdSet(localIds);
  return [...queuedAttachments.entries()].filter(
    ([key, item]) => key.startsWith(`${cid}::`) && (!allowed || allowed.has(item.localId))
  ).length;
}

function buildFlushFailureError(result: PlServerAttachmentUploadFlushResult): Error {
  return new Error(
    result.error ||
      `PL server attachment upload failed (${result.failed} failed, ${result.pending} pending).`
  );
}

async function flushPlServerAttachmentUploadQueue(
  companyId: string,
  options?: { throwOnFailure?: boolean; localIds?: readonly string[] }
): Promise<PlServerAttachmentUploadFlushResult> {
  const cid = String(companyId || "").trim();
  if (!cid) return { ok: true, uploaded: 0, failed: 0, missingBytes: 0, pending: 0 };
  const allowed = normalizeLocalIdSet(options?.localIds);
  const keysForCompany = [...queuedAttachments.entries()]
    .filter(([key, item]) => key.startsWith(`${cid}::`) && (!allowed || allowed.has(item.localId)))
    .map(([key]) => key);
  if (keysForCompany.length === 0) {
    return { ok: true, uploaded: 0, failed: 0, missingBytes: 0, pending: 0 };
  }

  const transport = await resolvePlServerAttachmentUploadTransport(cid);
  if (!transport) {
    scheduleAttachmentUploadRetry(cid);
    const result: PlServerAttachmentUploadFlushResult = {
      ok: false,
      uploaded: 0,
      failed: keysForCompany.length,
      missingBytes: 0,
      pending: keysForCompany.length,
      error: "attachment_upload_transport_unavailable",
    };
    if (options?.throwOnFailure) throw buildFlushFailureError(result);
    return result;
  }

  const url = `${transport.baseUrl.replace(/\/$/, "")}/__pl_attachment`;
  const { resolvePlServerHostCompanyId } = await import("@/lib/plServerHostCompanyId");
  const hostCompanyId = (await resolvePlServerHostCompanyId(cid)) || cid;

  let hadFailure = false;
  let uploaded = 0;
  let failed = 0;
  let missingBytes = 0;
  let lastError = "";

  for (const key of keysForCompany) {
    const item = queuedAttachments.get(key);
    if (!item) continue;
    const pending = await getPendingPayloadForLocalRef(`${LOCAL_FILE_PREFIX}${item.localId}`);
    if (!pending?.blob || pending.blob.size <= 0) {
      hadFailure = true;
      failed += 1;
      missingBytes += 1;
      lastError = "attachment_bytes_missing";
      continue;
    }
    let base64 = "";
    let sha256Hex = "";
    try {
      const ab = await pending.blob.arrayBuffer();
      [base64, sha256Hex] = await Promise.all([
        Promise.resolve(arrayBufferToBase64(ab)),
        computeSha256HexFromBytes(ab),
      ]);
    } catch {
      hadFailure = true;
      failed += 1;
      lastError = "attachment_encode_failed";
      continue;
    }
    try {
      const { status, body } = await gateHttpPost(url, transport.accessToken, {
        companyId: hostCompanyId,
        id: item.localId,
        base64,
        sha256Hex,
        contentType: item.contentType || pending.contentType || pending.blob.type || "application/octet-stream",
        fileName: item.fileName || pending.fileName || item.localId,
        storagePathPrefix: item.storagePathPrefix || pending.storagePathPrefix,
        docPath: item.docPath || pending.docPath,
        field: item.field || pending.field,
      }, { timeoutMs: attachmentUploadTimeoutMs(pending.blob.size) });
      if (!status || status >= 400) {
        console.warn("[plServerAttachmentUpload] upload failed", {
          companyId: cid,
          localId: item.localId,
          viaHostLoopback: transport.viaHostLoopback,
          status,
          body: String(body || "").slice(0, 200),
        });
        hadFailure = true;
        failed += 1;
        lastError = body || `HTTP ${status || 0}`;
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
          viaHostLoopback: transport.viaHostLoopback,
          error: parsed.error,
        });
        hadFailure = true;
        failed += 1;
        lastError = parsed.error || "attachment_upload_rejected";
        continue;
      }
      queuedAttachments.delete(key);
      uploaded += 1;
      const localRef = localRefFromPendingId(item.localId);
      // Pehle 404 mila tha to negative cache hata do — bytes ab host par hain.
      void import("@/lib/plServerAttachmentFetch").then((m) =>
        m.clearPlServerAttachmentMissCache(item.localId)
      );
      void import("@/lib/offlineAttachmentUrlCache").then(async (m) => {
        await m.seedOfflineAttachmentCacheFromBlob(localRef, pending.blob);
      });
      void import("@/lib/attachmentLoadReady").then((m) => {
        m.markAttachmentUrlReady(localRef);
        m.requestAttachmentUiRefresh();
      });
    } catch (e) {
      console.warn("[plServerAttachmentUpload] upload network error", {
        companyId: cid,
        localId: item.localId,
        viaHostLoopback: transport.viaHostLoopback,
        error: e instanceof Error ? e.message : String(e),
      });
      hadFailure = true;
      failed += 1;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  if (hadFailure) scheduleAttachmentUploadRetry(cid);
  const pending = countQueuedAttachmentsForCompany(cid, options?.localIds);
  const result: PlServerAttachmentUploadFlushResult = {
    ok: !hadFailure && pending === 0,
    uploaded,
    failed,
    missingBytes,
    pending,
    error: hadFailure ? lastError || "attachment_upload_failed" : undefined,
  };
  if (options?.throwOnFailure && !result.ok) throw buildFlushFailureError(result);
  return result;
}

export function isPlServerAttachmentUploadPending(companyId: string, localId: string): boolean {
  return queuedAttachments.has(queueKey(String(companyId || "").trim(), String(localId || "").trim()));
}

/** Edit-remove: queued host uploads for dropped `local:` ids mat chalao (warna file wapas aa jati hai). */
export function cancelPlServerAttachmentUploads(
  companyId: string,
  localIds: readonly string[]
): void {
  const cid = String(companyId || "").trim();
  if (!cid || !localIds?.length) return;
  for (const raw of localIds) {
    const localId = String(raw || "").trim();
    if (!localId) continue;
    queuedAttachments.delete(queueKey(cid, localId));
  }
}

/** Save path: debounce/retry cancel karke turant server par bytes push. */
export async function flushPlServerAttachmentUploadQueueNow(
  companyId: string,
  options?: { throwOnFailure?: boolean; localIds?: readonly string[] }
): Promise<PlServerAttachmentUploadFlushResult> {
  const cid = String(companyId || "").trim();
  if (!cid) return { ok: true, uploaded: 0, failed: 0, missingBytes: 0, pending: 0 };
  const pendingTimer = pendingFlushByCompany.get(cid);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingFlushByCompany.delete(cid);
  }
  const retryTimer = retryFlushByCompany.get(cid);
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryFlushByCompany.delete(cid);
  }
  return flushPlServerAttachmentUploadQueue(cid, options);
}

export function localRefFromPendingId(localId: string): string {
  return `${LOCAL_FILE_PREFIX}${String(localId || "").trim()}`;
}

function localIdFromAttachmentRef(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed.startsWith(LOCAL_FILE_PREFIX)) return null;
  const id = trimmed.slice(LOCAL_FILE_PREFIX.length).trim();
  return id || null;
}

async function listLocalAttachmentRefsInRecord(record: Record<string, unknown>): Promise<string[]> {
  const { getVoucherAttachmentUrlsForUi } = await import("@/lib/voucherAttachmentNormalize");
  const { listLocalAttachmentRefsInEntityRecord } = await import("@/lib/entityProfileLocalFiles");
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const ref = raw.trim();
    if (!localIdFromAttachmentRef(ref)) return;
    seen.add(ref);
  };
  for (const ref of getVoucherAttachmentUrlsForUi(record)) push(ref);
  for (const ref of listLocalAttachmentRefsInEntityRecord(record)) push(ref);
  return [...seen];
}

export async function listLocalAttachmentIdsInRecord(record: Record<string, unknown>): Promise<string[]> {
  const seen = new Set<string>();
  for (const ref of await listLocalAttachmentRefsInRecord(record)) {
    const id = localIdFromAttachmentRef(ref);
    if (id) seen.add(id);
  }
  return [...seen];
}

async function localRefHasPendingBytes(localRef: string): Promise<boolean> {
  const localId = localIdFromAttachmentRef(localRef);
  if (!localId) return false;
  const pending = await getPendingPayloadForLocalRef(`${LOCAL_FILE_PREFIX}${localId}`);
  return Boolean(pending?.blob && pending.blob.size > 0);
}

/**
 * Direct PL/host write guard: record me `local:` refs tabhi authoritative doc me jaane do
 * jab bytes queue/host par confirmed hon. Warna server doc preview corrupt ho jata hai.
 */
export async function flushPlServerAttachmentsForRecordBeforeAuthoritativeSave(
  companyId: string,
  record: Record<string, unknown>,
  options?: { throwOnFailure?: boolean }
): Promise<PlServerAttachmentUploadFlushResult> {
  const cid = String(companyId || "").trim();
  if (!cid) return { ok: true, uploaded: 0, failed: 0, missingBytes: 0, pending: 0 };
  const refs = await listLocalAttachmentRefsInRecord(record);
  if (refs.length === 0) return { ok: true, uploaded: 0, failed: 0, missingBytes: 0, pending: 0 };

  const localIds = await listLocalAttachmentIdsInRecord(record);
  if (!(await shouldEnqueuePlServerAttachmentUpload(cid))) {
    const result: PlServerAttachmentUploadFlushResult = {
      ok: false,
      uploaded: 0,
      failed: refs.length,
      missingBytes: 0,
      pending: refs.length,
      error: "attachment_upload_transport_unavailable",
    };
    if (options?.throwOnFailure) throw buildFlushFailureError(result);
    return result;
  }

  await ensurePlServerAttachmentsQueuedFromRecord(cid, record);

  // Device pe jinke bytes nahi + queue me bhi nahi — Host GET (25s) se Save mat atkao.
  const uploadableIds: string[] = [];
  for (const id of localIds) {
    if (await localRefHasPendingBytes(localRefFromPendingId(id))) uploadableIds.push(id);
  }
  if (uploadableIds.length === 0) {
    const result: PlServerAttachmentUploadFlushResult = {
      ok: true,
      uploaded: 0,
      failed: 0,
      missingBytes: localIds.length,
      pending: 0,
    };
    return result;
  }

  return flushPlServerAttachmentUploadQueueNow(cid, {
    throwOnFailure: options?.throwOnFailure,
    localIds: uploadableIds,
  });
}

async function queueLocalRefIfPending(companyId: string, localRef: string): Promise<void> {
  const cid = String(companyId || "").trim();
  const localId = localIdFromAttachmentRef(localRef);
  if (!cid || !localId) return;
  const key = queueKey(cid, localId);
  if (queuedAttachments.has(key)) return;
  const pending = await getPendingPayloadForLocalRef(`${LOCAL_FILE_PREFIX}${localId}`);
  if (!pending?.blob || pending.blob.size <= 0) return;
  queuedAttachments.set(key, {
    companyId: cid,
    localId,
    fileName: pending.fileName,
    contentType: pending.contentType || pending.blob.type || "application/octet-stream",
    docPath: pending.docPath,
    field: pending.field,
    storagePathPrefix: pending.storagePathPrefix,
  });
}

/** Save/flush se pehle: payload ke `local:` refs queue me hon (enqueue race — receipt bytes miss). */
export async function ensurePlServerAttachmentsQueuedFromRecord(
  companyId: string,
  record: Record<string, unknown>
): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  if (!(await shouldEnqueuePlServerAttachmentUpload(cid))) return;
  const seen = new Set<string>();
  const queueRef = async (localRef: string) => {
    const id = localIdFromAttachmentRef(localRef);
    if (!id || seen.has(id)) return;
    seen.add(id);
    await queueLocalRefIfPending(cid, localRef);
  };
  for (const ref of await listLocalAttachmentRefsInRecord(record)) {
    await queueRef(ref);
  }
}

/** Host main window: saved attachments (vouchers + masters) ko bridge storage me mirror (staff GET fix). */
export async function backfillPlServerHostAttachmentsToBridge(): Promise<void> {
  if (typeof window === "undefined") return;
  const { isLocalAppServerHost } = await import("@/lib/localAppServerDevPreview");
  const { isCanonicalServerBridgeRenderer } = await import("@/lib/hostBridgeWrite");
  if (!isLocalAppServerHost() || isCanonicalServerBridgeRenderer()) return;

  const { listLocalCompanies } = await import("@/lib/localCompanyStore");
  const { isLocalServerShareableCompany } = await import("@/lib/localServerShareableCompanies");
  const { isServerGateCompany } = await import("@/lib/companyStorageKind");
  const { listCompanyDocsFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
  const { getVoucherAttachmentUrlsForUi } = await import("@/lib/voucherAttachmentNormalize");
  const { listLocalAttachmentRefsInEntityRecord } = await import("@/lib/entityProfileLocalFiles");

  const MASTER_COLLECTIONS = [
    "parties",
    "bank_accounts",
    "staff",
    "items",
    "taxes",
    "expense_accounts",
  ] as const;

  const companies = await listLocalCompanies();
  for (const row of companies) {
    const cid = String(row.id || "").trim();
    if (!cid || !isLocalServerShareableCompany(row) || isServerGateCompany(row)) continue;
    if (!(await resolvePlServerHostLoopbackTransport(cid))) continue;

    const seen = new Set<string>();

    const queueRef = async (localRef: string) => {
      const localId = localIdFromAttachmentRef(localRef);
      if (!localId || seen.has(localId)) return;
      seen.add(localId);
      const pending = await getPendingPayloadForLocalRef(`${LOCAL_FILE_PREFIX}${localId}`);
      if (!pending?.blob || pending.blob.size <= 0) return;
      queuedAttachments.set(queueKey(cid, localId), {
        companyId: cid,
        localId,
        fileName: pending.fileName,
        contentType: pending.contentType || pending.blob.type || "application/octet-stream",
        docPath: pending.docPath,
        field: pending.field,
        storagePathPrefix: pending.storagePathPrefix,
      });
    };

    const vouchers = await listCompanyDocsFromBrowserDb(cid, "vouchers", { forBackupMerge: true }).catch(
      () => [] as Array<Record<string, unknown>>
    );
    for (const voucher of vouchers) {
      for (const url of getVoucherAttachmentUrlsForUi(voucher)) {
        await queueRef(url);
      }
    }

    for (const col of MASTER_COLLECTIONS) {
      const rows = await listCompanyDocsFromBrowserDb(cid, col, { forBackupMerge: true }).catch(
        () => [] as Array<Record<string, unknown>>
      );
      for (const doc of rows) {
        for (const ref of listLocalAttachmentRefsInEntityRecord(doc)) {
          await queueRef(ref);
        }
      }
    }

    if (seen.size > 0) {
      await flushPlServerAttachmentUploadQueueNow(cid);
    }
  }
}

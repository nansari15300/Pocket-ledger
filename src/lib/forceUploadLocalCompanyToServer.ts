"use client";

/**
 * Company Profile — force upload: SQLite mirror + pending attachments deep scan → Firestore/Storage.
 */

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS } from "@/lib/firestoreToLocalCompanyPull";
import {
  deserializeLocalDbValue,
  listCompanyDocRawRowsWithLocalRefHint,
} from "@/lib/localCompanyDocMirror";
import { pushAllLocalCompanyDocsToFirestore } from "@/lib/migrateLocalCompanySubcollectionsToFirestore";
import {
  canSyncCompanyToServer,
  flushVoucherOutbox,
} from "@/lib/localVoucherOutbox";
import {
  getBlobFromLocalFileRef,
  getLocalFileRefMeta,
  getPendingFiles,
  isLocalFileRef,
  isValidPendingSubcollectionDocPath,
  listPendingFilesForCompany,
  LOCAL_FILE_PREFIX,
  putPendingFile,
  syncPendingFilesForCompany,
} from "@/lib/localPendingFiles";
import { syncPendingMasterMutations } from "@/lib/localPendingMasters";
import { syncPendingVoucherMutations } from "@/lib/localPendingVouchers";
import { resolveAuthoritativeFirestoreCompanyId } from "@/lib/resolveAuthoritativeFirestoreCompanyId";
import { flushPendingBrowserDbSave } from "@/lib/localSqlite";
import { yieldToMain } from "@/lib/yieldToMain";

export type ForceUploadProgress = {
  phase: string;
  done: number;
  total: number;
  detail?: string;
};

export type ForceUploadMode = "full" | "docsOnly" | "filesOnly";

export type ForceUploadLocalCompanyResult = {
  ok: boolean;
  message?: string;
  docsPushed: number;
  outboxFlushed: number;
  outboxFailed: number;
  filesSynced: number;
  filesFailed: number;
  localRefsFound: number;
  localRefsRequeued: number;
  localRefsMissingBytes: number;
  pendingMastersSynced: number;
  pendingMastersFailed: number;
  pendingVouchersSynced: number;
  pendingVouchersFailed: number;
  errors: string[];
};

type LocalRefHit = {
  localId: string;
  docPath: string;
  field: string;
  storagePathPrefix: string;
  fileName?: string;
};

function inferStoragePathPrefix(
  collectionName: string,
  doc: Record<string, unknown>,
  fsCompanyId: string,
  fieldKey: string
): string {
  if (collectionName === "vouchers") {
    const voucherType = String(doc.type || "journal").trim() || "journal";
    return `voucher-files/${fsCompanyId}/${voucherType}`;
  }
  if (["parties", "bank_accounts", "staff", "taxes", "expense_accounts", "items"].includes(collectionName)) {
    const seg = collectionName.replace(/_/g, "-");
    const sub = fieldKey === "fileUrl" || fieldKey === "avatarUrl" || fieldKey === "logoUrl" ? "avatar" : "documents";
    return `companies/${fsCompanyId}/${seg}-files/${sub}`;
  }
  if (fieldKey === "logoUrl") {
    return `companies/${fsCompanyId}/logo`;
  }
  return `companies/${fsCompanyId}/attachments`;
}

function scrapeLocalRefsFromValue(
  value: unknown,
  fieldKey: string,
  docPath: string,
  collectionName: string,
  doc: Record<string, unknown>,
  fsCompanyId: string,
  out: LocalRefHit[],
  depth: number
): void {
  if (depth > 24) return;
  if (typeof value === "string" && isLocalFileRef(value)) {
    const localId = value.slice(LOCAL_FILE_PREFIX.length).trim();
    if (!localId) return;
    out.push({
      localId,
      docPath,
      field: fieldKey,
      storagePathPrefix: inferStoragePathPrefix(collectionName, doc, fsCompanyId, fieldKey),
    });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      scrapeLocalRefsFromValue(item, fieldKey, docPath, collectionName, doc, fsCompanyId, out, depth + 1);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      scrapeLocalRefsFromValue(v, k, docPath, collectionName, doc, fsCompanyId, out, depth + 1);
    }
  }
}

async function collectLocalRefsFromSqlite(
  localCompanyId: string,
  fsCompanyId: string
): Promise<LocalRefHit[]> {
  const hits: LocalRefHit[] = [];
  const seenDoc = new Set<string>();

  for (const collectionName of COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS) {
    await yieldToMain();
    const rawRows = await listCompanyDocRawRowsWithLocalRefHint(localCompanyId, fsCompanyId, collectionName);
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      const docId = String(row.id ?? "").trim();
      if (!docId) continue;
      const docPath = `companies/${fsCompanyId}/${collectionName}/${docId}`;
      if (seenDoc.has(docPath)) continue;
      seenDoc.add(docPath);
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        const data = deserializeLocalDbValue(parsed) as Record<string, unknown>;
        for (const [k, v] of Object.entries(data)) {
          if (k === "id") continue;
          scrapeLocalRefsFromValue(v, k, docPath, collectionName, data, fsCompanyId, hits, 0);
        }
      } catch {
        /* corrupt row */
      }
      if (i > 0 && i % 20 === 0) await yieldToMain();
    }
  }
  return hits;
}

async function requeueLocalAttachmentRefs(
  hits: LocalRefHit[],
  pendingIds: Set<string>
): Promise<{ requeued: number; missingBytes: number }> {
  let requeued = 0;
  let missingBytes = 0;
  const seen = new Set<string>();

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    if (seen.has(hit.localId)) continue;
    seen.add(hit.localId);

    const ref = `${LOCAL_FILE_PREFIX}${hit.localId}`;
    const meta = await getLocalFileRefMeta(ref);
    const blob = await getBlobFromLocalFileRef(ref);
    if (!blob || blob.size <= 0) {
      missingBytes++;
      continue;
    }

    const alreadyQueued = pendingIds.has(hit.localId);
    const docPath = isValidPendingSubcollectionDocPath(hit.docPath)
      ? hit.docPath
      : isValidPendingSubcollectionDocPath(meta?.docPath || "")
        ? String(meta?.docPath)
        : hit.docPath;
    const cidFromPath = /^companies\/([^/]+)\//.exec(hit.docPath)?.[1] || "unknown";
    await putPendingFile({
      id: hit.localId,
      blob,
      contentType: meta?.contentType || blob.type || "application/octet-stream",
      docPath,
      field: hit.field || meta?.field || "fileUrls",
      storagePathPrefix:
        hit.storagePathPrefix || meta?.storagePathPrefix || `companies/${cidFromPath}/attachments`,
      fileName: meta?.fileName || hit.fileName,
    });
    if (!alreadyQueued) requeued++;
    pendingIds.add(hit.localId);
    if (i > 0 && i % 5 === 0) await yieldToMain();
  }

  return { requeued, missingBytes };
}

async function flushOutboxUntilIdle(maxRounds = 8): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const { getBrowserDbForNamespace } = await import("@/lib/localSqlite");
  const { SQLITE_STORAGE_NAMESPACES } = await import("@/lib/sqliteStorageNamespace");
  for (let i = 0; i < maxRounds; i++) {
    let count = 0;
    for (const ns of SQLITE_STORAGE_NAMESPACES) {
      const db = await getBrowserDbForNamespace(ns);
      const pending = db?.prepare(`SELECT COUNT(*) AS c FROM sync_outbox`).get() as { c?: number } | undefined;
      count += Number(pending?.c ?? 0);
    }
    if (!count) break;
    const round = await flushVoucherOutbox();
    ok += round.ok;
    failed += round.failed;
    if (round.ok === 0 && round.failed === 0) break;
  }
  return { ok, failed };
}

async function syncCompanyFilesUntilIdle(
  companyId: string,
  maxRounds = 6,
  onProgress?: (done: number, total: number, detail?: string) => void
): Promise<{ synced: number; failed: number; lastError?: string }> {
  let synced = 0;
  let failed = 0;
  let lastError: string | undefined;
  let cumulativeDone = 0;
  const initialTotal = Math.max(1, (await listPendingFilesForCompany(companyId)).length);
  for (let i = 0; i < maxRounds; i++) {
    const remaining = await listPendingFilesForCompany(companyId);
    if (!remaining.length) break;
    const total = Math.max(initialTotal, remaining.length, synced + remaining.length);
    const round = await syncPendingFilesForCompany(companyId, {
      onProgress: (done, _total, fileName) => {
        onProgress?.(cumulativeDone + done, total, fileName);
      },
    });
    cumulativeDone += round.synced + round.failed;
    synced += round.synced;
    failed += round.failed;
    if (round.lastError) lastError = round.lastError;
    onProgress?.(cumulativeDone, total);
    if (round.synced === 0 && round.failed === 0) break;
    await yieldToMain();
  }
  return { synced, failed, lastError };
}

/**
 * Deep scan local SQLite + pending file store; push unsynced ledger rows and attachments to server.
 */
export async function forceUploadLocalCompanyToServer(
  localCompanyId: string,
  options?: {
    mode?: ForceUploadMode;
    onProgress?: (p: ForceUploadProgress) => void;
    /** Restore resume: cumulative progress offset (files already uploaded). */
    progressBaseline?: number;
    /** Restore resume: fixed total file count across tabs. */
    progressTotal?: number;
  }
): Promise<ForceUploadLocalCompanyResult> {
  const mode = options?.mode ?? "full";
  const onProgress = options?.onProgress;
  const progressBaseline = Math.max(0, options?.progressBaseline ?? 0);
  const progressTotalFixed = options?.progressTotal;
  const report = (phase: string, done: number, total: number, detail?: string) => {
    const cumulativeDone = progressBaseline + done;
    const cumulativeTotal = Math.max(total, progressTotalFixed ?? total, cumulativeDone);
    onProgress?.({ phase, done: cumulativeDone, total: cumulativeTotal, detail });
  };
  const cid = String(localCompanyId || "").trim();
  const empty: ForceUploadLocalCompanyResult = {
    ok: false,
    docsPushed: 0,
    outboxFlushed: 0,
    outboxFailed: 0,
    filesSynced: 0,
    filesFailed: 0,
    localRefsFound: 0,
    localRefsRequeued: 0,
    localRefsMissingBytes: 0,
    pendingMastersSynced: 0,
    pendingMastersFailed: 0,
    pendingVouchersSynced: 0,
    pendingVouchersFailed: 0,
    errors: [],
  };
  if (!cid) {
    return { ...empty, message: "No company selected." };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ...empty, message: "You are offline. Connect to the internet and try again." };
  }
  if (!(await canSyncCompanyToServer(cid))) {
    return {
      ...empty,
      message: "This company is device-only (not configured for cloud sync).",
    };
  }

  const fsCompanyId = await resolveAuthoritativeFirestoreCompanyId(cid);
  const companyRef = doc(firestore, "companies", fsCompanyId);
  const companySnap = await getDoc(companyRef);
  if (!companySnap.exists() && mode !== "docsOnly") {
    return {
      ...empty,
      message: "Company is not on the server yet. Wait for initial sync or use Upload to cloud first.",
    };
  }

  const errors: string[] = [];

  let localRefs: LocalRefHit[] = [];
  let requeued = 0;
  let missingBytes = 0;
  if (mode !== "docsOnly") {
    localRefs = await collectLocalRefsFromSqlite(cid, fsCompanyId);
    await yieldToMain();
    const pending = await getPendingFiles();
    const pendingIds = new Set(pending.map((p) => p.id));
    const rq = await requeueLocalAttachmentRefs(localRefs, pendingIds);
    requeued = rq.requeued;
    missingBytes = rq.missingBytes;
    await yieldToMain();
  }

  let fileRound1: { synced: number; failed: number; lastError?: string } = { synced: 0, failed: 0 };
  if (mode !== "docsOnly") {
    const pendingTotal = Math.max(1, (await listPendingFilesForCompany(cid)).length, localRefs.length);
    const fileProgress = (done: number, total: number, detail?: string) => {
      report("Uploading attachments", done, Math.max(total, pendingTotal), detail);
    };
    fileProgress(0, pendingTotal);
    fileRound1 = await syncCompanyFilesUntilIdle(cid, 6, fileProgress);
    await yieldToMain();
  }

  let docsPushed = 0;
  if (mode !== "filesOnly") {
    report("Uploading company data", 0, COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS.length);
    try {
      const { pushed, errors: pushErrors } = await pushAllLocalCompanyDocsToFirestore(fsCompanyId, {
        sqliteCompanyId: cid,
        omitLocalFileRefs: true,
        onCollectionProgress: (col, index, total) => {
          report("Uploading company data", index + 1, total, col.replace(/_/g, " "));
        },
      });
      docsPushed += pushed;
      if (pushErrors.length) errors.push(...pushErrors.slice(0, 5));
    } catch (e) {
      errors.push(`Document push: ${e instanceof Error ? e.message : String(e)}`);
    }
    await yieldToMain();
  }

  let outboxFlush = { ok: 0, failed: 0 };
  if (mode !== "filesOnly") {
    outboxFlush = await flushOutboxUntilIdle();
    await yieldToMain();
  }

  let fileRound2: { synced: number; failed: number; lastError?: string } = { synced: 0, failed: 0 };
  let fileRound3: { synced: number; failed: number; lastError?: string } = { synced: 0, failed: 0 };
  if (mode !== "docsOnly") {
    const fileProgress2 = (done: number, total: number, detail?: string) => {
      report(
        "Uploading attachments",
        fileRound1.synced + fileRound1.failed + done,
        Math.max(total, fileRound1.synced + fileRound1.failed + total),
        detail
      );
    };
    fileRound2 = await syncCompanyFilesUntilIdle(cid, 6, fileProgress2);
    await yieldToMain();
  }

  let masterResult = { synced: 0, failed: 0 };
  let voucherResult = { synced: 0, failed: 0 };
  if (mode !== "filesOnly") {
    masterResult = await syncPendingMasterMutations();
    await yieldToMain();
    voucherResult = await syncPendingVoucherMutations();
    await yieldToMain();
  }

  if (mode !== "docsOnly") {
    const baseDone = fileRound1.synced + fileRound1.failed + fileRound2.synced + fileRound2.failed;
    fileRound3 = await syncCompanyFilesUntilIdle(cid, 6, (done, total, detail) => {
      report("Uploading attachments", baseDone + done, Math.max(total, baseDone + total), detail);
    });
  }

  const filesSynced = fileRound1.synced + fileRound2.synced + fileRound3.synced;
  const filesFailed = fileRound1.failed + fileRound2.failed + fileRound3.failed;
  if (fileRound3.lastError || fileRound2.lastError || fileRound1.lastError) {
    errors.push(fileRound3.lastError || fileRound2.lastError || fileRound1.lastError || "");
  }

  const ok =
    errors.length === 0 ||
    docsPushed > 0 ||
    filesSynced > 0 ||
    outboxFlush.ok > 0 ||
    masterResult.synced > 0 ||
    voucherResult.synced > 0;

  return {
    ok,
    message: ok
      ? undefined
      : "Nothing was uploaded. Check internet connection and try again.",
    docsPushed,
    outboxFlushed: outboxFlush.ok,
    outboxFailed: outboxFlush.failed,
    filesSynced,
    filesFailed,
    localRefsFound: localRefs.length,
    localRefsRequeued: requeued,
    localRefsMissingBytes: missingBytes,
    pendingMastersSynced: masterResult.synced,
    pendingMastersFailed: masterResult.failed,
    pendingVouchersSynced: voucherResult.synced,
    pendingVouchersFailed: voucherResult.failed,
    errors: errors.filter(Boolean),
  };
}

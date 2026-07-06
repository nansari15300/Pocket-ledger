"use client";

import { getBrowserDb } from "@/lib/localSqlite";
import { serializeCompanyDocForLocalDb } from "@/lib/localCompanyDocMirror";
import { PL_CLIENT_OFFLINE_FIRST_PERSIST_MS } from "@/lib/localMirrorServerMeta";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { docEditTimeMs, inferCloudSyncActionFromPayload } from "@/lib/localCloudSync/conflict";
import { enqueueLocalCloudSyncOp } from "@/lib/localCloudSync/queue";
import type { CloudSyncAction } from "@/lib/localCloudSync/types";

let applyingRemoteCloudSync = false;

/** Download apply ke dauran re-enqueue loop rokne ke liye. */
export function runWithRemoteCloudSyncApply<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemoteCloudSync = true;
  return fn().finally(() => {
    applyingRemoteCloudSync = false;
  });
}

export function isApplyingRemoteCloudSync(): boolean {
  return applyingRemoteCloudSync;
}

/** Op payload — SQLite jaisa serialize + numeric edit timestamps (Firestore Timestamp / remote merge safe). */
function buildCloudSyncOpPayload(data: Record<string, unknown>, rowId: string): Record<string, unknown> {
  const now = Date.now();
  const editMs = Math.max(docEditTimeMs(data), now);
  const serialized = serializeCompanyDocForLocalDb({ ...data, id: rowId }) as Record<string, unknown>;
  return {
    ...serialized,
    id: rowId,
    updatedAt: editMs,
    lastEditedAt: editMs,
    [PL_CLIENT_OFFLINE_FIRST_PERSIST_MS]: editMs,
  };
}

/** SQLite mirror / writeEntity ke baad — sirf enabled local companies. */
export async function maybeEnqueueLocalCloudSyncFromWrite(input: {
  companyId: string;
  collectionName: string;
  docId: string;
  data: Record<string, unknown>;
  operation?: CloudSyncAction;
}): Promise<void> {
  if (applyingRemoteCloudSync) return;
  const companyId = String(input.companyId || "").trim();
  const rowId = String(input.docId || "").trim();
  const table = String(input.collectionName || "").trim();
  if (!companyId || !table || !rowId) return;
  if (!(await shouldUseLocalCloudSync(companyId))) return;

  const payload = buildCloudSyncOpPayload(input.data, rowId);
  const updatedAt =
    typeof payload.updatedAt === "number" && Number.isFinite(payload.updatedAt) ? payload.updatedAt : Date.now();
  const action = input.operation ?? inferCloudSyncActionFromPayload(payload, "update");

  await enqueueLocalCloudSyncOp({
    companyId,
    table,
    action,
    rowId,
    payload,
    updatedAt,
  });
}

/** Attachment upload ke baad SQLite me `drive:` ref ho aur outbox me abhi `local:` ho — payload refresh. */
export async function refreshPendingCloudSyncOpsFromMirrorAfterAttachments(
  companyId: string
): Promise<void> {
  if (applyingRemoteCloudSync) return;
  const cid = String(companyId || "").trim();
  if (!cid || !(await shouldUseLocalCloudSync(cid))) return;
  const db = await getBrowserDb();
  if (!db) return;
  const pending = db
    .prepare(
      `SELECT table_name, row_id, payload FROM cloud_sync_outbox
       WHERE company_id = ? AND synced_at IS NULL`
    )
    .all(cid) as Array<{ table_name: string; row_id: string; payload: string }>;
  if (!pending.length) return;
  const { getCompanyDocFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
  const { isDriveFileRef } = await import("@/lib/localCloudSync/pocketLedgerDrivePaths");
  const { isLocalFileRef } = await import("@/lib/localPendingFiles");
  for (const row of pending) {
    const table = String(row.table_name || "").trim();
    const rowId = String(row.row_id || "").trim();
    if (!table || !rowId) continue;
    let queued: Record<string, unknown>;
    try {
      queued = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    const mirror = (await getCompanyDocFromBrowserDb(cid, table, rowId)) as Record<string, unknown> | null;
    if (!mirror) continue;
    const mirrorScalar = mirror.fileUrl ?? mirror.avatarUrl;
    const queuedScalar = queued.fileUrl ?? queued.avatarUrl;
    const mirrorNeedsPush =
      (typeof mirrorScalar === "string" &&
        isDriveFileRef(mirrorScalar) &&
        typeof queuedScalar === "string" &&
        isLocalFileRef(queuedScalar)) ||
      mirrorScalar !== queuedScalar;
    if (!mirrorNeedsPush) continue;
    await maybeEnqueueLocalCloudSyncFromWrite({
      companyId: cid,
      collectionName: table,
      docId: rowId,
      data: mirror,
    });
  }
}

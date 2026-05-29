"use client";

import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { enqueueLocalCloudSyncOp } from "@/lib/localCloudSync/queue";
import { inferCloudSyncActionFromPayload } from "@/lib/localCloudSync/conflict";
import type { CloudSyncAction } from "@/lib/localCloudSync/types";
import { CLOUD_SYNC_POKE_EVENT } from "@/lib/localCloudSync/types";
import { flushPendingBrowserDbSave } from "@/lib/localSqlite";

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

function pokeCloudSyncBackground(companyId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOUD_SYNC_POKE_EVENT, { detail: { companyId } }));
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
  if (!companyId) return;
  if (!(await shouldUseLocalCloudSync(companyId))) return;

  const action =
    input.operation ?? inferCloudSyncActionFromPayload(input.data, "update");

  // Edit/master save: hamesha fresh ms taaki doosre device par merge ho (purana Timestamp object mat chipko).
  const fromPayload =
    typeof input.data.updatedAt === "number" && Number.isFinite(input.data.updatedAt)
      ? input.data.updatedAt
      : 0;
  const updatedAt = Math.max(fromPayload, Date.now());
  const dataForQueue = { ...input.data, updatedAt };

  await enqueueLocalCloudSyncOp({
    companyId,
    table: input.collectionName,
    action,
    rowId: input.docId,
    payload: dataForQueue,
    updatedAt,
  });
  await flushPendingBrowserDbSave().catch(() => undefined);
  pokeCloudSyncBackground(companyId);
}

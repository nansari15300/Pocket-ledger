"use client";

import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { enqueueLocalCloudSyncOp } from "@/lib/localCloudSync/queue";
import { inferCloudSyncActionFromPayload } from "@/lib/localCloudSync/conflict";
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

  await enqueueLocalCloudSyncOp({
    companyId,
    table: input.collectionName,
    action,
    rowId: input.docId,
    payload: input.data,
    updatedAt:
      typeof input.data.updatedAt === "number"
        ? input.data.updatedAt
        : Date.now(),
  });
}

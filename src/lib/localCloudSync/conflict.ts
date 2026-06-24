import type { CloudSyncAction, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";

function rowUpdatedAt(payload: Record<string, unknown>): number {
  const v = payload.updatedAt;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Date.parse(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Remote apply se pehle: latest `updatedAt` wins; delete vs update → delete wins. */
export function shouldApplyRemoteCloudSyncOp(
  localDoc: Record<string, unknown> | null,
  remote: LocalCloudSyncOperation
): boolean {
  const remoteTs = rowUpdatedAt(remote.payload);
  const localDeleted = localDoc?.isDeleted === true;
  const remoteDeleted = remote.action === "delete" || remote.payload.isDeleted === true;

  if (remoteDeleted) return true;
  if (localDeleted) return false;

  if (!localDoc) return true;
  const localTs = rowUpdatedAt(localDoc);
  return remoteTs >= localTs;
}

export function mergeRemotePayloadIntoLocal(
  localDoc: Record<string, unknown> | null,
  remote: LocalCloudSyncOperation
): Record<string, unknown> {
  if (remote.action === "delete" || remote.payload.isDeleted === true) {
    return {
      ...(localDoc ?? {}),
      ...remote.payload,
      id: remote.rowId,
      isDeleted: true,
      updatedAt: remote.payload.updatedAt ?? remote.updatedAt,
    };
  }
  return {
    ...(localDoc ?? {}),
    ...remote.payload,
    id: remote.rowId,
    isDeleted: false,
    updatedAt: remote.payload.updatedAt ?? remote.updatedAt,
  };
}

export function inferCloudSyncActionFromPayload(
  payload: Record<string, unknown>,
  fallback: CloudSyncAction = "update"
): CloudSyncAction {
  if (payload.isDeleted === true) return "delete";
  return fallback;
}

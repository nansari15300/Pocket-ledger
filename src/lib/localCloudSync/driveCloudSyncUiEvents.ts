"use client";

import type { CloudSyncRunStatus } from "@/lib/localCloudSync/types";

export const PL_DRIVE_CLOUD_SYNC_STATUS_EVENT = "pl-drive-cloud-sync-status";

export type DriveCloudSyncStatusDetail = {
  companyId: string;
  status: CloudSyncRunStatus;
};

/** Header indicator + settings — sync cycle start/stop par turant UI update. */
export function notifyDriveCloudSyncStatus(companyId: string, status: CloudSyncRunStatus): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  if (!cid) return;
  window.dispatchEvent(
    new CustomEvent<DriveCloudSyncStatusDetail>(PL_DRIVE_CLOUD_SYNC_STATUS_EVENT, {
      detail: { companyId: cid, status },
    })
  );
}

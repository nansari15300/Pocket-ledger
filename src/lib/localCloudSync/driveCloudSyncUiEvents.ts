"use client";

import type { CloudSyncRunStatus } from "@/lib/localCloudSync/types";

export const PL_DRIVE_CLOUD_SYNC_STATUS_EVENT = "pl-drive-cloud-sync-status";
export const PL_DRIVE_FOLDER_REPAIR_EVENT = "pl-drive-folder-repair-needed";

export type DriveFolderRepairNeededDetail = {
  companyId: string;
  detectedAt: number;
  autoRepairAt: number;
  message: string;
};

export type DriveCloudSyncStatusDetail = {
  companyId: string;
  status: CloudSyncRunStatus;
  progress?: {
    uploadedFiles?: number;
    uploadedVouchers?: number;
    downloadedFiles?: number;
    downloadedVouchers?: number;
  };
};

/** Header indicator + settings — sync cycle start/stop par turant UI update. */
export function notifyDriveCloudSyncStatus(
  companyId: string,
  status: CloudSyncRunStatus,
  progress?: DriveCloudSyncStatusDetail["progress"]
): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  if (!cid) return;
  window.dispatchEvent(
    new CustomEvent<DriveCloudSyncStatusDetail>(PL_DRIVE_CLOUD_SYNC_STATUS_EVENT, {
      detail: { companyId: cid, status, progress },
    })
  );
}

/** Folder missing — settings dialog / banner turant dikhao (registry refresh ka wait mat karo). */
export function notifyDriveFolderRepairNeeded(
  companyId: string,
  detail: Omit<DriveFolderRepairNeededDetail, "companyId">
): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  if (!cid) return;
  window.dispatchEvent(
    new CustomEvent<DriveFolderRepairNeededDetail>(PL_DRIVE_FOLDER_REPAIR_EVENT, {
      detail: { companyId: cid, ...detail },
    })
  );
}

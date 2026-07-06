"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { readCloudSyncConfigFromCompany, shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { isLocalCloudSyncCycleRunning } from "@/lib/localCloudSync/engine";
import {
  PL_DRIVE_CLOUD_SYNC_STATUS_EVENT,
  type DriveCloudSyncStatusDetail,
} from "@/lib/localCloudSync/driveCloudSyncUiEvents";

/** Drive-sync company par header spinner — Firebase online company par kabhi nahi. */
export function useDriveCloudSyncHeaderIndicator(): { showSpinner: boolean } {
  const { companyId, company } = useCompany();
  const [driveCompany, setDriveCompany] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const cid = String(companyId || "").trim();
    if (!cid) {
      setDriveCompany(false);
      setSyncing(false);
      return;
    }
    const eligible = await shouldUseLocalCloudSync(cid);
    setDriveCompany(eligible);
    if (!eligible) {
      setSyncing(false);
      return;
    }
    if (isLocalCloudSyncCycleRunning(cid)) {
      setSyncing(true);
      return;
    }
    const cfg = readCloudSyncConfigFromCompany(company);
    setSyncing(cfg.cloudSyncStatus === "syncing");
  }, [companyId, company]);

  useEffect(() => {
    void refresh();
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<DriveCloudSyncStatusDetail>).detail;
      if (!detail || detail.companyId !== String(companyId || "").trim()) return;
      setSyncing(detail.status === "syncing");
    };
    window.addEventListener(PL_DRIVE_CLOUD_SYNC_STATUS_EVENT, onStatus);
    const pollId = window.setInterval(() => void refresh(), 1500);
    return () => {
      window.removeEventListener(PL_DRIVE_CLOUD_SYNC_STATUS_EVENT, onStatus);
      window.clearInterval(pollId);
    };
  }, [companyId, refresh]);

  return { showSpinner: driveCompany && syncing };
}

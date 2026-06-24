"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@/hooks/useCompany";
import {
  RESTORE_CLOUD_PUSH_JOB_EVENT,
  heartbeatRestoreCloudUploadLeader,
  readPendingRestoreCloudPush,
  releaseRestoreCloudUploadLeader,
  runPendingRestoreCloudPushDataPhase,
  runPendingRestoreCloudPushFilesPhase,
  runRestoreCloudLocalSyncPhase,
  tryAcquireRestoreCloudUploadLeader,
  type PendingRestoreCloudPush,
} from "@/lib/restoreCloudBackgroundSync";

const STORAGE_KEY = "pl_pending_restore_cloud_push_v1";

/** Background upload — browse app during files phase; new tab resumes same % (leader tab only runs). */
export function PendingRestoreCloudPushManager() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const runningRef = useRef(false);

  const runUploadIfLeader = useCallback(async () => {
    if (authLoading || !user?.uid || runningRef.current) return;

    const job = readPendingRestoreCloudPush();
    if (!job || job.ownerUid !== user.uid) return;

    if (!tryAcquireRestoreCloudUploadLeader(job.companyId)) return;

    runningRef.current = true;
    const heartbeat = window.setInterval(() => heartbeatRestoreCloudUploadLeader(job.companyId), 4000);

    try {
      let workingJob: PendingRestoreCloudPush = job;

      if (!workingJob.dataUploaded && (workingJob.phase ?? "data") === "data") {
        const dataResult = await runPendingRestoreCloudPushDataPhase(workingJob, { skipFilesQueue: true });
        if (!dataResult.ok) {
          toast({
            variant: "destructive",
            title: "Cloud data upload pending",
            description: dataResult.message || "Retry when online.",
            duration: 12_000,
          });
          return;
        }
        workingJob = { ...workingJob, phase: "files", dataUploaded: true };
      }

      if ((workingJob.phase ?? "data") === "files") {
        const filesResult = await runPendingRestoreCloudPushFilesPhase(workingJob);
        if (!filesResult.ok) {
          toast({
            variant: "destructive",
            title: "Attachment upload pending",
            description: filesResult.message || "Upload will retry from the same progress.",
            duration: 12_000,
          });
          return;
        }
        workingJob = {
          ...workingJob,
          phase: "sync",
          filesUploaded: filesResult.filesUploaded ?? workingJob.filesUploaded,
        };

        const syncResult = await runRestoreCloudLocalSyncPhase(workingJob, {
          filesUploaded: filesResult.filesUploaded,
        });
        if (syncResult.ok) {
          toast({
            title: "Cloud restore complete",
            description: syncResult.message || filesResult.message || "All attachments uploaded.",
            duration: 10_000,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Local sync pending",
            description: syncResult.message || "Files uploaded — refresh page if attachments missing.",
            duration: 12_000,
          });
        }
      } else if ((workingJob.phase ?? "data") === "sync") {
        const syncResult = await runRestoreCloudLocalSyncPhase(workingJob);
        if (syncResult.ok) {
          toast({
            title: "Cloud restore complete",
            description: syncResult.message || "Local cache refreshed.",
            duration: 10_000,
          });
        }
      }
    } finally {
      window.clearInterval(heartbeat);
      releaseRestoreCloudUploadLeader(job.companyId);
      runningRef.current = false;
    }
  }, [authLoading, user?.uid, toast]);

  useEffect(() => {
    void runUploadIfLeader();

    const onJob = () => void runUploadIfLeader();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) void runUploadIfLeader();
    };

    window.addEventListener(RESTORE_CLOUD_PUSH_JOB_EVENT, onJob);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(RESTORE_CLOUD_PUSH_JOB_EVENT, onJob);
      window.removeEventListener("storage", onStorage);
    };
  }, [runUploadIfLeader]);

  return null;
}

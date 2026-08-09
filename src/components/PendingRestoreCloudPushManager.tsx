"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import {
  RESTORE_CLOUD_PUSH_JOB_EVENT,
  heartbeatRestoreCloudUploadLeader,
  kickPendingRestoreCloudPush,
  readPendingRestoreCloudPush,
  releaseRestoreCloudUploadLeader,
  runPendingRestoreCloudPushDataPhase,
  runPendingRestoreCloudPushFilesPhase,
  runRestoreCloudLocalSyncPhase,
  tryAcquireRestoreCloudUploadLeader,
  getRestoreCloudPushProgress,
  drainRestoreCloudPendingAttachments,
  type PendingRestoreCloudPush,
} from "@/lib/restoreCloudBackgroundSync";
import { FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT } from "@/lib/firebaseLedgerDataSyncDisabled";
const STORAGE_KEY = "pl_pending_restore_cloud_push_v1";

/** Background upload — browse app during files phase; new tab resumes same % (leader tab only runs). */
export function PendingRestoreCloudPushManager() {
  const { user, loading: authLoading } = useAuth();
  const { company } = useCompany();
  const { toast } = useToast();
  const runningRef = useRef(false);
  const healTriedRef = useRef<string | null>(null);

  const runUploadIfLeader = useCallback(async () => {
    if (authLoading || !user?.uid || runningRef.current) return;

    const job = readPendingRestoreCloudPush();
    if (!job || job.ownerUid !== user.uid) return;

    const prog = getRestoreCloudPushProgress();
    if (prog?.status === "failed" && prog.phase === "files") {
      try {
        const { countPendingFilesForCompany } = await import("@/lib/localPendingFiles");
        const pendingLeft = await countPendingFilesForCompany(job.companyId);
        if (pendingLeft === 0 || job.restoreWithAttachments === true) {
          if (!tryAcquireRestoreCloudUploadLeader(job.companyId)) return;
          runningRef.current = true;
          try {
            if (pendingLeft > 0) {
              await drainRestoreCloudPendingAttachments(job.companyId);
            }
            const syncResult = await runRestoreCloudLocalSyncPhase({ ...job, phase: "sync" });
            if (syncResult.ok) {
              toast({
                title: "Cloud restore complete",
                description: syncResult.message || "Attachments already on cloud — ledger refreshed.",
                duration: 10_000,
              });
            }
          } finally {
            releaseRestoreCloudUploadLeader(job.companyId);
            runningRef.current = false;
          }
          return;
        }
      } catch {
        /* continue normal retry */
      }
    }

    if (!tryAcquireRestoreCloudUploadLeader(job.companyId)) return;

    runningRef.current = true;
    const heartbeat = window.setInterval(() => heartbeatRestoreCloudUploadLeader(job.companyId), 4000);

    try {
      let workingJob: PendingRestoreCloudPush = job;

      if (!workingJob.dataUploaded && (workingJob.phase ?? "data") === "data") {
        const dataResult = await runPendingRestoreCloudPushDataPhase(workingJob, { skipFilesQueue: true });
        if (!dataResult.ok) {
          if (dataResult.paused) {
            toast({
              title: "Cloud data upload paused",
              description: dataResult.message || "Reconnect or refresh to resume.",
              duration: 10_000,
            });
            return;
          }
          toast({
            variant: "destructive",
            title: "Cloud data upload pending",
            description: dataResult.message || "Retry when online.",
            duration: 12_000,
          });
          return;
        }
        const afterData = readPendingRestoreCloudPush();
        workingJob = afterData
          ? { ...afterData }
          : {
              ...workingJob,
              phase: workingJob.restoreWithAttachments === true ? "files" : "sync",
              dataUploaded: true,
            };
      }

      if ((workingJob.phase ?? "data") === "files") {
        const filesResult = await runPendingRestoreCloudPushFilesPhase(workingJob);
        if (!filesResult.ok) {
          if (filesResult.paused) {
            toast({
              title: "Attachment upload paused",
              description: filesResult.message || "Reconnect or refresh to resume from the same %.",
              duration: 10_000,
            });
            return;
          }
          // Bucket pe files ho chuki / false failure — queue drain karke selector unlock + sync.
          try {
            await drainRestoreCloudPendingAttachments(workingJob.companyId);
            const syncResult = await runRestoreCloudLocalSyncPhase(
              { ...workingJob, phase: "sync" },
              { filesUploaded: filesResult.filesUploaded ?? workingJob.filesUploaded }
            );
            if (syncResult.ok) {
              toast({
                title: "Cloud restore complete",
                description:
                  syncResult.message ||
                  "Attachments are on cloud — company is ready. You can switch companies now.",
                duration: 10_000,
              });
              return;
            }
          } catch {
            /* fall through to toast */
          }
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
            description:
              syncResult.message ||
              filesResult.message ||
              "Data + files uploaded — page will refresh…",
            duration: 8_000,
          });
          // reload sync phase me schedule hota hai; filesResult.reload pe bhi ensure
          if (filesResult.reload && !syncResult.reload && typeof window !== "undefined") {
            window.setTimeout(() => window.location.reload(), 700);
          }
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
            description: syncResult.message || "Local cache refreshed — page will refresh…",
            duration: 8_000,
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
    kickPendingRestoreCloudPush();
    void runUploadIfLeader();

    const onJob = () => void runUploadIfLeader();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) void runUploadIfLeader();
    };

    window.addEventListener(RESTORE_CLOUD_PUSH_JOB_EVENT, onJob);
    window.addEventListener("storage", onStorage);
    window.addEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, onJob);
    window.addEventListener("online", onJob);
    return () => {
      window.removeEventListener(RESTORE_CLOUD_PUSH_JOB_EVENT, onJob);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FIREBASE_LEDGER_DATA_SYNC_CHANGED_EVENT, onJob);
      window.removeEventListener("online", onJob);
    };
  }, [runUploadIfLeader]);

  // Banner gayab + bucket pe files + docs me `local:` — one-shot Storage→HTTPS heal.
  useEffect(() => {
    const cid = String(company?.id || "").trim();
    if (authLoading || !user?.uid || !cid) return;
    if (readPendingRestoreCloudPush()?.companyId === cid) return;
    if (healTriedRef.current === cid) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    let cancelled = false;
    void (async () => {
      try {
        const { canSyncCompanyToServer } = await import("@/lib/localVoucherOutbox");
        if (!(await canSyncCompanyToServer(cid))) {
          healTriedRef.current = cid;
          return;
        }
        const { companyHasStuckLocalAttachmentRefs, relinkLocalAttachmentsFromFirebaseStorage } =
          await import("@/lib/relinkLocalAttachmentsFromStorage");
        if (!(await companyHasStuckLocalAttachmentRefs(cid))) {
          healTriedRef.current = cid;
          return;
        }
        const result = await relinkLocalAttachmentsFromFirebaseStorage(cid);
        if (cancelled) return;
        // Success ya koi stuck ref nahi bacha → dubara mat chalao; miss pe next company-switch/reload pe retry.
        if (result.relinked > 0 || result.missed === 0) {
          healTriedRef.current = cid;
        }
        if (result.relinked <= 0) return;
        toast({
          title: "Attachment links fixed",
          description: `${result.relinked} file URL(s) updated to cloud HTTPS.`,
          duration: 8_000,
        });
      } catch (e) {
        console.warn("[PendingRestoreCloudPushManager] stuck local: heal failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid, company, toast]);

  return null;
}

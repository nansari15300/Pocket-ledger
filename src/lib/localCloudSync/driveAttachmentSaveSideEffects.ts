"use client";

import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { purgeRemovedDriveAttachmentRefsForDocSave } from "@/lib/localCloudSync/driveAttachmentDelete";
import { relocateDriveAttachmentsForVoucherDateChange } from "@/lib/localCloudSync/driveAttachmentRelocate";
import { scheduleLocalCloudSyncInBackground } from "@/lib/localCloudSync/engine";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import { maybeEnqueueLocalCloudSyncFromWrite } from "@/lib/localCloudSync/enqueueFromWrite";

type DriveAttachmentSideEffectJob = {
  companyId: string;
  collectionName: string;
  docId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const pendingJobs = new Map<string, DriveAttachmentSideEffectJob>();
let onlineListenerInstalled = false;

function jobKey(companyId: string, collectionName: string, docId: string): string {
  return `${companyId}\x1f${collectionName}\x1f${docId}`;
}

/** Delete / recycle — queued attachment side effects mat chalao (stale save wapas na likhe). */
export function cancelDriveAttachmentSideEffectsForDoc(
  companyId: string,
  collectionName: string,
  docId: string
): void {
  pendingJobs.delete(jobKey(String(companyId || "").trim(), collectionName, docId));
}

function ensureOnlineFlushListener(): void {
  if (onlineListenerInstalled || typeof window === "undefined") return;
  onlineListenerInstalled = true;
  window.addEventListener("online", () => {
    void flushPendingDriveAttachmentSideEffects();
  });
}

async function flushPendingDriveAttachmentSideEffects(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const jobs = [...pendingJobs.values()];
  pendingJobs.clear();
  for (const job of jobs) {
    try {
      await runDriveAttachmentSideEffectsJob(job);
    } catch (e) {
      warnLocalCloudSync("background Drive attachment side effects failed", {
        companyId: job.companyId,
        collectionName: job.collectionName,
        docId: job.docId,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function runDriveAttachmentSideEffectsJob(job: DriveAttachmentSideEffectJob): Promise<void> {
  const cid = String(job.companyId || "").trim();
  if (!cid || !(await shouldUseLocalCloudSync(cid))) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    pendingJobs.set(jobKey(cid, job.collectionName, job.docId), job);
    return;
  }

  const { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb, notifyBrowserDbCollectionUpdated } = await import(
    "@/lib/localCompanyDocMirror"
  );
  const current = (await getCompanyDocFromBrowserDb(cid, job.collectionName, job.docId)) as Record<
    string,
    unknown
  > | null;
  if (!current || current.isDeleted === true) {
    return;
  }

  await purgeRemovedDriveAttachmentRefsForDocSave({
    companyId: cid,
    before: job.before,
    after: current,
  });

  if (job.collectionName === "vouchers") {
    const relocated = await relocateDriveAttachmentsForVoucherDateChange({
      companyId: cid,
      docId: job.docId,
      before: job.before,
      after: current,
    });
    if (relocated.relocated > 0) {
      const stillThere = (await getCompanyDocFromBrowserDb(cid, job.collectionName, job.docId)) as Record<
        string,
        unknown
      > | null;
      if (!stillThere || stillThere.isDeleted === true) {
        return;
      }
      const nextAfter = relocated.after;
      await upsertCompanyDocInBrowserDb(cid, job.collectionName, job.docId, nextAfter, {
        notify: true,
        force: true,
        skipCloudSyncEnqueue: true,
        skipDriveAttachmentSideEffects: true,
      });
      const afterWrite = (await getCompanyDocFromBrowserDb(cid, job.collectionName, job.docId)) as Record<
        string,
        unknown
      > | null;
      if (!afterWrite || afterWrite.isDeleted === true) {
        return;
      }
      await maybeEnqueueLocalCloudSyncFromWrite({
        companyId: cid,
        collectionName: job.collectionName,
        docId: job.docId,
        data: afterWrite,
      });
      notifyBrowserDbCollectionUpdated(cid, job.collectionName, { immediate: true });
      logLocalCloudSync("background relocated voucher attachments", {
        companyId: cid,
        docId: job.docId,
        relocated: relocated.relocated,
      });
    }
  }

  scheduleLocalCloudSyncInBackground(cid, { force: true });
}

/** Save path: SQLite turant; Drive purge/relocate/upload background (offline par queue, online par flush). */
export function scheduleDriveAttachmentSideEffectsAfterDocSave(job: DriveAttachmentSideEffectJob): void {
  const cid = String(job.companyId || "").trim();
  if (!cid) return;
  pendingJobs.set(jobKey(cid, job.collectionName, job.docId), job);
  ensureOnlineFlushListener();
  void flushPendingDriveAttachmentSideEffects();
}

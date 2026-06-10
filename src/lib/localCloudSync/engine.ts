"use client";

import {
  deleteCompanyDocFromBrowserDb,
  getCompanyDocFromBrowserDb,
  notifyBrowserDbCollectionUpdated,
  upsertCompanyDocInBrowserDb,
} from "@/lib/localCompanyDocMirror";
import {
  deleteDriveAttachmentRefsForDoc,
  isPermanentPurgePayload,
  removeLocalPendingRefsFromDoc,
} from "@/lib/recycleBinEntityLifecycle";
import {
  applyDriveManifestUploadGuard,
  buildCloudSyncManifestFromCompany,
  mergeRemoteCloudSyncManifestIntoLocalCompany,
  patchLocalCompanyCloudSyncFields,
  pushCompanyRegistryManifestToDrive,
  readCloudSyncConfigFromCompany,
  readCloudSyncDriveShareUsers,
  shouldUseLocalCloudSync,
} from "@/lib/localCloudSync/companyConfig";
import { pullDriveLocalReconciliationLinksForCompany } from "@/lib/reconciliation/driveLocalReconciliation";
import { auth } from "@/lib/firebase";
import { maybeShareDriveCompanyFolder } from "@/lib/localCloudSync/driveCloudSyncClient";
import { runWithRemoteCloudSyncApply } from "@/lib/localCloudSync/enqueueFromWrite";
import {
  mergeRemotePayloadIntoLocal,
  shouldApplyRemoteCloudSyncOp,
} from "@/lib/localCloudSync/conflict";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import {
  FIREBASE_SIGN_IN_REQUIRED_FOR_DRIVE_MSG,
  getFirebaseAuthUserForApi,
  hasRealFirebaseAuthSession,
  isDriveAuthRequiredError,
  waitForFirebaseAuthReady,
} from "@/lib/firebaseAuthForApi";
import { getDataSyncProviderForCompany } from "@/lib/localCloudSync/providers";
import { cloudSyncDataProviderId } from "@/lib/localCloudSync/companyConfig";
import { backfillLocalDocsToCloudSyncOutbox } from "@/lib/localCloudSync/backfillOutbox";
import {
  CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG,
  isCloudSyncEncryptionReady,
  readCloudSyncDriveEncryptionFromCompany,
} from "@/lib/localCloudSync/driveEncryption";
import { uploadOpeningSnapshotToDrive, downloadAndMergeOpeningUsersFromDrive } from "@/lib/localCloudSync/openingDriveSnapshot";
import { purgeLocalCompanyIfDriveFolderMissing } from "@/lib/localCloudSync/driveCompanyFolderLifecycle";
import { isLocalFileRef, syncPendingFilesForCompany } from "@/lib/localPendingFiles";
import {
  countPendingLocalCloudSyncOps,
  getCloudSyncCursor,
  listPendingLocalCloudSyncOps,
  markLocalCloudSyncOpsSynced,
  rebasePendingLocalCloudSyncOps,
  setCloudSyncCursor,
} from "@/lib/localCloudSync/queue";
import {
  getLocalCompanyById,
  localCompanyRowIsDeleted,
  wasLocalCompanyRecentlyRemoved,
} from "@/lib/localCompanyStore";
import {
  countNewCloudSyncFileRefs,
  collectCloudSyncFileRefsFromValue,
} from "@/lib/localCloudSync/syncSummaryAttachments";
import { appendDeviceSyncSummaryHistory } from "@/lib/localCloudSync/deviceSyncSummaryHistory";
import type { CloudSyncCompanyRef, CloudSyncProviderId, CloudSyncLastSyncSummary } from "@/lib/localCloudSync/types";

const VOUCHER_SYNC_TABLE = "vouchers";

const syncLocks = new Set<string>();

/** Forensic toggle: remote op apply/download pipeline ko debug mode me hi verbose rakho. */
function attachmentSyncForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

/** Cycle-level focused logger: op apply/skip aur file-ref extraction ko correlate karne ke liye. */
function logAttachmentSyncForensic(tag: string, payload: Record<string, unknown>): void {
  if (!attachmentSyncForensicEnabled()) return;
  console.warn("[FORENSIC_ATTACHMENT_SYNC]", { tag, ...payload });
}

async function assertCompanyCanStillWriteDrive(companyId: string): Promise<void> {
  if (wasLocalCompanyRecentlyRemoved(companyId)) {
    // Local delete/purge ke immediately baad stale running sync ko Drive folder recreate karne se roko.
    throw new Error("Company was removed locally; Drive sync stopped.");
  }
  const active = await getLocalCompanyById(companyId);
  if (!active) throw new Error("Company was removed locally; Drive sync stopped.");
}

export async function runLocalCloudSyncCycle(companyId: string, options?: { force?: boolean }): Promise<{
  ok: boolean;
  error?: string;
  uploaded: number;
  downloaded: number;
}> {
  const { isPlRemoteServerClientMode } = await import("@/lib/plRemoteServerClient");
  if (isPlRemoteServerClientMode()) {
    return {
      ok: false,
      error: "Remote client: Drive/Firestore sync runs on the server PC only.",
      uploaded: 0,
      downloaded: 0,
    };
  }
  const cid = String(companyId || "").trim();
  if (!cid) return { ok: false, error: "missing companyId", uploaded: 0, downloaded: 0 };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "offline", uploaded: 0, downloaded: 0 };
  }

  if (syncLocks.has(cid) && !options?.force) {
    return { ok: false, error: "sync already running", uploaded: 0, downloaded: 0 };
  }

  if (!(await shouldUseLocalCloudSync(cid))) {
    return { ok: false, error: "cloud sync disabled or firestore company", uploaded: 0, downloaded: 0 };
  }

  // Firebase session restore hone tak wait — startup par galat "Sign in required" error mat likho.
  await waitForFirebaseAuthReady();
  if (!hasRealFirebaseAuthSession()) {
    return { ok: false, error: FIREBASE_SIGN_IN_REQUIRED_FOR_DRIVE_MSG, uploaded: 0, downloaded: 0 };
  }

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return { ok: false, error: "company not found", uploaded: 0, downloaded: 0 };

  const cfg = readCloudSyncConfigFromCompany(reg);
  const providerId = cloudSyncDataProviderId(reg);
  if (!providerId) return { ok: false, error: "no data sync provider", uploaded: 0, downloaded: 0 };

  // Drive folder user ne delete kar diya ho to sync usko recreate/reupload na kare; local copy bhi hatao.
  const firebaseUser = await getFirebaseAuthUserForApi();
  const purged = await purgeLocalCompanyIfDriveFolderMissing(cid, firebaseUser.uid);
  if (purged) {
    return { ok: false, error: "Drive company folder missing; local company removed", uploaded: 0, downloaded: 0 };
  }

  syncLocks.add(cid);
  await patchLocalCompanyCloudSyncFields(cid, { cloudSyncStatus: "syncing", cloudSyncLastError: null });
  await setCloudSyncCursor(cid, { syncStatus: "syncing", lastError: null });

  let uploaded = 0;
  let downloaded = 0;

  try {
    const provider = getDataSyncProviderForCompany(reg);
    if (!provider) return { ok: false, error: "no data sync provider", uploaded: 0, downloaded: 0 };
    const cursor = await getCloudSyncCursor(cid);
    // Drive folder: `Pocket Ledger/{CompanyName__id}/` — registry se readable name bhejo
    const syncRef: CloudSyncCompanyRef = {
      companyId: cid,
      companyName: typeof reg.name === "string" ? reg.name : undefined,
      // Joined local company — owner ka shared folder id (poora Pocket Ledger root nahi).
      driveSharedFolderId:
        typeof reg.cloudSyncDriveFolderId === "string" && reg.cloudSyncDriveFolderId.trim()
          ? reg.cloudSyncDriveFolderId.trim()
          : undefined,
    };

    // Admin ke Drive manifest ko upload se pehle local registry me lao; stale false flags plain upload/untick na kar dein.
    const manifestBeforeUpload = await provider.getManifest(syncRef);
    const regAfterManifest =
      (await mergeRemoteCloudSyncManifestIntoLocalCompany(cid, manifestBeforeUpload)) ?? reg;

    // Company bin me hai — manifest pehle likho; attachment fail se doosre device ko status na roke.
    if (localCompanyRowIsDeleted(regAfterManifest)) {
      try {
        await pushCompanyRegistryManifestToDrive(cid);
      } catch (e) {
        warnLocalCloudSync("registry manifest push (deleted company) failed", {
          companyId: cid,
          msg: e instanceof Error ? e.message : String(e),
        });
      }
      const now = Date.now();
      await setCloudSyncCursor(cid, { lastSyncAt: now, syncStatus: "idle", lastError: null });
      await patchLocalCompanyCloudSyncFields(cid, {
        cloudSyncLastSyncAt: now,
        cloudSyncStatus: "idle",
        cloudSyncLastError: null,
      });
      return { ok: true, uploaded: 0, downloaded: 0 };
    }

    const encCfg = readCloudSyncDriveEncryptionFromCompany(regAfterManifest as Record<string, unknown>);
    if (encCfg.encryptAny && !(await isCloudSyncEncryptionReady(cid))) {
      throw new Error(CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG);
    }

    const pendingBefore = await listPendingLocalCloudSyncOps(cid);
    // Sync enable se pehle ka data (journal, opening, masters) — pehli cycle par outbox khali rehta tha.
    if (pendingBefore.length === 0) {
      await backfillLocalDocsToCloudSyncOutbox(cid);
    }

    // Upload se pehle remote latest cursor padho, phir local pending seq ko uske upar shift karo.
    await rebasePendingLocalCloudSyncOps(cid, Math.max(cursor.lastSyncedOp, manifestBeforeUpload.latestOp));

    // Pending `local:` attachments/avatars → Drive `attachments/` + `opening/avatars/`.
    await assertCompanyCanStillWriteDrive(cid);
    const attachSync = await syncPendingFilesForCompany(cid);
    // Pending bytes uploader ka per-cycle outcome: upload fail/success ko ops download se separate dekho.
    logAttachmentSyncForensic("pending_attachment_upload_cycle_result", {
      companyId: cid,
      synced: attachSync.synced,
      failed: attachSync.failed,
    });
    if (attachSync.synced > 0) {
      logLocalCloudSync("attachments uploaded to Drive", { companyId: cid, ...attachSync });
    }
    if (attachSync.failed > 0) {
      // Attachment bytes Drive par na jaayein to `local:` refs doosre device par broken ho jaate hain; data op upload rok kar retry safe rakho.
      const detail = attachSync.lastError?.trim();
      throw new Error(
        detail ||
          `Attachment upload to ${providerId === "google_drive" ? "Google Drive" : "cloud storage"} failed for ${attachSync.failed} file(s). Voucher sync paused so files are not lost.`
      );
    }

    const pending = await listPendingLocalCloudSyncOps(cid);
    // Device-local "Added vouchers" = isi device ke create ops (global download counts se alag).
    const createdVouchersThisDevice = pending.filter(
      (op) => op.table === VOUCHER_SYNC_TABLE && op.action === "create"
    ).length;
    let maxUploadedSeq = cursor.lastSyncedOp;
    let uploadedVouchers = 0;
    for (const op of pending) {
      await assertCompanyCanStillWriteDrive(cid);
      await provider.uploadOperation(syncRef, op);
      uploaded += 1;
      if (op.table === VOUCHER_SYNC_TABLE) uploadedVouchers += 1;
      if (op.opSeq > maxUploadedSeq) maxUploadedSeq = op.opSeq;
    }
    if (pending.length > 0) {
      await markLocalCloudSyncOpsSynced(cid, maxUploadedSeq);
    }

    const manifest = await provider.getManifest(syncRef);

    // Manifest → local registry (share list + encryption salt) decrypt/download se pehle.
    const regForShare = (await mergeRemoteCloudSyncManifestIntoLocalCompany(cid, manifest)) ?? reg;

    // Shared devices — owner ke set kiye login passwords merge (encrypted opening/users.json).
    try {
      await downloadAndMergeOpeningUsersFromDrive(cid, syncRef);
    } catch (e) {
      warnLocalCloudSync("opening users download skipped", {
        companyId: cid,
        msg: e instanceof Error ? e.message : String(e),
      });
    }

    const remoteOps = await provider.downloadOperations(syncRef, cursor.lastSyncedOp);
    // Remote delta size: agar yahan 0 aata rahe to source device upload/cursor issue pakadna easy hota hai.
    logAttachmentSyncForensic("remote_ops_downloaded", {
      companyId: cid,
      sinceOp: cursor.lastSyncedOp,
      count: remoteOps.length,
    });
    let maxRemoteSeq = cursor.lastSyncedOp;
    let addedVouchers = 0;
    let addedFiles = 0;
    // Remote cloud download apply — summary card "Downloaded from cloud" row.
    let downloadedVouchers = 0;
    let downloadedFiles = 0;

    const bumpedCollections = new Set<string>();
    await runWithRemoteCloudSyncApply(async () => {
      for (const op of remoteOps) {
        // Op payload se saare attachment refs nikaalo taaki apply/skip ke saath exact mapping mile.
        const opFileRefs = new Set<string>();
        collectCloudSyncFileRefsFromValue(op.payload, opFileRefs);
        if ([...opFileRefs].some((ref) => isLocalFileRef(ref))) {
          // Dusre device ka `local:` ref bytes ke bina unusable hota hai; corrected `drive:` op ka wait karo.
          warnLocalCloudSync("remote op skipped because it contains unresolved local attachment refs", {
            companyId: cid,
            opSeq: op.opSeq,
            table: op.table,
            rowId: op.rowId,
            fileRefs: [...opFileRefs],
          });
          if (op.opSeq > maxRemoteSeq) maxRemoteSeq = op.opSeq;
          continue;
        }
        const local = (await getCompanyDocFromBrowserDb(cid, op.table, op.rowId)) as Record<string, unknown> | null;
        // Bin permanent delete: row + Drive/local attachments hatao — soft tombstone mat re-apply karo.
        if (isPermanentPurgePayload(op.payload)) {
          const docForFiles = { ...(local ?? {}), ...op.payload };
          await removeLocalPendingRefsFromDoc(docForFiles);
          await deleteDriveAttachmentRefsForDoc(cid, docForFiles);
          await deleteCompanyDocFromBrowserDb(cid, op.table, op.rowId, { force: true, notify: false });
          bumpedCollections.add(op.table);
          if (op.opSeq > maxRemoteSeq) maxRemoteSeq = op.opSeq;
          continue;
        }
        if (!shouldApplyRemoteCloudSyncOp(local, op)) {
          // Skip reason path: ref present hone par bhi op apply nahi hua to immediately visible hoga.
          logAttachmentSyncForensic("remote_op_skipped", {
            companyId: cid,
            opSeq: op.opSeq,
            table: op.table,
            rowId: op.rowId,
            fileRefs: [...opFileRefs],
          });
          continue;
        }
        const merged = mergeRemotePayloadIntoLocal(local, op);
        await upsertCompanyDocInBrowserDb(cid, op.table, op.rowId, merged, {
          skipCloudSyncEnqueue: true,
          force: true,
          notify: false,
        });
        bumpedCollections.add(op.table);
        downloaded += 1;
        if (op.table === VOUCHER_SYNC_TABLE) {
          addedVouchers += 1;
          downloadedVouchers += 1;
        }
        // Nayi drive:/local: refs — table name se guess na karo (FILE_ENTITY_SYNC_TABLES bug fix).
        const newFileRefs = countNewCloudSyncFileRefs(local, merged);
        if (newFileRefs > 0) {
          addedFiles += newFileRefs;
          downloadedFiles += newFileRefs;
        }
        // Applied op trace: payload refs vs newly-added refs compare karke missing-link cases isolate hote hain.
        logAttachmentSyncForensic("remote_op_applied", {
          companyId: cid,
          opSeq: op.opSeq,
          table: op.table,
          rowId: op.rowId,
          payloadFileRefs: [...opFileRefs],
          newFileRefsDetected: newFileRefs,
        });
        if (op.opSeq > maxRemoteSeq) maxRemoteSeq = op.opSeq;
      }
    });
    for (const table of bumpedCollections) {
      notifyBrowserDbCollectionUpdated(cid, table);
    }

    // Cursor sirf actually upload/download hue ops par advance — manifest.latestOp se mat badhao.
    // Pehle: khali download par bhi cursor manifest par chala jata tha → doosre device par data kabhi dubara download nahi hota.
    const newLastSyncedOp = Math.max(cursor.lastSyncedOp, maxUploadedSeq, maxRemoteSeq);
    if (
      remoteOps.length === 0 &&
      manifest.latestOp > cursor.lastSyncedOp &&
      newLastSyncedOp < manifest.latestOp
    ) {
      warnLocalCloudSync("download cursor behind manifest — Drive par ops missing ya read fail", {
        companyId: cid,
        cursor: cursor.lastSyncedOp,
        manifestLatest: manifest.latestOp,
      });
    }
    const latestOpForManifest = Math.max(manifest.latestOp, maxUploadedSeq, maxRemoteSeq);
    await assertCompanyCanStillWriteDrive(cid);
    const builtManifest = buildCloudSyncManifestFromCompany(regForShare as Record<string, unknown>, {
      latestOp: latestOpForManifest,
      updatedAt: Date.now(),
      companyId: cid,
      driveShareUsers: readCloudSyncDriveShareUsers(regForShare as Record<string, unknown>),
    });
    // Country mode + bin delete flag — remote delete ko active device se overwrite mat karo.
    const manifestToUpload = applyDriveManifestUploadGuard(
      builtManifest,
      manifestBeforeUpload,
      regForShare as Record<string, unknown>
    );
    await provider.updateManifest(syncRef, manifestToUpload);

    const now = Date.now();
    await setCloudSyncCursor(cid, {
      lastSyncedOp: newLastSyncedOp,
      lastSyncAt: now,
      syncStatus: "idle",
      lastError: null,
    });
    await patchLocalCompanyCloudSyncFields(cid, {
      cloudSyncLastSyncAt: now,
      cloudSyncStatus: "idle",
      cloudSyncLastError: null,
    });

    const sharedUsers = readCloudSyncDriveShareUsers(regForShare as Record<string, unknown>);
    if (providerId === "google_drive" && sharedUsers.length > 0) {
      await assertCompanyCanStillWriteDrive(cid);
      await maybeShareDriveCompanyFolder({
        companyId: cid,
        companyName: syncRef.companyName,
        users: sharedUsers,
      });
    }

    // Opening snapshot sync side-effect only; attachment counters below stay voucher-file focused.
    await assertCompanyCanStillWriteDrive(cid);
    await uploadOpeningSnapshotToDrive(cid);

    // IMPORTANT: summary card "files" = sirf real attachment/avatar uploads, opening snapshot files nahi.
    const attachmentFilesUploadedThisCycle = attachSync.synced;
    // Device-local "Added files" = isi device se nayi attachment bytes upload hui.
    const createdFilesThisDevice = attachmentFilesUploadedThisCycle;
    // Uploaded files row ko strict attachment-only rakho; payload ref count/opening sync se inflate na ho.
    const uploadedFiles = attachmentFilesUploadedThisCycle;

    const lastSyncSummary: CloudSyncLastSyncSummary = {
      addedFiles,
      addedVouchers,
      uploadedFiles,
      uploadedVouchers,
      downloadedFiles,
      downloadedVouchers,
    };
    const hasCycleActivity =
      uploaded > 0 ||
      downloaded > 0 ||
      uploadedFiles > 0 ||
      uploadedVouchers > 0 ||
      downloadedFiles > 0 ||
      downloadedVouchers > 0;
    // Idle tick par summary zero overwrite mat karo; last meaningful sync counters card me visible rehne do.
    const summaryToPersist = hasCycleActivity
      ? lastSyncSummary
      : readCloudSyncConfigFromCompany(regForShare as Record<string, unknown>).cloudSyncLastSyncSummary;

    await patchLocalCompanyCloudSyncFields(cid, {
      cloudSyncLastSyncSummary: summaryToPersist,
    });
    if (hasCycleActivity) {
      // Date-range card ke liye per-device timeline row save karo (Drive par sync nahi hota).
      appendDeviceSyncSummaryHistory({
        companyId: cid,
        summary: lastSyncSummary,
        createdFiles: createdFilesThisDevice,
        createdVouchers: createdVouchersThisDevice,
        at: now,
      });
    }

    logLocalCloudSync("cycle ok", {
      companyId: cid,
      uploaded,
      downloaded,
      lastSyncedOp: newLastSyncedOp,
      manifestLatestOp: latestOpForManifest,
      attachments: attachSync.synced,
      lastSyncSummary,
    });
    try {
      await pullDriveLocalReconciliationLinksForCompany(cid);
    } catch {
      /* recon links optional */
    }
    return { ok: true, uploaded, downloaded };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Auth abhi ready nahi — permanent error state mat chipkao (background retry karega).
    if (isDriveAuthRequiredError(e)) {
      warnLocalCloudSync("cycle skipped — auth required", { companyId: cid, msg });
      return { ok: false, error: msg, uploaded, downloaded };
    }
    warnLocalCloudSync("cycle failed", { companyId: cid, msg });
    await setCloudSyncCursor(cid, { syncStatus: "error", lastError: msg });
    await patchLocalCompanyCloudSyncFields(cid, { cloudSyncStatus: "error", cloudSyncLastError: msg });
    return { ok: false, error: msg, uploaded, downloaded };
  } finally {
    syncLocks.delete(cid);
    // Crash/abort par UI "syncing" atka reh jata tha — lock release ke baad idle restore.
    try {
      const cur = await getCloudSyncCursor(cid);
      if (cur.syncStatus === "syncing") {
        await setCloudSyncCursor(cid, { syncStatus: "idle" });
        await patchLocalCompanyCloudSyncFields(cid, { cloudSyncStatus: "idle" });
      }
    } catch {
      /* ignore */
    }
  }
}

export async function getLocalCloudSyncStatus(companyId: string): Promise<{
  pending: number;
  lastSyncAt: number | null;
  lastSyncedOp: number;
  status: string;
  lastError: string | null;
  lastSyncSummary: CloudSyncLastSyncSummary;
}> {
  const cursor = await getCloudSyncCursor(companyId);
  const pending = await countPendingLocalCloudSyncOps(companyId);
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  const cfg = readCloudSyncConfigFromCompany(reg);
  return {
    pending,
    lastSyncAt: cfg.cloudSyncLastSyncAt ?? cursor.lastSyncAt,
    lastSyncedOp: cursor.lastSyncedOp,
    status: cfg.cloudSyncStatus,
    lastError: cfg.cloudSyncLastError,
    lastSyncSummary: cfg.cloudSyncLastSyncSummary,
  };
}

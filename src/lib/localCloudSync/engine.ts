"use client";

import {
  getCompanyDocFromBrowserDb,
  upsertCompanyDocInBrowserDb,
} from "@/lib/localCompanyDocMirror";
import {
  buildCloudSyncManifestFromCompany,
  mergeRemoteCloudSyncManifestIntoLocalCompany,
  patchLocalCompanyCloudSyncFields,
  readCloudSyncConfigFromCompany,
  readCloudSyncDriveShareUsers,
  shouldUseLocalCloudSync,
} from "@/lib/localCloudSync/companyConfig";
import { maybeShareDriveCompanyFolder } from "@/lib/localCloudSync/driveCloudSyncClient";
import { runWithRemoteCloudSyncApply } from "@/lib/localCloudSync/enqueueFromWrite";
import {
  mergeRemotePayloadIntoLocal,
  shouldApplyRemoteCloudSyncOp,
} from "@/lib/localCloudSync/conflict";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import {
  FIREBASE_SIGN_IN_REQUIRED_FOR_DRIVE_MSG,
  hasRealFirebaseAuthSession,
  isDriveAuthRequiredError,
  waitForFirebaseAuthReady,
} from "@/lib/firebaseAuthForApi";
import { getSyncProviderForCompany } from "@/lib/localCloudSync/providers";
import { backfillLocalDocsToCloudSyncOutbox } from "@/lib/localCloudSync/backfillOutbox";
import {
  CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG,
  isCloudSyncEncryptionReady,
  readCloudSyncDriveEncryptionFromCompany,
} from "@/lib/localCloudSync/driveEncryption";
import { uploadOpeningSnapshotToDrive, downloadAndMergeOpeningUsersFromDrive } from "@/lib/localCloudSync/openingDriveSnapshot";
import { forceReencryptDriveIfNeeded } from "@/lib/localCloudSync/forceReencryptDrive";
import { syncPendingFilesForCompany } from "@/lib/localPendingFiles";
import {
  countPendingLocalCloudSyncOps,
  getCloudSyncCursor,
  listPendingLocalCloudSyncOps,
  markLocalCloudSyncOpsSynced,
  setCloudSyncCursor,
} from "@/lib/localCloudSync/queue";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import {
  countNewCloudSyncFileRefs,
  countUniqueCloudSyncFileRefsInOps,
} from "@/lib/localCloudSync/syncSummaryAttachments";
import type { CloudSyncCompanyRef, CloudSyncProviderId, CloudSyncLastSyncSummary } from "@/lib/localCloudSync/types";

const VOUCHER_SYNC_TABLE = "vouchers";

const syncLocks = new Set<string>();

export async function runLocalCloudSyncCycle(companyId: string, options?: { force?: boolean }): Promise<{
  ok: boolean;
  error?: string;
  uploaded: number;
  downloaded: number;
}> {
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
  const providerId = cfg.cloudSyncProvider as CloudSyncProviderId;
  if (!providerId) return { ok: false, error: "no provider", uploaded: 0, downloaded: 0 };

  const encCfg = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  if (encCfg.encryptAny && !(await isCloudSyncEncryptionReady(cid))) {
    return {
      ok: false,
      error: CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG,
      uploaded: 0,
      downloaded: 0,
    };
  }

  syncLocks.add(cid);
  await patchLocalCompanyCloudSyncFields(cid, { cloudSyncStatus: "syncing", cloudSyncLastError: null });
  await setCloudSyncCursor(cid, { syncStatus: "syncing", lastError: null });

  let uploaded = 0;
  let downloaded = 0;

  try {
    const provider = getSyncProviderForCompany(providerId);
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

    const pendingBefore = await listPendingLocalCloudSyncOps(cid);
    // Sync enable se pehle ka data (journal, opening, masters) — pehli cycle par outbox khali rehta tha.
    if (pendingBefore.length === 0) {
      await backfillLocalDocsToCloudSyncOutbox(cid);
    }

    // Pending `local:` attachments/avatars → Drive `attachments/` + `opening/avatars/`.
    const attachSync = await syncPendingFilesForCompany(cid);
    if (attachSync.synced > 0) {
      logLocalCloudSync("attachments uploaded to Drive", { companyId: cid, ...attachSync });
    }

    const pending = await listPendingLocalCloudSyncOps(cid);
    let maxUploadedSeq = cursor.lastSyncedOp;
    let uploadedVouchers = 0;
    for (const op of pending) {
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
    let maxRemoteSeq = cursor.lastSyncedOp;
    let addedVouchers = 0;
    let addedFiles = 0;
    // Drive se download apply — summary card "Downloaded from Drive" row.
    let downloadedVouchers = 0;
    let downloadedFiles = 0;

    await runWithRemoteCloudSyncApply(async () => {
      for (const op of remoteOps) {
        const local = (await getCompanyDocFromBrowserDb(cid, op.table, op.rowId)) as Record<string, unknown> | null;
        if (!shouldApplyRemoteCloudSyncOp(local, op)) continue;
        const merged = mergeRemotePayloadIntoLocal(local, op);
        await upsertCompanyDocInBrowserDb(cid, op.table, op.rowId, merged, {
          notify: false,
          skipCloudSyncEnqueue: true,
          force: true,
        });
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
        if (op.opSeq > maxRemoteSeq) maxRemoteSeq = op.opSeq;
      }
    });

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
    await provider.updateManifest(
      syncRef,
      buildCloudSyncManifestFromCompany(regForShare as Record<string, unknown>, {
        latestOp: latestOpForManifest,
        updatedAt: Date.now(),
        companyId: cid,
        driveShareUsers: readCloudSyncDriveShareUsers(regForShare as Record<string, unknown>),
      })
    );

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
    if (sharedUsers.length > 0) {
      await maybeShareDriveCompanyFolder({
        companyId: cid,
        companyName: syncRef.companyName,
        users: sharedUsers,
      });
    }

    const openingUploaded = await uploadOpeningSnapshotToDrive(cid);

    // Pending bytes + ops metadata — voucher `fileUrls` jab pehle se `drive:` par hon.
    const bytesUploadedThisCycle = attachSync.synced + openingUploaded;
    const refsInUploadedOps = countUniqueCloudSyncFileRefsInOps(pending);
    const uploadedFiles = Math.max(bytesUploadedThisCycle, refsInUploadedOps);

    const lastSyncSummary: CloudSyncLastSyncSummary = {
      addedFiles,
      addedVouchers,
      uploadedFiles,
      uploadedVouchers,
      downloadedFiles,
      downloadedVouchers,
    };

    await patchLocalCompanyCloudSyncFields(cid, {
      cloudSyncLastSyncSummary: lastSyncSummary,
    });

    logLocalCloudSync("cycle ok", {
      companyId: cid,
      uploaded,
      downloaded,
      lastSyncedOp: newLastSyncedOp,
      manifestLatestOp: latestOpForManifest,
      attachments: attachSync.synced,
      lastSyncSummary,
    });
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

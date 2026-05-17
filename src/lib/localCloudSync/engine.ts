"use client";

import {
  getCompanyDocFromBrowserDb,
  upsertCompanyDocInBrowserDb,
} from "@/lib/localCompanyDocMirror";
import {
  patchLocalCompanyCloudSyncFields,
  readCloudSyncConfigFromCompany,
  shouldUseLocalCloudSync,
} from "@/lib/localCloudSync/companyConfig";
import { runWithRemoteCloudSyncApply } from "@/lib/localCloudSync/enqueueFromWrite";
import {
  mergeRemotePayloadIntoLocal,
  shouldApplyRemoteCloudSyncOp,
} from "@/lib/localCloudSync/conflict";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import { getSyncProviderForCompany } from "@/lib/localCloudSync/providers";
import {
  countPendingLocalCloudSyncOps,
  getCloudSyncCursor,
  listPendingLocalCloudSyncOps,
  markLocalCloudSyncOpsSynced,
  setCloudSyncCursor,
} from "@/lib/localCloudSync/queue";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import type { CloudSyncProviderId } from "@/lib/localCloudSync/types";

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

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return { ok: false, error: "company not found", uploaded: 0, downloaded: 0 };

  const cfg = readCloudSyncConfigFromCompany(reg);
  const providerId = cfg.cloudSyncProvider as CloudSyncProviderId;
  if (!providerId) return { ok: false, error: "no provider", uploaded: 0, downloaded: 0 };

  syncLocks.add(cid);
  await patchLocalCompanyCloudSyncFields(cid, { cloudSyncStatus: "syncing", cloudSyncLastError: null });
  await setCloudSyncCursor(cid, { syncStatus: "syncing", lastError: null });

  let uploaded = 0;
  let downloaded = 0;

  try {
    const provider = getSyncProviderForCompany(providerId);
    const cursor = await getCloudSyncCursor(cid);

    const pending = await listPendingLocalCloudSyncOps(cid);
    let maxUploadedSeq = cursor.lastSyncedOp;
    for (const op of pending) {
      await provider.uploadOperation(cid, op);
      uploaded += 1;
      if (op.opSeq > maxUploadedSeq) maxUploadedSeq = op.opSeq;
    }
    if (pending.length > 0) {
      await markLocalCloudSyncOpsSynced(cid, maxUploadedSeq);
    }

    const manifest = await provider.getManifest(cid);
    const remoteOps = await provider.downloadOperations(cid, cursor.lastSyncedOp);
    let maxRemoteSeq = cursor.lastSyncedOp;

    await runWithRemoteCloudSyncApply(async () => {
      for (const op of remoteOps) {
        const local = (await getCompanyDocFromBrowserDb(cid, op.table, op.rowId)) as Record<string, unknown> | null;
        if (!shouldApplyRemoteCloudSyncOp(local, op)) continue;
        const merged = mergeRemotePayloadIntoLocal(local, op);
        await upsertCompanyDocInBrowserDb(cid, op.table, op.rowId, merged, {
          skipCloudSyncEnqueue: true,
          force: true,
        });
        downloaded += 1;
        if (op.opSeq > maxRemoteSeq) maxRemoteSeq = op.opSeq;
      }
    });

    const latestOp = Math.max(manifest.latestOp, maxUploadedSeq, maxRemoteSeq);
    await provider.updateManifest(cid, { latestOp, updatedAt: Date.now() });

    const now = Date.now();
    await setCloudSyncCursor(cid, {
      lastSyncedOp: latestOp,
      lastSyncAt: now,
      syncStatus: "idle",
      lastError: null,
    });
    await patchLocalCompanyCloudSyncFields(cid, {
      cloudSyncLastSyncAt: now,
      cloudSyncStatus: "idle",
      cloudSyncLastError: null,
    });

    logLocalCloudSync("cycle ok", { companyId: cid, uploaded, downloaded, latestOp });
    return { ok: true, uploaded, downloaded };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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
  };
}

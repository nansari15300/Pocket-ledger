"use client";

import {
  isDriveFileRef,
  remotePathFromDriveFileRef,
  branchRelativePathFromPocketLedgerRemotePath,
  driveAttachmentDownloadTryPaths,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { readCloudSyncDriveEncryptionFromCompany } from "@/lib/localCloudSync/driveEncryption";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";

/** Doc payload se sirf `drive:` attachment refs collect karo. */
export function collectDriveAttachmentRefsFromValue(value: unknown, bucket: Set<string>): void {
  if (typeof value === "string") {
    if (isDriveFileRef(value)) bucket.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectDriveAttachmentRefsFromValue(v, bucket);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectDriveAttachmentRefsFromValue(v, bucket);
    }
  }
}

export function collectDriveAttachmentRefsFromDoc(data: Record<string, unknown> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!data) return out;
  collectDriveAttachmentRefsFromValue(data, out);
  return out;
}

/** Drive par ek attachment ref delete — company folder branch path (shared join safe). */
export async function deleteDriveAttachmentRef(companyId: string, ref: string): Promise<void> {
  const cid = String(companyId || "").trim();
  const raw = String(ref || "").trim();
  if (!cid || !isDriveFileRef(raw)) return;
  if (!(await shouldUseLocalCloudSync(cid))) return;

  const logicalPath = remotePathFromDriveFileRef(raw);
  if (!logicalPath) return;

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  const flags = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  const driveSharedFolderId =
    typeof reg?.cloudSyncDriveFolderId === "string" && reg.cloudSyncDriveFolderId.trim()
      ? reg.cloudSyncDriveFolderId.trim()
      : undefined;
  const companyName = typeof reg?.name === "string" ? reg.name : undefined;

  const tryPaths = driveAttachmentDownloadTryPaths(logicalPath, flags.encryptFiles);
  let deleted = false;
  for (const path of tryPaths) {
    const branchRelativePath = branchRelativePathFromPocketLedgerRemotePath(path);
    try {
      await postDriveJsonViaClient("/api/local-cloud-sync/drive/delete-file", {
        companyId: cid,
        companyName,
        driveSharedFolderId,
        branchRelativePath: branchRelativePath ?? undefined,
        remotePath: path,
      });
      deleted = true;
    } catch (e) {
      warnLocalCloudSync("Drive attachment delete attempt failed", {
        companyId: cid,
        path,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (deleted) {
    logLocalCloudSync("Drive attachment deleted", { companyId: cid, ref: raw });
  }
}

/** Save se pehle UI se hatai hui `drive:` refs Drive par bhi delete karo. */
export async function purgeRemovedDriveAttachmentRefsForDocSave(input: {
  companyId: string;
  before: Record<string, unknown> | null | undefined;
  after: Record<string, unknown>;
}): Promise<void> {
  const cid = String(input.companyId || "").trim();
  if (!cid || !(await shouldUseLocalCloudSync(cid))) return;

  const beforeRefs = collectDriveAttachmentRefsFromDoc(input.before ?? null);
  const afterRefs = collectDriveAttachmentRefsFromDoc(input.after);
  const removed: string[] = [];
  for (const ref of beforeRefs) {
    if (!afterRefs.has(ref)) removed.push(ref);
  }
  if (removed.length === 0) return;

  for (const ref of removed) {
    try {
      await deleteDriveAttachmentRef(cid, ref);
    } catch (e) {
      warnLocalCloudSync("purge removed Drive attachment failed", {
        companyId: cid,
        ref,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

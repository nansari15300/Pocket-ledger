"use client";

import type { CloudSyncCompanyRef, CloudSyncManifest, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";
import type { SyncProvider } from "@/lib/localCloudSync/providers/types";
import {
  decryptCloudSyncOpFromDrive,
  encryptCloudSyncOpForDrive,
  type DriveEncryptedOpFile,
} from "@/lib/localCloudSync/driveEncryption";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import {
  downloadDriveAttachmentBlob,
  uploadAttachmentBytesToDrive,
} from "@/lib/localCloudSync/driveCloudSyncClient";
import {
  buildPocketLedgerDriveRelativePath,
  remotePathFromDriveFileRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";

/** Browser / static / APK / EXE — hosted Drive API (pocket-ledger.com). */
export class GoogleDriveSyncProvider implements SyncProvider {
  readonly providerId = "google_drive" as const;

  async uploadOperation(ref: CloudSyncCompanyRef, op: LocalCloudSyncOperation): Promise<void> {
    const bodyOp = await encryptCloudSyncOpForDrive(ref.companyId, op);
    await postDriveJsonViaClient("/api/local-cloud-sync/drive/upload-op", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      driveSharedFolderId: ref.driveSharedFolderId,
      op: bodyOp,
    });
  }

  async downloadOperations(ref: CloudSyncCompanyRef, afterOpSeq: number): Promise<LocalCloudSyncOperation[]> {
    const res = await postDriveJsonViaClient<{ operations: Array<LocalCloudSyncOperation | DriveEncryptedOpFile> }>(
      "/api/local-cloud-sync/drive/download-ops",
      {
        companyId: ref.companyId,
        companyName: ref.companyName,
        driveSharedFolderId: ref.driveSharedFolderId,
        afterOpSeq,
      }
    );
    const raw = res.operations ?? [];
    const out: LocalCloudSyncOperation[] = [];
    for (const row of raw) {
      out.push(await decryptCloudSyncOpFromDrive(ref.companyId, row));
    }
    return out;
  }

  async getManifest(ref: CloudSyncCompanyRef): Promise<CloudSyncManifest> {
    return postDriveJsonViaClient<CloudSyncManifest>("/api/local-cloud-sync/drive/manifest", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      driveSharedFolderId: ref.driveSharedFolderId,
      action: "get",
    });
  }

  async updateManifest(ref: CloudSyncCompanyRef, manifest: CloudSyncManifest): Promise<void> {
    await postDriveJsonViaClient("/api/local-cloud-sync/drive/manifest", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      driveSharedFolderId: ref.driveSharedFolderId,
      action: "set",
      manifest,
    });
  }

  async uploadFile(
    ref: CloudSyncCompanyRef,
    fileId: string,
    bytes: ArrayBuffer,
    meta: { contentType?: string; sha256Hex?: string; remotePath?: string }
  ): Promise<{ remotePath: string }> {
    const remotePath =
      String(meta.remotePath || "").trim() ||
      buildPocketLedgerDriveRelativePath(
        { companyId: ref.companyId, companyName: ref.companyName },
        "attachments",
        "_files",
        fileId || "file"
      );
    const driveRef = await uploadAttachmentBytesToDrive({
      companyId: ref.companyId,
      companyName: ref.companyName,
      remotePath,
      bytes,
      contentType: meta.contentType,
      sha256Hex: meta.sha256Hex,
    });
    return { remotePath: remotePathFromDriveFileRef(driveRef) ?? remotePath };
  }

  async downloadFile(ref: CloudSyncCompanyRef, remotePath: string): Promise<ArrayBuffer | null> {
    const blob = await downloadDriveAttachmentBlob(remotePath, ref.companyId);
    if (!blob) return null;
    return blob.arrayBuffer();
  }
}

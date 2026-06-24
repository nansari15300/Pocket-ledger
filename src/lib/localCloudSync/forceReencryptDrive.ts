"use client";

import { getLocalCompanyById } from "@/lib/localCompanyStore";
import {
  encryptDriveFileBytesForUpload,
  readCloudSyncDriveEncryptionFromCompany,
} from "@/lib/localCloudSync/driveEncryption";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import { getSyncProviderForCompany } from "@/lib/localCloudSync/providers";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";
import { driveStoragePathForLogicalFile } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import type { CloudSyncCompanyRef } from "@/lib/localCloudSync/types";

type DriveListedFile = {
  storagePath: string;
  logicalPath: string;
  encrypted: boolean;
};

/** Encryption ON ke baad — plain Drive ops dubara upload (encrypt lag jayega). */
export async function forceReencryptDriveData(companyId: string, ref: CloudSyncCompanyRef): Promise<number> {
  const provider = getSyncProviderForCompany("google_drive");
  const ops = await provider.downloadOperations(ref, 0);
  let n = 0;
  for (const op of ops) {
    await provider.uploadOperation(ref, op);
    n += 1;
  }
  logLocalCloudSync("force re-encrypt data ops", { companyId, count: n });
  return n;
}

/** Plain attachment files → `.plenc.json` encrypted wrapper. */
export async function forceReencryptDriveFiles(companyId: string, ref: CloudSyncCompanyRef): Promise<number> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  const flags = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  if (!flags.encryptFiles) return 0;

  const res = await postDriveJsonViaClient<{ files?: DriveListedFile[] }>(
    "/api/local-cloud-sync/drive/list-files",
    {
      companyId,
      companyName: ref.companyName,
      driveSharedFolderId: ref.driveSharedFolderId,
    }
  );
  const files = res.files ?? [];
  let n = 0;
  for (const f of files) {
    if (f.encrypted) continue;
    const dl = await postDriveJsonViaClient<{ base64: string | null; contentType?: string }>(
      "/api/local-cloud-sync/drive/download-file",
      { remotePath: f.storagePath }
    );
    if (!dl.base64) continue;
    const bin = atob(dl.base64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const parts = f.logicalPath.split("/");
    const originalName = parts[parts.length - 1] || "file";
    const encBody = await encryptDriveFileBytesForUpload(
      companyId,
      buf.buffer,
      { contentType: dl.contentType, originalName },
      reg as Record<string, unknown>
    );
    const storagePath = driveStoragePathForLogicalFile(f.logicalPath, true);
    await postDriveJsonViaClient("/api/local-cloud-sync/drive/upload-json", {
      companyId,
      companyName: ref.companyName,
      driveSharedFolderId: ref.driveSharedFolderId,
      relativePath: storagePath,
      body: encBody,
      contentType: "application/json",
    });
    if (f.storagePath !== storagePath) {
      await postDriveJsonViaClient("/api/local-cloud-sync/drive/delete-file", {
        remotePath: f.storagePath,
      });
    }
    n += 1;
  }
  logLocalCloudSync("force re-encrypt files", { companyId, count: n });
  return n;
}

export async function forceReencryptDriveIfNeeded(companyId: string): Promise<{ dataOps: number; files: number }> {
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  const flags = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  const ref: CloudSyncCompanyRef = {
    companyId,
    companyName: typeof reg?.name === "string" ? reg.name : undefined,
    driveSharedFolderId:
      typeof reg?.cloudSyncDriveFolderId === "string" ? reg.cloudSyncDriveFolderId.trim() : undefined,
  };
  let dataOps = 0;
  let files = 0;
  if (flags.encryptData) {
    dataOps = await forceReencryptDriveData(companyId, ref);
  }
  if (flags.encryptFiles) {
    files = await forceReencryptDriveFiles(companyId, ref);
  }
  return { dataOps, files };
}

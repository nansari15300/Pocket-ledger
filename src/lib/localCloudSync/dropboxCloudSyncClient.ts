"use client";

import { readCloudSyncConfigFromCompany, shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import {
  encryptDriveFileBytesForUpload,
  decryptDriveFilePayloadFromDownload,
  readCloudSyncDriveEncryptionFromCompany,
} from "@/lib/localCloudSync/driveEncryption";
import { postDropboxJsonViaClient } from "@/lib/localCloudSync/dropboxApiClient";
import { blobToBase64Chunked } from "@/lib/capacitorAttachmentFs";
import {
  driveStoragePathForLogicalFile,
  remotePathFromDriveFileRef,
  toDriveFileRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";

function attachmentSyncForensicEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_ATTACHMENT_FORENSIC_DEBUG === "1";
}

function logAttachmentSyncForensic(tag: string, payload: Record<string, unknown>): void {
  if (!attachmentSyncForensicEnabled()) return;
  console.warn("[FORENSIC_ATTACHMENT_SYNC]", { tag, provider: "dropbox", ...payload });
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: contentType || "application/octet-stream" });
}

/** Local company + Dropbox sync ON? */
export async function isDropboxCloudSyncCompany(companyId: string): Promise<boolean> {
  if (!(await shouldUseLocalCloudSync(companyId))) return false;
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  const cfg = readCloudSyncConfigFromCompany(reg);
  return cfg.cloudSyncProvider === "dropbox";
}

/** Attachment bytes upload — returns `drive:` ref (same path prefix as Drive layout on Dropbox). */
export async function uploadAttachmentBytesToDropbox(input: {
  companyId: string;
  companyName?: string;
  remotePath: string;
  bytes: Blob | ArrayBuffer;
  contentType?: string;
  sha256Hex?: string;
}): Promise<string> {
  const logicalPath = input.remotePath;
  const reg = await getLocalCompanyById(input.companyId, { includeDeleted: true });
  const flags = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  const blob = input.bytes instanceof Blob ? input.bytes : new Blob([input.bytes], { type: input.contentType });
  logAttachmentSyncForensic("upload_attachment_start", {
    companyId: input.companyId,
    logicalPath,
    encryptFiles: flags.encryptFiles,
    bytes: blob.size,
    contentType: input.contentType || blob.type || "application/octet-stream",
  });

  if (flags.encryptFiles) {
    const buf = await blob.arrayBuffer();
    const parts = logicalPath.split("/");
    const originalName = parts[parts.length - 1] || "file";
    const encBody = await encryptDriveFileBytesForUpload(
      input.companyId,
      buf,
      { contentType: input.contentType || blob.type, originalName },
      reg as Record<string, unknown>
    );
    const storagePath = driveStoragePathForLogicalFile(logicalPath, true);
    await postDropboxJsonViaClient("/api/local-cloud-sync/dropbox/upload-json", {
      companyId: input.companyId,
      companyName: input.companyName,
      relativePath: storagePath,
      body: encBody,
      contentType: "application/json",
    });
    logAttachmentSyncForensic("upload_attachment_done_encrypted", {
      companyId: input.companyId,
      logicalPath,
      storagePath,
    });
    return toDriveFileRef(logicalPath);
  }

  const base64 = await blobToBase64Chunked(blob);
  const res = await postDropboxJsonViaClient<{ remotePath: string }>(
    "/api/local-cloud-sync/dropbox/upload-file",
    {
      companyId: input.companyId,
      companyName: input.companyName,
      remotePath: logicalPath,
      contentType: input.contentType || blob.type || "application/octet-stream",
      sha256Hex: input.sha256Hex,
      base64,
    }
  );
  logAttachmentSyncForensic("upload_attachment_done_plain", {
    companyId: input.companyId,
    logicalPath,
    uploadedRemotePath: res.remotePath,
  });
  return toDriveFileRef(res.remotePath);
}

/** `drive:` ref se blob — Dropbox par same Pocket Ledger path layout. */
export async function downloadDropboxAttachmentBlob(
  remotePath: string,
  companyId?: string
): Promise<Blob | null> {
  const logicalPath = remotePathFromDriveFileRef(remotePath) ?? remotePath;
  const cid = companyId;
  const reg = cid ? await getLocalCompanyById(cid, { includeDeleted: true }) : null;
  const flags = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);
  const tryPaths = flags.encryptFiles
    ? [driveStoragePathForLogicalFile(logicalPath, true), logicalPath]
    : [logicalPath];

  logAttachmentSyncForensic("download_attachment_start", {
    requestedPath: remotePath,
    logicalPath,
    companyId: cid ?? null,
    encryptFiles: flags.encryptFiles,
    tryPaths,
  });

  for (const path of tryPaths) {
    const res = await postDropboxJsonViaClient<{ base64: string | null; contentType?: string | null }>(
      "/api/local-cloud-sync/dropbox/download-file",
      {
        companyId: cid,
        companyName: typeof reg?.name === "string" ? reg.name : undefined,
        remotePath: path,
      }
    );
    if (!res.base64) {
      logAttachmentSyncForensic("download_attachment_path_miss", { logicalPath, attemptedPath: path });
      continue;
    }
    if (cid && (path.endsWith(".plenc.json") || res.contentType?.includes("json"))) {
      try {
        const text = atob(res.base64);
        const { bytes, contentType } = await decryptDriveFilePayloadFromDownload(
          cid,
          text,
          reg as Record<string, unknown>
        );
        logAttachmentSyncForensic("download_attachment_done_encrypted", { logicalPath, attemptedPath: path, bytes: bytes.byteLength });
        return new Blob([bytes], { type: contentType });
      } catch {
        continue;
      }
    }
    logAttachmentSyncForensic("download_attachment_done_plain", { logicalPath, attemptedPath: path });
    return base64ToBlob(res.base64, res.contentType || "application/octet-stream");
  }
  return null;
}

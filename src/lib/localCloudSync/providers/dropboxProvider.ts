"use client";

import { getBillingApiUrl } from "@/lib/billingApiOrigin";
import { getFirebaseIdTokenForApi } from "@/lib/firebaseAuthForApi";
import { hostedApiFetch } from "@/lib/hostedApiFetch";
import { blobToBase64Chunked } from "@/lib/capacitorAttachmentFs";
import type { CloudSyncCompanyRef, CloudSyncManifest, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";
import type { SyncProvider } from "@/lib/localCloudSync/providers/types";
import {
  decryptCloudSyncOpFromDrive,
  encryptCloudSyncOpForDrive,
  type DriveEncryptedOpFile,
} from "@/lib/localCloudSync/driveEncryption";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const { token } = await getFirebaseIdTokenForApi();
  const res = await hostedApiFetch(getBillingApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(String((json as { error?: string }).error || res.statusText));
  return json;
}

/** Browser client — server uses Dropbox API with stored OAuth tokens. */
export class DropboxSyncProvider implements SyncProvider {
  readonly providerId = "dropbox" as const;

  async uploadOperation(ref: CloudSyncCompanyRef, op: LocalCloudSyncOperation): Promise<void> {
    const bodyOp = await encryptCloudSyncOpForDrive(ref.companyId, op);
    await postJson("/api/local-cloud-sync/dropbox/upload-op", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      dropboxCompanyPath: ref.dropboxCompanyPath,
      op: bodyOp,
    });
  }

  async downloadOperations(ref: CloudSyncCompanyRef, afterOpSeq: number): Promise<LocalCloudSyncOperation[]> {
    const res = await postJson<{ operations: Array<LocalCloudSyncOperation | DriveEncryptedOpFile> }>(
      "/api/local-cloud-sync/dropbox/download-ops",
      {
        companyId: ref.companyId,
        companyName: ref.companyName,
        dropboxCompanyPath: ref.dropboxCompanyPath,
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
    return postJson<CloudSyncManifest>("/api/local-cloud-sync/dropbox/manifest", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      dropboxCompanyPath: ref.dropboxCompanyPath,
      action: "get",
    });
  }

  async updateManifest(ref: CloudSyncCompanyRef, manifest: CloudSyncManifest): Promise<void> {
    await postJson("/api/local-cloud-sync/dropbox/manifest", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      dropboxCompanyPath: ref.dropboxCompanyPath,
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
    const res = await postJson<{ remotePath: string }>("/api/local-cloud-sync/dropbox/upload-file", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      fileId,
      remotePath: meta.remotePath,
      contentType: meta.contentType,
      sha256Hex: meta.sha256Hex,
      base64: await blobToBase64Chunked(new Blob([bytes], { type: meta.contentType })),
    });
    return { remotePath: res.remotePath };
  }

  async downloadFile(ref: CloudSyncCompanyRef, remotePath: string): Promise<ArrayBuffer | null> {
    const res = await postJson<{ base64: string | null }>("/api/local-cloud-sync/dropbox/download-file", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      remotePath,
    });
    if (!res.base64) return null;
    const bin = atob(res.base64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
}

"use client";

import { auth } from "@/lib/firebase";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
import type { CloudSyncCompanyRef, CloudSyncManifest, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";
import type { SyncProvider } from "@/lib/localCloudSync/providers/types";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required for Drive sync");
  const token = await user.getIdToken();
  const res = await fetch(path, {
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

/** Browser client — server Admin SDK se Drive par delta ops likhta hai. */
export class GoogleDriveSyncProvider implements SyncProvider {
  readonly providerId = "google_drive" as const;

  async uploadOperation(ref: CloudSyncCompanyRef, op: LocalCloudSyncOperation): Promise<void> {
    await postJson("/api/local-cloud-sync/drive/upload-op", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      op,
    });
  }

  async downloadOperations(ref: CloudSyncCompanyRef, afterOpSeq: number): Promise<LocalCloudSyncOperation[]> {
    const res = await postJson<{ operations: LocalCloudSyncOperation[] }>(
      "/api/local-cloud-sync/drive/download-ops",
      { companyId: ref.companyId, companyName: ref.companyName, afterOpSeq }
    );
    return res.operations ?? [];
  }

  async getManifest(ref: CloudSyncCompanyRef): Promise<CloudSyncManifest> {
    return postJson<CloudSyncManifest>("/api/local-cloud-sync/drive/manifest", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      action: "get",
    });
  }

  async updateManifest(ref: CloudSyncCompanyRef, manifest: CloudSyncManifest): Promise<void> {
    await postJson("/api/local-cloud-sync/drive/manifest", {
      companyId: ref.companyId,
      companyName: ref.companyName,
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
    const res = await postJson<{ remotePath: string }>("/api/local-cloud-sync/drive/upload-file", {
      companyId: ref.companyId,
      companyName: ref.companyName,
      fileId,
      remotePath: meta.remotePath,
      contentType: meta.contentType,
      sha256Hex: meta.sha256Hex,
      base64: arrayBufferToBase64(bytes),
    });
    return { remotePath: res.remotePath };
  }

  async downloadFile(ref: CloudSyncCompanyRef, remotePath: string): Promise<ArrayBuffer | null> {
    const res = await postJson<{ base64: string | null }>("/api/local-cloud-sync/drive/download-file", {
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

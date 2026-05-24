"use client";

import { auth } from "@/lib/firebase";
import {
  readCloudSyncConfigFromCompany,
  shouldUseLocalCloudSync,
} from "@/lib/localCloudSync/companyConfig";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import { toDriveFileRef } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { getLocalCompanyById } from "@/lib/localCompanyStore";

async function postDriveJson<T>(path: string, body: unknown): Promise<T> {
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

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: contentType || "application/octet-stream" });
}

/** Local company + Google Drive sync ON? */
export async function isGoogleDriveCloudSyncCompany(companyId: string): Promise<boolean> {
  if (!(await shouldUseLocalCloudSync(companyId))) return false;
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  const cfg = readCloudSyncConfigFromCompany(reg);
  return cfg.cloudSyncProvider === "google_drive";
}

/** Backup save ke baad Drive `backup/` branch me copy — fail silent (local save primary). */
export async function maybeUploadCompanyBackupToDrive(input: {
  companyId: string;
  companyName?: string;
  fileName: string;
  blob: Blob;
}): Promise<string | null> {
  try {
    if (!(await isGoogleDriveCloudSyncCompany(input.companyId))) return null;
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    // Route body limit — bahut bade backup skip (local save primary rehta hai).
    const maxBytes = 45 * 1024 * 1024;
    if (input.blob.size > maxBytes) {
      warnLocalCloudSync("backup too large for Drive upload", {
        companyId: input.companyId,
        sizeMb: Math.round(input.blob.size / (1024 * 1024)),
      });
      return null;
    }
    const base64 = await blobToBase64(input.blob);
    const res = await postDriveJson<{ remotePath?: string }>("/api/local-cloud-sync/drive/upload-backup", {
      companyId: input.companyId,
      companyName: input.companyName,
      fileName: input.fileName,
      base64,
    });
    logLocalCloudSync("backup uploaded to Drive", { companyId: input.companyId, remotePath: res.remotePath });
    return res.remotePath ?? null;
  } catch (e) {
    warnLocalCloudSync("backup Drive upload skipped", {
      companyId: input.companyId,
      msg: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Attachment bytes upload — returns `drive:` ref for voucher field. */
export async function uploadAttachmentBytesToDrive(input: {
  companyId: string;
  companyName?: string;
  remotePath: string;
  bytes: Blob | ArrayBuffer;
  contentType?: string;
  sha256Hex?: string;
}): Promise<string> {
  const blob = input.bytes instanceof Blob ? input.bytes : new Blob([input.bytes], { type: input.contentType });
  const base64 = await blobToBase64(blob);
  const res = await postDriveJson<{ remotePath: string }>("/api/local-cloud-sync/drive/upload-file", {
    companyId: input.companyId,
    companyName: input.companyName,
    remotePath: input.remotePath,
    contentType: input.contentType || blob.type || "application/octet-stream",
    sha256Hex: input.sha256Hex,
    base64,
  });
  return toDriveFileRef(res.remotePath);
}

/** `drive:` ref se blob — preview / open ke liye. */
export async function downloadDriveAttachmentBlob(remotePath: string): Promise<Blob | null> {
  const res = await postDriveJson<{ base64: string | null; contentType?: string | null }>(
    "/api/local-cloud-sync/drive/download-file",
    { remotePath }
  );
  if (!res.base64) return null;
  return base64ToBlob(res.base64, res.contentType || "application/octet-stream");
}

/** Sync cycle ke baad configured staff emails ko company folder share. */
export async function maybeShareDriveCompanyFolder(input: {
  companyId: string;
  companyName?: string;
  emails: string[];
}): Promise<void> {
  const emails = input.emails.map((e) => String(e || "").trim()).filter(Boolean);
  if (!emails.length) return;
  if (!(await isGoogleDriveCloudSyncCompany(input.companyId))) return;
  try {
    await postDriveJson("/api/local-cloud-sync/drive/share-folder", {
      companyId: input.companyId,
      companyName: input.companyName,
      emails,
    });
    logLocalCloudSync("Drive folder shared", { companyId: input.companyId, count: emails.length });
  } catch (e) {
    warnLocalCloudSync("Drive folder share failed", {
      companyId: input.companyId,
      msg: e instanceof Error ? e.message : String(e),
    });
  }
}

export function readCloudSyncSharedEmails(company: Record<string, unknown> | null | undefined): string[] {
  const raw = company?.cloudSyncSharedEmails;
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => String(e || "").trim()).filter((e) => e.includes("@"));
}

/** Pending `local:` attachment → Drive path + `drive:` ref (voucher metadata se). */
export async function uploadPendingAttachmentPayloadToDrive(input: {
  companyId: string;
  companyName?: string;
  company?: Record<string, unknown> | null;
  collection: string;
  docId: string;
  blob: Blob;
  contentType?: string;
  fileName?: string;
}): Promise<string> {
  let voucherType: unknown;
  let voucherNumber: unknown;
  let voucherDate: unknown;
  if (input.collection === "vouchers") {
    const { getCompanyDocFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
    const row = (await getCompanyDocFromBrowserDb(input.companyId, "vouchers", input.docId)) as Record<
      string,
      unknown
    > | null;
    if (row) {
      voucherType = row.voucherType ?? row.type;
      voucherNumber = row.voucherNumber ?? row.id;
      voucherDate = row.date ?? row.voucherDate ?? row.createdAt;
    }
  }
  const { buildVoucherAttachmentDriveRemotePath } = await import("@/lib/localCloudSync/driveAttachmentPath");
  const { computeSha256HexFromBlob } = await import("@/lib/security/sha256Hex");
  const remotePath = buildVoucherAttachmentDriveRemotePath({
    ref: { companyId: input.companyId, companyName: input.companyName },
    voucherType,
    voucherNumber,
    voucherDate,
    originalFileName: input.fileName,
    company: input.company ?? null,
  });
  const sha256Hex = await computeSha256HexFromBlob(input.blob);
  return uploadAttachmentBytesToDrive({
    companyId: input.companyId,
    companyName: input.companyName,
    remotePath,
    bytes: input.blob,
    contentType: input.contentType,
    sha256Hex,
  });
}

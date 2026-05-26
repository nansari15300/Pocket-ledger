"use client";

import type { CloudSyncDriveShareUser } from "@/lib/localCloudSync/types";
import { shareUsersToEmailList, readCloudSyncConfigFromCompany, readCloudSyncDriveShareUsers, shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import { toDriveFileRef, driveStoragePathForLogicalFile, remotePathFromDriveFileRef, pocketLedgerDriveCompanyIdPart } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { getLocalCompanyById, upsertLocalCompany, listLocalCompanies, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import {
  ensureCloudSyncDriveEncryptionSalt,
  encryptDriveFileBytesForUpload,
  decryptDriveFilePayloadFromDownload,
  readCloudSyncDriveEncryptionFromCompany,
} from "@/lib/localCloudSync/driveEncryption";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";

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
    const res = await postDriveJsonViaClient<{ remotePath?: string }>("/api/local-cloud-sync/drive/upload-backup", {
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

/** Drive path se company id — folder suffix match. */
async function resolveCompanyIdForDrivePath(remotePath: string): Promise<string | null> {
  const parts = String(remotePath || "").split("/").filter(Boolean);
  const seg = parts[1] || "";
  const idx = seg.lastIndexOf("__");
  const suffix = idx >= 0 ? seg.slice(idx + 2).trim() : seg.trim();
  if (!suffix) return null;
  const companies = await listLocalCompanies();
  for (const c of companies) {
    if (c.id === suffix || pocketLedgerDriveCompanyIdPart(c.id) === suffix) return c.id;
  }
  return null;
}

/** Attachment bytes upload — returns `drive:` ref (logical path; encrypt ON → `.plenc.json` on Drive). */
export async function uploadAttachmentBytesToDrive(input: {
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
    await postDriveJsonViaClient("/api/local-cloud-sync/drive/upload-json", {
      companyId: input.companyId,
      companyName: input.companyName,
      relativePath: storagePath,
      body: encBody,
      contentType: "application/json",
    });
    return toDriveFileRef(logicalPath);
  }

  const base64 = await blobToBase64(blob);
  const res = await postDriveJsonViaClient<{ remotePath: string }>("/api/local-cloud-sync/drive/upload-file", {
    companyId: input.companyId,
    companyName: input.companyName,
    remotePath: logicalPath,
    contentType: input.contentType || blob.type || "application/octet-stream",
    sha256Hex: input.sha256Hex,
    base64,
  });
  return toDriveFileRef(res.remotePath);
}

/** `drive:` ref se blob — preview / open; encrypted `.plenc.json` decrypt. */
export async function downloadDriveAttachmentBlob(
  remotePath: string,
  companyId?: string
): Promise<Blob | null> {
  const logicalPath = remotePathFromDriveFileRef(remotePath) ?? remotePath;
  const cid = companyId || (await resolveCompanyIdForDrivePath(logicalPath));
  const reg = cid ? await getLocalCompanyById(cid, { includeDeleted: true }) : null;
  const flags = readCloudSyncDriveEncryptionFromCompany(reg as Record<string, unknown>);

  const tryPaths = flags.encryptFiles
    ? [driveStoragePathForLogicalFile(logicalPath, true), logicalPath]
    : [logicalPath];

  for (const path of tryPaths) {
    const res = await postDriveJsonViaClient<{ base64: string | null; contentType?: string | null }>(
      "/api/local-cloud-sync/drive/download-file",
      { remotePath: path }
    );
    if (!res.base64) continue;
    if (cid && (path.endsWith(".plenc.json") || res.contentType?.includes("json"))) {
      try {
        const text = atob(res.base64);
        const { bytes, contentType } = await decryptDriveFilePayloadFromDownload(
          cid,
          text,
          reg as Record<string, unknown>
        );
        return new Blob([bytes], { type: contentType });
      } catch {
        /* plain fallback */
      }
    }
    return base64ToBlob(res.base64, res.contentType || "application/octet-stream");
  }
  return null;
}

/** Sync cycle ke baad configured staff ko company folder share — Drive par hamesha writer. */
export async function maybeShareDriveCompanyFolder(input: {
  companyId: string;
  companyName?: string;
  emails?: string[];
  users?: CloudSyncDriveShareUser[];
}): Promise<{ shared: string[]; skipped: string[] }> {
  const emails =
    input.users?.map((u) => u.email).filter(Boolean) ??
    (input.emails ?? []).filter((e) => e.includes("@"));
  if (!emails.length) return { shared: [], skipped: [] };
  if (!(await isGoogleDriveCloudSyncCompany(input.companyId))) return { shared: [], skipped: [] };
  const res = await postDriveJsonViaClient<{ shared?: string[]; skipped?: string[] }>(
    "/api/local-cloud-sync/drive/share-folder",
    {
      companyId: input.companyId,
      companyName: input.companyName,
      emails,
    }
  );
  const shared = res.shared ?? [];
  const skipped = res.skipped ?? [];
  if (shared.length > 0) {
    logLocalCloudSync("Drive folder shared", { companyId: input.companyId, count: shared.length });
  }
  if (skipped.length > 0) {
    warnLocalCloudSync("Drive folder share skipped", { companyId: input.companyId, skipped });
  }
  return { shared, skipped };
}

/** Ek user add/update par Drive share. */
export async function shareDriveFolderUser(input: {
  companyId: string;
  companyName?: string;
  user: CloudSyncDriveShareUser;
}): Promise<{ shared: string[]; skipped: string[] }> {
  const res = await postDriveJsonViaClient<{ shared?: string[]; skipped?: string[] }>(
    "/api/local-cloud-sync/drive/share-folder",
    {
      companyId: input.companyId,
      companyName: input.companyName,
      users: [input.user],
    }
  );
  const shared = res.shared ?? [];
  const skipped = res.skipped ?? [];
  if (skipped.includes(input.user.email.trim().toLowerCase())) {
    throw new Error(`Drive share failed for ${input.user.email}. Owner: Connect Drive and try Force sync.`);
  }
  return { shared, skipped };
}

/** List se user hatao — Drive permission revoke. */
export async function revokeDriveFolderShare(input: {
  companyId: string;
  companyName?: string;
  email: string;
}): Promise<void> {
  await postDriveJsonViaClient("/api/local-cloud-sync/drive/revoke-share", {
    companyId: input.companyId,
    companyName: input.companyName,
    email: input.email,
  });
}

export function readCloudSyncSharedEmails(company: Record<string, unknown> | null | undefined): string[] {
  const raw = company?.cloudSyncSharedEmails;
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => String(e || "").trim()).filter((e) => e.includes("@"));
}

/** Add local user + Drive share: encrypt ON, Gmail writer share, cloud sync enable. */
export async function enableDriveEncryptionAndShareEmail(input: {
  companyId: string;
  companyName?: string;
  shareEmail: string;
  appRole?: string;
}): Promise<void> {
  const cid = String(input.companyId || "").trim();
  const email = String(input.shareEmail || "")
    .trim()
    .toLowerCase();
  if (!cid || !email.includes("@")) {
    throw new Error("Valid Gmail required for Drive share.");
  }
  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) throw new Error("Local company not found.");

  const prevUsers = readCloudSyncDriveShareUsers(reg as Record<string, unknown>);
  const appRole =
    input.appRole != null && String(input.appRole).trim()
      ? String(input.appRole).trim().toLowerCase()
      : "manager";
  const shareUsers: CloudSyncDriveShareUser[] = prevUsers.some((u) => u.email === email)
    ? prevUsers.map((u) => (u.email === email ? { ...u, appRole } : u))
    : [...prevUsers, { email, appRole }];
  const salt = ensureCloudSyncDriveEncryptionSalt(
    String((reg as Record<string, unknown>).cloudSyncDriveEncryptionSalt ?? "")
  );

  await upsertLocalCompany({
    ...reg,
    cloudSyncEnabled: true,
    cloudSyncProvider: "google_drive",
    cloudSyncEncryptDrive: true,
    cloudSyncEncryptDriveData: true,
    cloudSyncEncryptDriveFiles: true,
    cloudSyncDriveEncryptionSalt: salt,
    cloudSyncSharedEmails: shareUsersToEmailList(shareUsers),
    cloudSyncDriveShareUsers: shareUsers,
  } as LocalCompanyDoc);

  const shareRes = await maybeShareDriveCompanyFolder({
    companyId: cid,
    companyName: input.companyName,
    users: shareUsers,
  });
  if (shareRes.skipped.length > 0 && shareRes.shared.length === 0) {
    throw new Error(
      `Could not share Drive folder with ${email}. Owner must connect Google Drive, then Force sync.`
    );
  }
}

/** Pending `local:` attachment → Drive path + `drive:` ref (voucher metadata se). */
export async function uploadPendingAttachmentPayloadToDrive(input: {
  companyId: string;
  companyName?: string;
  company?: Record<string, unknown> | null;
  collection: string;
  docId: string;
  field?: string;
  blob: Blob;
  contentType?: string;
  fileName?: string;
}): Promise<string> {
  let voucherType: unknown;
  let voucherNumber: unknown;
  let voucherDate: unknown;
  let itemCode: unknown;
  let itemId: unknown;
  let itemDate: unknown;
  const { getCompanyDocFromBrowserDb } = await import("@/lib/localCompanyDocMirror");
  if (input.collection === "vouchers") {
    const row = (await getCompanyDocFromBrowserDb(input.companyId, "vouchers", input.docId)) as Record<
      string,
      unknown
    > | null;
    if (row) {
      voucherType = row.voucherType ?? row.type;
      voucherNumber = row.voucherNumber ?? row.id;
      voucherDate = row.date ?? row.voucherDate ?? row.createdAt;
    }
  } else if (input.collection === "items") {
    const row = (await getCompanyDocFromBrowserDb(input.companyId, "items", input.docId)) as Record<
      string,
      unknown
    > | null;
    if (row) {
      itemCode = row.code ?? row.itemCode ?? row.sku;
      itemId = row.id ?? input.docId;
      itemDate = row.updatedAt ?? row.createdAt ?? Date.now();
    } else {
      itemId = input.docId;
      itemDate = Date.now();
    }
  } else {
    // Party / bank / staff documents — entity date se folder; pehle `general` fallback tha.
    const row = (await getCompanyDocFromBrowserDb(input.companyId, input.collection, input.docId)) as Record<
      string,
      unknown
    > | null;
    voucherNumber = row?.id ?? input.docId;
    voucherDate = row?.updatedAt ?? row?.createdAt ?? Date.now();
  }
  const {
    buildVoucherAttachmentDriveRemotePath,
    buildItemAttachmentDriveRemotePath,
    buildOpeningAvatarDriveRemotePath,
  } = await import("@/lib/localCloudSync/driveAttachmentPath");
  const { computeSha256HexFromBlob } = await import("@/lib/security/sha256Hex");
  const ref = { companyId: input.companyId, companyName: input.companyName };
  const avatarCollections = new Set(["parties", "bank_accounts", "staff", "company"]);
  const isAvatarField = input.field === "fileUrl" && avatarCollections.has(input.collection);
  const remotePath = isAvatarField
    ? buildOpeningAvatarDriveRemotePath({
        ref,
        collection: input.collection,
        entityId: input.docId,
        originalFileName: input.fileName,
      })
    : input.collection === "items"
      ? buildItemAttachmentDriveRemotePath({
          ref,
          itemCode,
          itemId,
          itemDate,
          originalFileName: input.fileName,
          company: input.company ?? null,
        })
      : buildVoucherAttachmentDriveRemotePath({
          ref,
          categoryFolder: input.collection,
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

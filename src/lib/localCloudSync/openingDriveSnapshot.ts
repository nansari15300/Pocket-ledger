"use client";

import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { encryptCloudSyncJsonForDrive } from "@/lib/localCloudSync/driveEncryption";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import { readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";
import {
  buildPocketLedgerDriveRelativePath,
  POCKET_LEDGER_OPENING_MASTER_SEGMENTS,
  POCKET_LEDGER_OPENING_SUB,
  isDriveFileRef,
  type PocketLedgerDriveCompanyRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { parseLocalCompanyUserRows, mergeOpeningUsersSnapshotIntoLocalCompanyUsers } from "@/lib/localCompanyUsers";
import { buildOpeningAvatarDriveRemotePath } from "@/lib/localCloudSync/driveAttachmentPath";
import { uploadAttachmentBytesToDrive } from "@/lib/localCloudSync/driveCloudSyncClient";
import { isLocalFileRef, getBlobFromLocalFileRef } from "@/lib/localPendingFiles";
import {
  decryptCloudSyncJsonFromDrive,
  type DriveEncryptedOpFile,
} from "@/lib/localCloudSync/driveEncryption";
import { PL_ENCRYPTED_V1_FIELD } from "@/lib/serverBackupEncryption";

/** Master collection → opening folder segment naam. */
const MASTER_COLLECTION_MAP: Record<string, string> = {
  parties: "parties",
  bank_accounts: "bank",
  staff: "staff",
  items: "items",
  expense_accounts: "expense",
  taxes: "tax",
};

function pickOpeningFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: row.id,
    name: row.name ?? row.displayName ?? row.accountName,
  };
  if (row.openingBalance != null) out.openingBalance = row.openingBalance;
  if (row.openingBalanceDate != null) out.openingBalanceDate = row.openingBalanceDate;
  if (row.openingBalanceNarration != null) out.openingBalanceNarration = row.openingBalanceNarration;
  if (row.openingStock != null) out.openingStock = row.openingStock;
  if (row.quantity != null) out.quantity = row.quantity;
  if (row.code != null) out.code = row.code;
  if (row.fileUrl != null) out.fileUrl = row.fileUrl;
  if (row.avatarUrl != null) out.avatarUrl = row.avatarUrl;
  return out;
}

/** Sync cycle par `opening/` tree update — masters + users JSON (sirf owner upload). */
export async function uploadOpeningSnapshotToDrive(companyId: string): Promise<number> {
  const cid = String(companyId || "").trim();
  if (!cid) return 0;
  if (!(await shouldUseLocalCloudSync(cid))) return 0;

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return 0;
  const postCloudJson = postDriveJsonViaClient;
  const uploadAttachmentBytes = uploadAttachmentBytesToDrive;
  const uploadJsonPath = "/api/local-cloud-sync/drive/upload-json";
  // Joined device owner ka snapshot overwrite na kare — sirf download side.
  if ((reg as { driveSharedJoin?: unknown }).driveSharedJoin === true) return 0;

  const ref: PocketLedgerDriveCompanyRef = {
    companyId: cid,
    companyName: typeof reg.name === "string" ? reg.name : undefined,
    driveSharedFolderId:
      typeof reg.cloudSyncDriveFolderId === "string" && reg.cloudSyncDriveFolderId.trim()
        ? reg.cloudSyncDriveFolderId.trim()
        : undefined,
  };

  const files: Array<{ relativePath: string; body: Record<string, unknown> }> = [];
  let uploaded = 0;

  for (const segment of POCKET_LEDGER_OPENING_MASTER_SEGMENTS) {
    const collection = Object.entries(MASTER_COLLECTION_MAP).find(([, s]) => s === segment)?.[0];
    if (!collection) continue;
    const rows = await listCompanyDocsFromBrowserDb(cid, collection, { forBackupMerge: true });
    const openingRows = rows
      .filter((r) => r && typeof r === "object" && (r as Record<string, unknown>).isDeleted !== true)
      .map((r) => pickOpeningFields(r as Record<string, unknown>));
    if (openingRows.length === 0) continue;
    const relativePath = buildPocketLedgerDriveRelativePath(
      ref,
      "opening",
      POCKET_LEDGER_OPENING_SUB.masters,
      segment,
      "opening.json"
    );
    files.push({ relativePath, body: { updatedAt: Date.now(), rows: openingRows } });
  }

  // Password bhi — encrypt JSON ke andar; shared devices login ke liye.
  const users = parseLocalCompanyUserRows((reg as { localCompanyUsers?: unknown }).localCompanyUsers).map((u) => ({
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    password: u.password,
  }));
  if (users.length > 0) {
    files.push({
      relativePath: buildPocketLedgerDriveRelativePath(
        ref,
        "opening",
        POCKET_LEDGER_OPENING_SUB.users,
        "users.json"
      ),
      body: { updatedAt: Date.now(), users },
    });
  }

  if (typeof reg.logoUrl === "string" && reg.logoUrl.trim()) {
    if (isLocalFileRef(reg.logoUrl)) {
      const blob = await getBlobFromLocalFileRef(reg.logoUrl);
      if (blob) {
        const remotePath = buildOpeningAvatarDriveRemotePath({
          ref,
          collection: "company",
          entityId: cid,
          originalFileName: "logo",
        });
        const driveRef = await uploadAttachmentBytes({
          companyId: cid,
          companyName: ref.companyName,
          remotePath,
          bytes: blob,
          contentType: blob.type || "image/png",
        });
        if (driveRef && !isDriveFileRef(String(reg.logoUrl))) {
          await upsertLocalCompany({ ...reg, logoUrl: driveRef, updatedAt: Date.now() });
        }
        uploaded += 1;
      }
    } else if (!reg.logoUrl.startsWith("drive:")) {
      files.push({
        relativePath: buildPocketLedgerDriveRelativePath(
          ref,
          "opening",
          POCKET_LEDGER_OPENING_SUB.avatars,
          "company-logo.url.json"
        ),
        body: { logoUrl: reg.logoUrl, updatedAt: Date.now() },
      });
    }
  }

  for (const f of files) {
    const plainJson = JSON.stringify(f.body);
    const bodyPayload = await encryptCloudSyncJsonForDrive(cid, plainJson, reg as Record<string, unknown>);
    const body = typeof bodyPayload === "string" ? bodyPayload : JSON.stringify(bodyPayload);
    await postCloudJson(uploadJsonPath, {
      companyId: cid,
      companyName: ref.companyName,
      driveSharedFolderId: ref.driveSharedFolderId,
      relativePath: f.relativePath,
      body,
      contentType: "application/json",
    });
    uploaded += 1;
  }

  if (uploaded > 0) {
    logLocalCloudSync("opening snapshot uploaded", { companyId: cid, uploaded });
  }
  return uploaded;
}

const OPENING_USERS_BRANCH_PATH = `opening/${POCKET_LEDGER_OPENING_SUB.users}/users.json`;

function base64ToUtf8Text(base64: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Shared / owner — Drive se `opening/users/users.json` download karke local login passwords merge. */
export async function downloadAndMergeOpeningUsersFromDrive(
  companyId: string,
  ref: PocketLedgerDriveCompanyRef
): Promise<boolean> {
  const cid = String(companyId || "").trim();
  if (!cid) return false;

  const regForDl = await getLocalCompanyById(cid, { includeDeleted: true });
  const postDlJson = postDriveJsonViaClient;
  const downloadPath = "/api/local-cloud-sync/drive/download-file";

  let dl: { base64: string | null; contentType?: string | null };
  try {
    dl = await postDlJson<{ base64: string | null; contentType?: string | null }>(downloadPath, {
      companyId: cid,
      companyName: ref.companyName,
      driveSharedFolderId: ref.driveSharedFolderId,
      branchRelativePath: OPENING_USERS_BRANCH_PATH,
    });
  } catch {
    return false;
  }
  if (!dl.base64) return false;

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return false;

  let plainJson: string;
  try {
    const text = base64ToUtf8Text(dl.base64);
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>)[PL_ENCRYPTED_V1_FIELD] === true) {
      plainJson = await decryptCloudSyncJsonFromDrive(cid, parsed as DriveEncryptedOpFile, reg as Record<string, unknown>);
    } else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { users?: unknown }).users)) {
      plainJson = text;
    } else {
      plainJson = text;
    }
  } catch {
    return false;
  }

  let body: { users?: unknown };
  try {
    body = JSON.parse(plainJson) as { users?: unknown };
  } catch {
    return false;
  }
  if (!Array.isArray(body.users) || body.users.length === 0) return false;

  const prev = parseLocalCompanyUserRows((reg as { localCompanyUsers?: unknown }).localCompanyUsers);
  const merged = mergeOpeningUsersSnapshotIntoLocalCompanyUsers(prev, body.users as Parameters<
    typeof mergeOpeningUsersSnapshotIntoLocalCompanyUsers
  >[1]);
  if (JSON.stringify(prev) === JSON.stringify(merged)) return false;

  await upsertLocalCompany({
    ...reg,
    localCompanyUsers: merged,
    updatedAt: Date.now(),
  } as Parameters<typeof upsertLocalCompany>[0]);
  logLocalCloudSync("opening users merged from Drive", { companyId: cid, count: body.users.length });
  return true;
}

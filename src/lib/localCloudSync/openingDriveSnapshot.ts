"use client";

import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { encryptCloudSyncJsonForDrive } from "@/lib/localCloudSync/driveEncryption";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
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
import { uploadAttachmentBytesToDrive, uploadPendingAttachmentPayloadToDrive } from "@/lib/localCloudSync/driveCloudSyncClient";
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

const FIREBASE_STORAGE_HOST = /^https:\/\/firebasestorage\.googleapis\.com/i;

/** Party/staff avatar bytes → Drive `opening/avatars/...`; galat Firebase URL migrate. */
async function ensureOpeningAvatarOnDriveForRow(
  cid: string,
  collection: string,
  row: Record<string, unknown>,
  ref: PocketLedgerDriveCompanyRef,
  reg: NonNullable<Awaited<ReturnType<typeof getLocalCompanyById>>>
): Promise<{ driveRef: string | null; avatarBytesUploaded: number }> {
  const entityId = String(row.id ?? "").trim();
  if (!entityId) return { driveRef: null, avatarBytesUploaded: 0 };

  const field: "fileUrl" | "avatarUrl" =
    row.fileUrl != null && String(row.fileUrl).trim() ? "fileUrl" : "avatarUrl";
  const rawUrl = row[field];
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { driveRef: null, avatarBytesUploaded: 0 };
  }
  const url = rawUrl.trim();
  if (isDriveFileRef(url)) return { driveRef: url, avatarBytesUploaded: 0 };

  let blob: Blob | null = null;
  if (isLocalFileRef(url)) {
    blob = await getBlobFromLocalFileRef(url, { companyId: cid });
  } else if (FIREBASE_STORAGE_HOST.test(url)) {
    try {
      const res = await fetch(url);
      if (res.ok) blob = await res.blob();
    } catch {
      blob = null;
    }
  } else {
    return { driveRef: url, avatarBytesUploaded: 0 };
  }

  if (!blob || blob.size <= 0) return { driveRef: null, avatarBytesUploaded: 0 };

  const driveRef = await uploadPendingAttachmentPayloadToDrive({
    companyId: cid,
    companyName: ref.companyName,
    company: reg as Record<string, unknown>,
    collection,
    docId: entityId,
    field,
    blob,
    contentType: blob.type || "image/jpeg",
  });

  const { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb, notifyBrowserDbCollectionUpdated } =
    await import("@/lib/localCompanyDocMirror");
  const existing = await getCompanyDocFromBrowserDb(cid, collection, entityId, { includeDeleted: true });
  if (existing) {
    await upsertCompanyDocInBrowserDb(
      cid,
      collection,
      entityId,
      { ...existing, [field]: driveRef },
      { notify: true, force: true }
    );
    notifyBrowserDbCollectionUpdated(cid, collection);
  }

  return { driveRef, avatarBytesUploaded: 1 };
}

/** Sync cycle par `opening/` tree update — masters + users JSON (sirf owner upload). */
export async function uploadOpeningSnapshotToDrive(companyId: string): Promise<{
  /** Party/staff/logo avatar bytes is cycle me naye upload hue. */
  attachmentFiles: number;
  jsonSegments: number;
}> {
  const cid = String(companyId || "").trim();
  if (!cid) return { attachmentFiles: 0, jsonSegments: 0 };
  if (!(await shouldUseLocalCloudSync(cid))) return { attachmentFiles: 0, jsonSegments: 0 };

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return { attachmentFiles: 0, jsonSegments: 0 };
  // Joined device owner ka snapshot overwrite na kare — sirf download side.
  if ((reg as { driveSharedJoin?: unknown }).driveSharedJoin === true) {
    return { attachmentFiles: 0, jsonSegments: 0 };
  }

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
  let avatarBytesUploaded = 0;

  for (const segment of POCKET_LEDGER_OPENING_MASTER_SEGMENTS) {
    const collection = Object.entries(MASTER_COLLECTION_MAP).find(([, s]) => s === segment)?.[0];
    if (!collection) continue;
    const rows = await listCompanyDocsFromBrowserDb(cid, collection, { forBackupMerge: true });
    const openingRows: Record<string, unknown>[] = [];
    for (const r of rows) {
      if (!r || typeof r !== "object" || (r as Record<string, unknown>).isDeleted === true) continue;
      const row = r as Record<string, unknown>;
      const avatarField =
        row.fileUrl != null && String(row.fileUrl).trim()
          ? "fileUrl"
          : row.avatarUrl != null && String(row.avatarUrl).trim()
            ? "avatarUrl"
            : null;
      let picked = pickOpeningFields(row);
      if (
        avatarField &&
        (isLocalFileRef(String(row[avatarField])) || FIREBASE_STORAGE_HOST.test(String(row[avatarField])))
      ) {
        const { driveRef, avatarBytesUploaded: n } = await ensureOpeningAvatarOnDriveForRow(
          cid,
          collection,
          row,
          ref,
          reg
        );
        avatarBytesUploaded += n;
        if (driveRef) {
          picked = { ...picked, [avatarField]: driveRef };
        } else if (avatarField) {
          picked = { ...picked, [avatarField]: row[avatarField] };
        }
      } else if (avatarField === "fileUrl" && FIREBASE_STORAGE_HOST.test(String(row.fileUrl ?? ""))) {
        delete picked.fileUrl;
      }
      openingRows.push(picked);
    }
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
        const driveRef = await uploadAttachmentBytesToDrive({
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
    await postDriveJsonViaClient("/api/local-cloud-sync/drive/upload-json", {
      companyId: cid,
      companyName: ref.companyName,
      relativePath: f.relativePath,
      body,
      contentType: "application/json",
    });
    uploaded += 1;
  }

  if (uploaded > 0 || avatarBytesUploaded > 0) {
    logLocalCloudSync("opening snapshot uploaded", { companyId: cid, uploaded, avatarBytesUploaded });
  }
  return { attachmentFiles: avatarBytesUploaded, jsonSegments: uploaded };
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

  let dl: { base64: string | null; contentType?: string | null };
  try {
    dl = await postDriveJsonViaClient<{ base64: string | null; contentType?: string | null }>(
      "/api/local-cloud-sync/drive/download-file",
      {
        companyId: cid,
        companyName: ref.companyName,
        driveSharedFolderId: ref.driveSharedFolderId,
        branchRelativePath: OPENING_USERS_BRANCH_PATH,
      }
    );
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

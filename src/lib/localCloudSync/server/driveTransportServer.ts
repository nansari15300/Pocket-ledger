import "server-only";

import { google } from "googleapis";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import type { CloudSyncManifest, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";
import {
  LEGACY_DRIVE_SYNC_ROOT,
  POCKET_LEDGER_DRIVE_BRANCH,
  POCKET_LEDGER_DRIVE_ROOT,
  buildPocketLedgerDriveRelativePath,
  legacyDriveCompanyFolderSegment,
  pocketLedgerCompanyFolderSegment,
  pocketLedgerDriveBackupFileName,
  type PocketLedgerDriveCompanyRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";

type DriveTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number | null;
};

async function loadDriveTokens(uid: string): Promise<DriveTokens> {
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin not configured for Drive sync");
  }
  const db = getAdminDb();
  const snap = await db.collection("user_tokens").doc(uid).collection("google").doc("drive").get();
  if (!snap.exists) throw new Error("Google Drive not connected");
  const d = snap.data() as Record<string, unknown>;
  const accessToken = String(d.accessToken || "");
  if (!accessToken) throw new Error("Google Drive access token missing");
  return {
    accessToken,
    refreshToken: d.refreshToken ? String(d.refreshToken) : null,
    expiryDate: typeof d.expiryDate === "number" ? d.expiryDate : null,
  };
}

function oauthClient(tokens: DriveTokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  );
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? undefined,
    expiry_date: tokens.expiryDate ?? undefined,
  });
  return client;
}

function opFileName(opSeq: number): string {
  return `op_${String(opSeq).padStart(6, "0")}.json`;
}

function toCompanyRef(companyId: string, companyName?: string): PocketLedgerDriveCompanyRef {
  return { companyId, companyName: companyName?.trim() || undefined };
}

async function findChildFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string
): Promise<string | null> {
  const q = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  const id = res.data.files?.[0]?.id;
  return id ?? null;
}

async function ensureFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await findChildFolder(drive, parentId, name);
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id!;
}

/** `Pocket Ledger/` root — naya unified layout. */
async function ensurePocketLedgerRoot(drive: ReturnType<typeof google.drive>): Promise<string> {
  return ensureFolder(drive, "root", POCKET_LEDGER_DRIVE_ROOT);
}

/** `Pocket Ledger/{CompanyName__id}/` */
async function ensureCompanyRootFolder(
  drive: ReturnType<typeof google.drive>,
  ref: PocketLedgerDriveCompanyRef
): Promise<string> {
  const rootId = await ensurePocketLedgerRoot(drive);
  return ensureFolder(drive, rootId, pocketLedgerCompanyFolderSegment(ref));
}

/** Company ke andar branch: backup | data | attachments */
async function ensureCompanyBranchFolder(
  drive: ReturnType<typeof google.drive>,
  ref: PocketLedgerDriveCompanyRef,
  branch: keyof typeof POCKET_LEDGER_DRIVE_BRANCH
): Promise<string> {
  const companyFolderId = await ensureCompanyRootFolder(drive, ref);
  return ensureFolder(drive, companyFolderId, POCKET_LEDGER_DRIVE_BRANCH[branch]);
}

/** Live sync: `.../data/ops/` */
async function ensureCompanyDataOpsFolder(
  drive: ReturnType<typeof google.drive>,
  ref: PocketLedgerDriveCompanyRef
): Promise<string> {
  const dataFolderId = await ensureCompanyBranchFolder(drive, ref, "data");
  return ensureFolder(drive, dataFolderId, "ops");
}

/** Purana layout folder — sirf read fallback. */
async function findLegacyCompanyFolder(
  drive: ReturnType<typeof google.drive>,
  companyId: string
): Promise<string | null> {
  const legacyRootId = await findChildFolder(drive, "root", LEGACY_DRIVE_SYNC_ROOT);
  if (!legacyRootId) return null;
  return findChildFolder(drive, legacyRootId, legacyDriveCompanyFolderSegment(companyId));
}

async function readJsonFileByName(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  fileName: string
): Promise<Record<string, unknown> | null> {
  const q = `'${folderId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  const fileId = list.data.files?.[0]?.id;
  if (!fileId) return null;
  const media = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
  const text = typeof media.data === "string" ? media.data : JSON.stringify(media.data);
  return JSON.parse(text) as Record<string, unknown>;
}

/** `Pocket Ledger/{CompanyName__id}/` — read-only lookup (create nahi). */
async function findCompanyRootFolder(
  drive: ReturnType<typeof google.drive>,
  ref: PocketLedgerDriveCompanyRef
): Promise<string | null> {
  const rootId = await findChildFolder(drive, "root", POCKET_LEDGER_DRIVE_ROOT);
  if (!rootId) return null;
  return findChildFolder(drive, rootId, pocketLedgerCompanyFolderSegment(ref));
}

/** Branch folder sirf dhoondho — GET manifest/ops par empty tree mat banao. */
async function findCompanyBranchFolder(
  drive: ReturnType<typeof google.drive>,
  ref: PocketLedgerDriveCompanyRef,
  branch: keyof typeof POCKET_LEDGER_DRIVE_BRANCH
): Promise<string | null> {
  const companyFolderId = await findCompanyRootFolder(drive, ref);
  if (!companyFolderId) return null;
  return findChildFolder(drive, companyFolderId, POCKET_LEDGER_DRIVE_BRANCH[branch]);
}

/** Manifest: pehle naya `data/`, warna legacy company root. */
async function readManifestRaw(
  drive: ReturnType<typeof google.drive>,
  ref: PocketLedgerDriveCompanyRef
): Promise<Record<string, unknown> | null> {
  const dataFolderId = await findCompanyBranchFolder(drive, ref, "data");
  if (dataFolderId) {
    const fromNew = await readJsonFileByName(drive, dataFolderId, "manifest.json");
    if (fromNew) return fromNew;
  }

  const legacyCompanyFolder = await findLegacyCompanyFolder(drive, ref.companyId);
  if (!legacyCompanyFolder) return null;
  return readJsonFileByName(drive, legacyCompanyFolder, "manifest.json");
}

/** Ops folder: naya data/ops ya purana legacy company_{id}/ops. */
async function resolveOpsFolderForRead(
  drive: ReturnType<typeof google.drive>,
  ref: PocketLedgerDriveCompanyRef
): Promise<string | null> {
  const dataFolderId = await findCompanyBranchFolder(drive, ref, "data");
  if (dataFolderId) {
    const newOpsId = await findChildFolder(drive, dataFolderId, "ops");
    if (newOpsId) {
      const q = `'${newOpsId}' in parents and mimeType = 'application/json' and trashed = false`;
      const res = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
      if ((res.data.files ?? []).length > 0) return newOpsId;
    }
  }

  const legacyCompanyFolder = await findLegacyCompanyFolder(drive, ref.companyId);
  if (legacyCompanyFolder) {
    const legacyOps = await findChildFolder(drive, legacyCompanyFolder, "ops");
    if (legacyOps) return legacyOps;
  }

  return null;
}

export async function driveGetManifest(
  uid: string,
  companyId: string,
  companyName?: string
): Promise<CloudSyncManifest> {
  const ref = toCompanyRef(companyId, companyName);
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const raw = await readManifestRaw(drive, ref);
  if (!raw) return { latestOp: 0 };
  return {
    latestOp: Number(raw.latestOp) || 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : undefined,
  };
}

export async function driveUpdateManifest(
  uid: string,
  companyId: string,
  manifest: CloudSyncManifest,
  companyName?: string
): Promise<void> {
  const ref = toCompanyRef(companyId, companyName);
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const dataFolderId = await ensureCompanyBranchFolder(drive, ref, "data");
  const body = JSON.stringify({ ...manifest, updatedAt: Date.now() });
  const q = `'${dataFolderId}' in parents and name = 'manifest.json' and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  const existingId = list.data.files?.[0]?.id;
  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media: { mimeType: "application/json", body },
    });
    return;
  }
  await drive.files.create({
    requestBody: { name: "manifest.json", parents: [dataFolderId] },
    media: { mimeType: "application/json", body },
  });
}

export async function driveUploadOperation(
  uid: string,
  op: LocalCloudSyncOperation,
  companyName?: string
): Promise<void> {
  const ref = toCompanyRef(op.companyId, companyName);
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const opsFolder = await ensureCompanyDataOpsFolder(drive, ref);
  const name = opFileName(op.opSeq);
  const body = JSON.stringify(op);
  const q = `'${opsFolder}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  const existingId = list.data.files?.[0]?.id;
  if (existingId) {
    await drive.files.update({ fileId: existingId, media: { mimeType: "application/json", body } });
  } else {
    await drive.files.create({
      requestBody: { name, parents: [opsFolder] },
      media: { mimeType: "application/json", body },
    });
  }
}

export async function driveDownloadOperations(
  uid: string,
  companyId: string,
  afterOpSeq: number,
  companyName?: string
): Promise<LocalCloudSyncOperation[]> {
  const ref = toCompanyRef(companyId, companyName);
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const opsFolder = await resolveOpsFolderForRead(drive, ref);
  if (!opsFolder) return [];
  const q = `'${opsFolder}' in parents and mimeType = 'application/json' and trashed = false`;
  const res = await drive.files.list({ q, fields: "files(id,name)", pageSize: 200 });
  const files = res.data.files ?? [];
  const out: LocalCloudSyncOperation[] = [];
  for (const f of files) {
    const name = String(f.name || "");
    const m = /^op_(\d+)\.json$/i.exec(name);
    if (!m) continue;
    const seq = Number(m[1]);
    if (!Number.isFinite(seq) || seq <= afterOpSeq) continue;
    if (!f.id) continue;
    const media = await drive.files.get({ fileId: f.id, alt: "media" }, { responseType: "text" });
    const text = typeof media.data === "string" ? media.data : JSON.stringify(media.data);
    out.push(JSON.parse(text) as LocalCloudSyncOperation);
  }
  out.sort((a, b) => a.opSeq - b.opSeq);
  return out;
}

async function upsertBinaryFileInFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  fileName: string,
  body: Buffer,
  mimeType: string
): Promise<void> {
  const q = `'${folderId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  const existingId = list.data.files?.[0]?.id;
  const media = { mimeType, body: body as unknown as string };
  if (existingId) {
    await drive.files.update({ fileId: existingId, media });
    return;
  }
  await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media,
  });
}

/** Remote path ke folder chain walk karke file id — download ke liye. */
async function resolveFileIdByRemotePath(
  drive: ReturnType<typeof google.drive>,
  remotePath: string
): Promise<string | null> {
  const parts = String(remotePath || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 4 || parts[0] !== POCKET_LEDGER_DRIVE_ROOT) return null;
  const fileName = parts[parts.length - 1]!;
  const folderParts = parts.slice(2, -1);
  let parentId = await findChildFolder(drive, "root", POCKET_LEDGER_DRIVE_ROOT);
  if (!parentId) return null;
  parentId = await findChildFolder(drive, parentId, parts[1]!);
  if (!parentId) return null;
  for (const seg of folderParts) {
    const next = await findChildFolder(drive, parentId, seg);
    if (!next) return null;
    parentId = next;
  }
  const q = `'${parentId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  return list.data.files?.[0]?.id ?? null;
}

/** Attachment / backup bytes upload — parent folders ensure. */
async function ensureNestedFolderChain(
  drive: ReturnType<typeof google.drive>,
  startFolderId: string,
  segments: string[]
): Promise<string> {
  let parentId = startFolderId;
  for (const seg of segments) {
    parentId = await ensureFolder(drive, parentId, seg);
  }
  return parentId;
}

export async function driveUploadBackupFile(
  uid: string,
  companyId: string,
  companyName: string | undefined,
  fileName: string,
  base64: string
): Promise<{ remotePath: string }> {
  const ref = toCompanyRef(companyId, companyName);
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const backupFolderId = await ensureCompanyBranchFolder(drive, ref, "backup");
  const buf = Buffer.from(base64, "base64");
  const safeName = fileName.trim() || pocketLedgerDriveBackupFileName(new Date().toISOString().replace(/[:.]/g, "-"));
  await upsertBinaryFileInFolder(drive, backupFolderId, safeName, buf, "application/octet-stream");
  // Latest pointer — restore UI baad me isi se pick kar sake.
  await upsertBinaryFileInFolder(drive, backupFolderId, "latest.plbp", buf, "application/octet-stream");
  return { remotePath: buildPocketLedgerDriveRelativePath(ref, "backup", safeName) };
}

export async function driveUploadAttachmentFile(
  uid: string,
  remotePath: string,
  base64: string,
  contentType?: string,
  sha256Hex?: string
): Promise<{ remotePath: string; deduped?: boolean }> {
  void sha256Hex;
  const parts = String(remotePath || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 4 || parts[0] !== POCKET_LEDGER_DRIVE_ROOT) {
    throw new Error("Invalid Pocket Ledger attachment path");
  }
  const fileName = parts[parts.length - 1]!;
  const folderSegments = parts.slice(2, -1);
  const companySegment = parts[1]!;
  const ref: PocketLedgerDriveCompanyRef = {
    companyId: companySegment.includes("__") ? companySegment.slice(companySegment.lastIndexOf("__") + 2) : companySegment,
    companyName: companySegment.includes("__") ? companySegment.slice(0, companySegment.lastIndexOf("__")) : undefined,
  };
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const attachmentsRoot = await ensureCompanyBranchFolder(drive, ref, "attachments");
  const targetFolderId = await ensureNestedFolderChain(drive, attachmentsRoot, folderSegments.slice(1));
  const buf = Buffer.from(base64, "base64");
  await upsertBinaryFileInFolder(drive, targetFolderId, fileName, buf, contentType || "application/octet-stream");
  return { remotePath };
}

export async function driveDownloadFileByRemotePath(
  uid: string,
  remotePath: string
): Promise<{ base64: string; contentType: string } | null> {
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const fileId = await resolveFileIdByRemotePath(drive, remotePath);
  if (!fileId) return null;
  const meta = await drive.files.get({ fileId, fields: "mimeType" });
  const media = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  const buf = Buffer.from(media.data as ArrayBuffer);
  return {
    base64: buf.toString("base64"),
    contentType: String(meta.data.mimeType || "application/octet-stream"),
  };
}

/** Company root folder staff emails ko writer — multi-device / shared user. */
export async function driveShareCompanyFolder(
  uid: string,
  companyId: string,
  companyName: string | undefined,
  emails: string[]
): Promise<{ shared: string[]; skipped: string[] }> {
  const ref = toCompanyRef(companyId, companyName);
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const folderId = await ensureCompanyRootFolder(drive, ref);
  const shared: string[] = [];
  const skipped: string[] = [];
  for (const raw of emails) {
    const email = String(raw || "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) {
      skipped.push(String(raw || ""));
      continue;
    }
    try {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: email,
        },
        sendNotificationEmail: false,
      });
      shared.push(email);
    } catch {
      skipped.push(email);
    }
  }
  return { shared, skipped };
}

/** Backup branch ensure — `.plbp` upload helper (folder id return). */
export async function driveEnsureCompanyBackupFolder(
  uid: string,
  companyId: string,
  companyName?: string
): Promise<string> {
  const ref = toCompanyRef(companyId, companyName);
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  return ensureCompanyBranchFolder(drive, ref, "backup");
}

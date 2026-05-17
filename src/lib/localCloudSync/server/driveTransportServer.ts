import "server-only";

import { google } from "googleapis";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import type { CloudSyncManifest, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";

const SYNC_ROOT = "accounting-sync";

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

function companyFolderName(companyId: string): string {
  return `company_${companyId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function opFileName(opSeq: number): string {
  return `op_${String(opSeq).padStart(6, "0")}.json`;
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

async function ensureCompanyOpsFolder(drive: ReturnType<typeof google.drive>, companyId: string): Promise<string> {
  const rootId = await ensureFolder(drive, "root", SYNC_ROOT);
  const companyId_folder = await ensureFolder(drive, rootId, companyFolderName(companyId));
  return ensureFolder(drive, companyId_folder, "ops");
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

export async function driveGetManifest(uid: string, companyId: string): Promise<CloudSyncManifest> {
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const companyFolder = await ensureFolder(drive, await ensureFolder(drive, "root", SYNC_ROOT), companyFolderName(companyId));
  const raw = await readJsonFileByName(drive, companyFolder, "manifest.json");
  if (!raw) return { latestOp: 0 };
  return {
    latestOp: Number(raw.latestOp) || 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : undefined,
  };
}

export async function driveUpdateManifest(uid: string, companyId: string, manifest: CloudSyncManifest): Promise<void> {
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const companyFolder = await ensureFolder(drive, await ensureFolder(drive, "root", SYNC_ROOT), companyFolderName(companyId));
  const body = JSON.stringify({ ...manifest, updatedAt: Date.now() });
  const q = `'${companyFolder}' in parents and name = 'manifest.json' and trashed = false`;
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
    requestBody: { name: "manifest.json", parents: [companyFolder] },
    media: { mimeType: "application/json", body },
  });
}

export async function driveUploadOperation(uid: string, op: LocalCloudSyncOperation): Promise<void> {
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const opsFolder = await ensureCompanyOpsFolder(drive, op.companyId);
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
  afterOpSeq: number
): Promise<LocalCloudSyncOperation[]> {
  const tokens = await loadDriveTokens(uid);
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: "v3", auth });
  const opsFolder = await ensureCompanyOpsFolder(drive, companyId);
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

import "server-only";

import {
  POCKET_LEDGER_DRIVE_BRANCH,
  POCKET_LEDGER_DRIVE_ROOT,
  buildPocketLedgerDriveRelativePath,
  pocketLedgerCompanyFolderSegmentCandidates,
  type PocketLedgerDriveCompanyRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import type {
  CloudSyncManifest,
  DropboxSharedCompanyListItem,
  LocalCloudSyncOperation,
} from "@/lib/localCloudSync/types";
import { parsePocketLedgerCompanyFolderSegment } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { getDropboxAccessTokenForUid } from "@/lib/localCloudSync/server/dropboxOAuthServer";

type DropboxCompanyRef = PocketLedgerDriveCompanyRef & { dropboxCompanyPath?: string };

function toCompanyRef(
  companyId: string,
  companyName?: string,
  dropboxCompanyPath?: string
): DropboxCompanyRef {
  return {
    companyId,
    companyName: companyName?.trim() || undefined,
    dropboxCompanyPath: dropboxCompanyPath?.trim() || undefined,
  };
}

function toDropboxPath(remotePath: string): string {
  const p = String(remotePath || "").trim().replace(/\\/g, "/");
  if (!p) throw new Error("empty Dropbox path");
  return p.startsWith("/") ? p : `/${p}`;
}

function dropboxErrorSummary(err: unknown): string {
  if (err && typeof err === "object" && "error" in err) {
    const e = err as { error?: { error_summary?: string } };
    return String(e.error?.error_summary || "");
  }
  return String(err || "");
}

function isDropboxNotFound(err: unknown): boolean {
  const s = dropboxErrorSummary(err).toLowerCase();
  return s.includes("not_found") || s.includes("path_lookup");
}

function isDropboxFolderConflict(err: unknown): boolean {
  return dropboxErrorSummary(err).toLowerCase().includes("path/conflict/folder");
}

async function dropboxRpc<T>(accessToken: string, endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error_summary?: string };
  if (!res.ok) {
    throw Object.assign(new Error(json.error_summary || res.statusText || "Dropbox API error"), { dropbox: json });
  }
  return json;
}

async function ensureDropboxFolderChain(accessToken: string, folderPath: string): Promise<void> {
  const full = toDropboxPath(folderPath);
  const parts = full.split("/").filter(Boolean);
  if (parts.length === 0) return;
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    try {
      await dropboxRpc(accessToken, "files/create_folder_v2", { path: current, autorename: false });
    } catch (e) {
      if (!isDropboxFolderConflict(e)) throw e;
    }
  }
}

async function dropboxPathExists(accessToken: string, path: string): Promise<boolean> {
  try {
    await dropboxRpc(accessToken, "files/get_metadata", { path: toDropboxPath(path) });
    return true;
  } catch (e) {
    if (isDropboxNotFound(e)) return false;
    throw e;
  }
}

async function resolveCompanyFolderPath(
  accessToken: string,
  ref: DropboxCompanyRef,
  mode: "ensure" | "find"
): Promise<string | null> {
  const pinned = String(ref.dropboxCompanyPath || "").trim();
  if (pinned) {
    const path = toDropboxPath(pinned);
    if (mode === "find") {
      return (await dropboxPathExists(accessToken, path)) ? path : null;
    }
    await ensureDropboxFolderChain(accessToken, path);
    return path;
  }
  const root = `/${POCKET_LEDGER_DRIVE_ROOT}`;
  if (mode === "ensure") {
    await ensureDropboxFolderChain(accessToken, root);
  } else if (!(await dropboxPathExists(accessToken, root))) {
    return null;
  }

  const candidates = pocketLedgerCompanyFolderSegmentCandidates(ref);
  for (const seg of candidates) {
    const path = `${root}/${seg}`;
    if (await dropboxPathExists(accessToken, path)) return path;
  }
  if (mode === "find") return null;
  const created = `${root}/${candidates[0]!}`;
  await ensureDropboxFolderChain(accessToken, created);
  return created;
}

async function ensureCompanyBranchPath(
  accessToken: string,
  ref: PocketLedgerDriveCompanyRef,
  branch: keyof typeof POCKET_LEDGER_DRIVE_BRANCH
): Promise<string> {
  const companyPath = await resolveCompanyFolderPath(accessToken, ref, "ensure");
  if (!companyPath) throw new Error("Failed to resolve Dropbox company folder");
  const branchPath = `${companyPath}/${POCKET_LEDGER_DRIVE_BRANCH[branch]}`;
  await ensureDropboxFolderChain(accessToken, branchPath);
  return branchPath;
}

async function findCompanyBranchPath(
  accessToken: string,
  ref: PocketLedgerDriveCompanyRef,
  branch: keyof typeof POCKET_LEDGER_DRIVE_BRANCH
): Promise<string | null> {
  const companyPath = await resolveCompanyFolderPath(accessToken, ref, "find");
  if (!companyPath) return null;
  const branchPath = `${companyPath}/${POCKET_LEDGER_DRIVE_BRANCH[branch]}`;
  if (await dropboxPathExists(accessToken, branchPath)) return branchPath;
  return null;
}

function opFileName(opSeq: number): string {
  return `op_${String(opSeq).padStart(6, "0")}.json`;
}

async function dropboxUploadBytes(
  accessToken: string,
  filePath: string,
  buf: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  void contentType;
  const path = toDropboxPath(filePath);
  const parent = path.split("/").slice(0, -1).join("/") || "/";
  await ensureDropboxFolderChain(accessToken, parent);
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path,
        mode: { ".tag": "overwrite" },
        autorename: false,
      }),
    },
    body: new Uint8Array(buf),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Dropbox upload failed: ${errText}`);
  }
}

async function dropboxDownloadBytes(accessToken: string, filePath: string): Promise<Buffer | null> {
  const path = toDropboxPath(filePath);
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });
  if (res.status === 409) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (errText.toLowerCase().includes("not_found")) return null;
    throw new Error(`Dropbox download failed: ${errText || res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function dropboxReadJson(accessToken: string, filePath: string): Promise<Record<string, unknown> | null> {
  const buf = await dropboxDownloadBytes(accessToken, filePath);
  if (!buf) return null;
  return JSON.parse(buf.toString("utf-8")) as Record<string, unknown>;
}

async function dropboxListFileNames(accessToken: string, folderPath: string): Promise<string[]> {
  const path = toDropboxPath(folderPath);
  const names: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = cursor
      ? await dropboxRpc<{
          entries?: Array<{ [".tag"]?: string; name?: string }>;
          has_more?: boolean;
          cursor?: string;
        }>(accessToken, "files/list_folder/continue", { cursor })
      : await dropboxRpc<{
          entries?: Array<{ [".tag"]?: string; name?: string }>;
          has_more?: boolean;
          cursor?: string;
        }>(accessToken, "files/list_folder", { path, recursive: false });
    for (const ent of res.entries ?? []) {
      if (ent[".tag"] === "file" && ent.name) names.push(ent.name);
    }
    if (!res.has_more || !res.cursor) break;
    cursor = res.cursor;
  }
  return names;
}

async function ensureRemotePath(accessToken: string, remotePath: string): Promise<void> {
  const path = toDropboxPath(remotePath);
  const parent = path.split("/").slice(0, -1).join("/") || "/";
  await ensureDropboxFolderChain(accessToken, parent);
}

export async function dropboxGetManifest(
  uid: string,
  companyId: string,
  companyName?: string,
  dropboxCompanyPath?: string
): Promise<CloudSyncManifest> {
  const ref = toCompanyRef(companyId, companyName, dropboxCompanyPath);
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const dataPath = await findCompanyBranchPath(accessToken, ref, "data");
  if (!dataPath) return { latestOp: 0 };
  const raw = await dropboxReadJson(accessToken, `${dataPath}/manifest.json`);
  if (!raw) return { latestOp: 0 };
  const dateMode = String(raw.cloudSyncDriveDateFolderMode ?? "").trim().toLowerCase();
  const registryDeleted = raw.companyRegistryIsDeleted === true;
  const registryDeletedAt = Number(raw.companyRegistryDeletedAt);
  return {
    latestOp: Number(raw.latestOp) || 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : undefined,
    companyId: typeof raw.companyId === "string" && raw.companyId.trim() ? raw.companyId.trim() : undefined,
    driveShareUsers: Array.isArray(raw.driveShareUsers)
      ? (raw.driveShareUsers as CloudSyncManifest["driveShareUsers"])
      : undefined,
    driveEncryptionSalt:
      typeof raw.driveEncryptionSalt === "string" && raw.driveEncryptionSalt.trim()
        ? raw.driveEncryptionSalt.trim()
        : undefined,
    cloudSyncEncryptDriveData:
      typeof raw.cloudSyncEncryptDriveData === "boolean" ? raw.cloudSyncEncryptDriveData : undefined,
    cloudSyncEncryptDriveFiles:
      typeof raw.cloudSyncEncryptDriveFiles === "boolean" ? raw.cloudSyncEncryptDriveFiles : undefined,
    cloudSyncDriveDateFolderMode:
      dateMode === "bs" || dateMode === "ad" || dateMode === "both"
        ? (dateMode as CloudSyncManifest["cloudSyncDriveDateFolderMode"])
        : undefined,
    companyRegistryIsDeleted: registryDeleted ? true : raw.companyRegistryIsDeleted === false ? false : undefined,
    companyRegistryDeletedAt:
      registryDeleted && Number.isFinite(registryDeletedAt) && registryDeletedAt > 0
        ? registryDeletedAt
        : undefined,
  };
}

export async function dropboxUpdateManifest(
  uid: string,
  companyId: string,
  manifest: CloudSyncManifest,
  companyName?: string,
  dropboxCompanyPath?: string
): Promise<void> {
  const ref = toCompanyRef(companyId, companyName, dropboxCompanyPath);
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const dataPath = await ensureCompanyBranchPath(accessToken, ref, "data");
  const filePath = `${dataPath}/manifest.json`;
  const body = JSON.stringify({ ...manifest, updatedAt: Date.now() });
  await dropboxUploadBytes(accessToken, filePath, Buffer.from(body, "utf-8"), "application/json");
}

export async function dropboxUploadOperation(
  uid: string,
  op: LocalCloudSyncOperation | Record<string, unknown>,
  companyName?: string,
  dropboxCompanyPath?: string
): Promise<void> {
  const opSeq = Number((op as LocalCloudSyncOperation).opSeq);
  if (!Number.isFinite(opSeq) || opSeq <= 0) {
    throw new Error("Dropbox upload: opSeq required.");
  }
  const companyId = String((op as LocalCloudSyncOperation).companyId || "").trim();
  const ref = toCompanyRef(companyId, companyName, dropboxCompanyPath);
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const dataPath = await ensureCompanyBranchPath(accessToken, ref, "data");
  const opsPath = `${dataPath}/ops`;
  await ensureDropboxFolderChain(accessToken, opsPath);
  const filePath = `${opsPath}/${opFileName(opSeq)}`;
  await dropboxUploadBytes(accessToken, filePath, Buffer.from(JSON.stringify(op), "utf-8"), "application/json");
}

export async function dropboxDownloadOperations(
  uid: string,
  companyId: string,
  afterOpSeq: number,
  companyName?: string,
  dropboxCompanyPath?: string
): Promise<LocalCloudSyncOperation[]> {
  const ref = toCompanyRef(companyId, companyName, dropboxCompanyPath);
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const dataPath = await findCompanyBranchPath(accessToken, ref, "data");
  if (!dataPath) return [];
  const opsPath = `${dataPath}/ops`;
  if (!(await dropboxPathExists(accessToken, opsPath))) return [];
  const names = await dropboxListFileNames(accessToken, opsPath);
  const out: LocalCloudSyncOperation[] = [];
  for (const name of names) {
    const m = /^op_(\d+)\.json$/i.exec(name);
    if (!m) continue;
    const seq = Number(m[1]);
    if (!Number.isFinite(seq) || seq <= afterOpSeq) continue;
    const raw = await dropboxReadJson(accessToken, `${opsPath}/${name}`);
    if (raw) out.push(raw as unknown as LocalCloudSyncOperation);
  }
  out.sort((a, b) => a.opSeq - b.opSeq);
  return out;
}

export async function dropboxUploadBinaryAtRemotePath(
  uid: string,
  remotePath: string,
  base64: string,
  contentType = "application/octet-stream"
): Promise<{ remotePath: string }> {
  void contentType;
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const normalized = String(remotePath || "").trim().replace(/\\/g, "/");
  await ensureRemotePath(accessToken, normalized);
  const buf = Buffer.from(base64, "base64");
  await dropboxUploadBytes(accessToken, normalized, buf);
  return { remotePath: normalized };
}

export async function dropboxUploadAttachmentFile(
  uid: string,
  remotePath: string,
  base64: string,
  contentType?: string,
  sha256Hex?: string
): Promise<{ remotePath: string; deduped?: boolean }> {
  void sha256Hex;
  const res = await dropboxUploadBinaryAtRemotePath(
    uid,
    remotePath,
    base64,
    contentType || "application/octet-stream"
  );
  return { remotePath: res.remotePath };
}

export async function dropboxDownloadFileByRemotePath(
  uid: string,
  remotePath: string
): Promise<{ base64: string; contentType: string } | null> {
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const buf = await dropboxDownloadBytes(accessToken, remotePath);
  if (!buf) return null;
  const lower = remotePath.toLowerCase();
  const contentType = lower.endsWith(".json") ? "application/json" : "application/octet-stream";
  return { base64: buf.toString("base64"), contentType };
}

export async function dropboxDownloadFileAtCompanyPath(
  uid: string,
  companyId: string,
  companyName: string | undefined,
  branchRelativePath: string
): Promise<{ base64: string; contentType: string } | null> {
  const ref = toCompanyRef(companyId, companyName);
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const companyPath = await resolveCompanyFolderPath(accessToken, ref, "find");
  if (!companyPath) return null;
  const rel = String(branchRelativePath || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (rel.length < 2) return null;
  const filePath = `${companyPath}/${rel.join("/")}`;
  return dropboxDownloadFileByRemotePath(uid, filePath);
}

export async function dropboxUploadJsonAtRemotePath(
  uid: string,
  remotePath: string,
  body: string,
  contentType = "application/json"
): Promise<{ remotePath: string }> {
  void contentType;
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const normalized = String(remotePath || "").trim().replace(/\\/g, "/");
  await ensureRemotePath(accessToken, normalized);
  await dropboxUploadBytes(accessToken, normalized, Buffer.from(body, "utf-8"), "application/json");
  return { remotePath: normalized };
}

/** Default attachment path when client omits remotePath. */
export function dropboxDefaultAttachmentPath(
  companyId: string,
  companyName: string | undefined,
  fileId: string
): string {
  return buildPocketLedgerDriveRelativePath({ companyId, companyName }, "attachments", "_files", fileId || "file");
}

async function dropboxListFolderSubfolders(
  accessToken: string,
  folderPath: string
): Promise<Array<{ name: string; path: string }>> {
  const path = toDropboxPath(folderPath);
  const out: Array<{ name: string; path: string }> = [];
  let cursor: string | undefined;
  for (;;) {
    const res = cursor
      ? await dropboxRpc<{
          entries?: Array<{ [".tag"]?: string; name?: string; path_lower?: string; path_display?: string }>;
          has_more?: boolean;
          cursor?: string;
        }>(accessToken, "files/list_folder/continue", { cursor })
      : await dropboxRpc<{
          entries?: Array<{ [".tag"]?: string; name?: string; path_lower?: string; path_display?: string }>;
          has_more?: boolean;
          cursor?: string;
        }>(accessToken, "files/list_folder", { path, recursive: false });
    for (const ent of res.entries ?? []) {
      if (ent[".tag"] !== "folder" || !ent.name) continue;
      const p = String(ent.path_lower || ent.path_display || `${path}/${ent.name}`).trim();
      out.push({ name: ent.name, path: toDropboxPath(p) });
    }
    if (!res.has_more || !res.cursor) break;
    cursor = res.cursor;
  }
  return out;
}

async function dropboxLooksLikePocketLedgerCompanyFolder(
  accessToken: string,
  companyPath: string
): Promise<boolean> {
  const dataPath = `${toDropboxPath(companyPath)}/${POCKET_LEDGER_DRIVE_BRANCH.data}`;
  return dropboxPathExists(accessToken, `${dataPath}/manifest.json`);
}

async function dropboxCompanyFolderToListItem(
  accessToken: string,
  folderPath: string,
  folderName: string,
  opts: { sharedByEmail: string; sharedByName?: string; isOwnedOnDropbox: boolean }
): Promise<DropboxSharedCompanyListItem | null> {
  const parsed = parsePocketLedgerCompanyFolderSegment(folderName);
  if (!parsed) return null;
  if (!(await dropboxLooksLikePocketLedgerCompanyFolder(accessToken, folderPath))) return null;
  const dataPath = `${toDropboxPath(folderPath)}/${POCKET_LEDGER_DRIVE_BRANCH.data}`;
  const manifestRaw = await dropboxReadJson(accessToken, `${dataPath}/manifest.json`);
  const manifestCompanyId =
    typeof manifestRaw?.companyId === "string" && String(manifestRaw.companyId).trim()
      ? String(manifestRaw.companyId).trim()
      : "";
  return {
    dropboxFolderPath: toDropboxPath(folderPath),
    folderName,
    companyId: manifestCompanyId || parsed.companyId,
    companyName: parsed.companyName,
    sharedByEmail: opts.sharedByEmail,
    sharedByName: opts.sharedByName,
    isOwnedOnDropbox: opts.isOwnedOnDropbox,
  };
}

export async function dropboxListOwnedPocketLedgerCompanies(
  uid: string,
  userEmail: string | null
): Promise<DropboxSharedCompanyListItem[]> {
  const ownerEmail = String(userEmail || "")
    .trim()
    .toLowerCase();
  if (!ownerEmail) return [];
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const root = `/${POCKET_LEDGER_DRIVE_ROOT}`;
  if (!(await dropboxPathExists(accessToken, root))) return [];
  const subfolders = await dropboxListFolderSubfolders(accessToken, root);
  const out: DropboxSharedCompanyListItem[] = [];
  for (const f of subfolders) {
    const row = await dropboxCompanyFolderToListItem(accessToken, f.path, f.name, {
      sharedByEmail: ownerEmail,
      isOwnedOnDropbox: true,
    });
    if (row) out.push(row);
  }
  return out;
}

export async function dropboxListSharedPocketLedgerCompanies(uid: string): Promise<DropboxSharedCompanyListItem[]> {
  const accessToken = await getDropboxAccessTokenForUid(uid);
  const res = await dropboxRpc<{
    entries?: Array<{
      name?: string;
      path_lower?: string;
      owner_display_names?: string[];
    }>;
  }>(accessToken, "sharing/list_folders", { limit: 100 });
  const out: DropboxSharedCompanyListItem[] = [];
  const rootPrefix = `/${POCKET_LEDGER_DRIVE_ROOT}/`.toLowerCase();
  for (const ent of res.entries ?? []) {
    const path = String(ent.path_lower || "").trim();
    if (!path) continue;
    const name = path.split("/").filter(Boolean).pop() || String(ent.name || "").trim();
    if (!name) continue;
    if (path.toLowerCase().startsWith(rootPrefix)) continue;
    const row = await dropboxCompanyFolderToListItem(accessToken, path, name, {
      sharedByEmail: "shared@dropbox",
      sharedByName: ent.owner_display_names?.[0],
      isOwnedOnDropbox: false,
    });
    if (row) out.push(row);
  }
  return out;
}

export async function dropboxListPocketLedgerCompaniesForJoin(
  uid: string,
  userEmail: string | null
): Promise<DropboxSharedCompanyListItem[]> {
  const [owned, shared] = await Promise.all([
    dropboxListOwnedPocketLedgerCompanies(uid, userEmail),
    dropboxListSharedPocketLedgerCompanies(uid),
  ]);
  const byPath = new Map<string, DropboxSharedCompanyListItem>();
  for (const row of shared) byPath.set(row.dropboxFolderPath, row);
  for (const row of owned) byPath.set(row.dropboxFolderPath, row);
  const merged = [...byPath.values()];
  merged.sort((a, b) => {
    if (a.isOwnedOnDropbox !== b.isOwnedOnDropbox) return a.isOwnedOnDropbox ? -1 : 1;
    return a.companyName.localeCompare(b.companyName);
  });
  return merged;
}

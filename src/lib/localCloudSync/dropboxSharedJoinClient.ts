"use client";

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { getFirebaseAuthUserForApi } from "@/lib/firebaseAuthForApi";
import { postDropboxJsonViaClient } from "@/lib/localCloudSync/dropboxApiClient";
import { getLocalCompanyById, listLocalCompanies, upsertLocalCompany } from "@/lib/localCompanyStore";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { mergeRemoteCloudSyncManifestIntoLocalCompany } from "@/lib/localCloudSync/companyConfig";
import { resolveCountryDriveAttachmentDateFolderMode } from "@/lib/localCloudSync/driveAttachmentPath";
import {
  CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG,
  isCloudSyncEncryptionReady,
} from "@/lib/localCloudSync/driveEncryption";
import { setCloudSyncCursor } from "@/lib/localCloudSync/queue";
import type { CloudSyncManifest, DropboxSharedCompanyListItem } from "@/lib/localCloudSync/types";

export type DropboxSharedCompanyInvite = DropboxSharedCompanyListItem;

async function resolveOwnerUidByEmail(email: string): Promise<string | null> {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return null;
  try {
    const snap = await getDocs(query(collection(firestore, "users"), where("email", "==", em), limit(1)));
    const d = snap.docs[0];
    if (!d) return null;
    const data = d.data() as { uid?: string };
    return String(data.uid || d.id || "").trim() || null;
  } catch {
    return null;
  }
}

export async function listDropboxSharedLocalCompanyInvites(): Promise<DropboxSharedCompanyInvite[]> {
  const res = await postDropboxJsonViaClient<{ companies?: DropboxSharedCompanyInvite[] }>(
    "/api/local-cloud-sync/dropbox/list-shared-companies",
    {}
  );
  return res.companies ?? [];
}

export function isDropboxSharedInviteAlreadyJoined(
  invite: DropboxSharedCompanyInvite,
  locals: Array<{ id?: string; cloudSyncDropboxFolderPath?: unknown; dropboxSharedJoin?: unknown; isDeleted?: unknown }>
): boolean {
  const inviteId = String(invite.companyId || "").trim();
  const folderPath = String(invite.dropboxFolderPath || "").trim();
  for (const row of locals) {
    if (row.isDeleted === true) continue;
    const localId = String(row.id || "").trim();
    const localPath = String(row.cloudSyncDropboxFolderPath ?? "").trim();
    if (folderPath && localPath && localPath === folderPath) return true;
    if (localId && inviteId && (localId === inviteId || localId.endsWith(`_${inviteId}`))) return true;
  }
  return false;
}

export async function peekDropboxSharedCompanyManifest(
  invite: DropboxSharedCompanyInvite
): Promise<CloudSyncManifest> {
  return postDropboxJsonViaClient<CloudSyncManifest>("/api/local-cloud-sync/dropbox/manifest", {
    companyId: invite.companyId,
    companyName: invite.companyName,
    dropboxCompanyPath: invite.dropboxFolderPath,
    action: "get",
  });
}

export type JoinDropboxSharedLocalCompanyOptions = {
  companyPassword?: string;
};

export async function joinDropboxSharedLocalCompany(
  invite: DropboxSharedCompanyInvite,
  options?: JoinDropboxSharedLocalCompanyOptions
): Promise<string> {
  const firebaseUser = await getFirebaseAuthUserForApi();

  let manifest: CloudSyncManifest = { latestOp: 0 };
  try {
    manifest = await peekDropboxSharedCompanyManifest(invite);
  } catch {
    /* optional */
  }

  const canonicalCompanyId = String(manifest.companyId || invite.companyId).trim() || invite.companyId;
  const locals = await listLocalCompanies({ includeDeleted: true });
  if (isDropboxSharedInviteAlreadyJoined(invite, locals)) {
    throw new Error("This company is already on your device.");
  }

  const existing = await getLocalCompanyById(canonicalCompanyId, { includeDeleted: true });
  if (existing && existing.isDeleted !== true) {
    throw new Error("This company is already on your device.");
  }

  const isOwnedOnDropbox = invite.isOwnedOnDropbox === true;
  const ownerUid = isOwnedOnDropbox
    ? firebaseUser.uid
    : (await resolveOwnerUidByEmail(invite.sharedByEmail)) || invite.sharedByEmail;
  const ownerEmail = isOwnedOnDropbox
    ? String(firebaseUser.email || invite.sharedByEmail || "")
        .trim()
        .toLowerCase()
    : invite.sharedByEmail;
  const companyPassword = String(options?.companyPassword ?? "").trim();
  const encryptData = manifest.cloudSyncEncryptDriveData === true;
  const encryptFiles = manifest.cloudSyncEncryptDriveFiles === true;
  const encryptAny = encryptData || encryptFiles;

  if (encryptAny && !companyPassword) {
    throw new Error(
      `${CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG} Enter the owner's company password below, then Join again.`
    );
  }

  await upsertLocalCompany({
    id: canonicalCompanyId,
    name: invite.companyName,
    ownerId: ownerUid,
    ownerEmail,
    storageOption: "local",
    dropboxSharedJoin: isOwnedOnDropbox ? false : true,
    driveSharedJoin: false,
    sharedByEmail: isOwnedOnDropbox ? null : invite.sharedByEmail,
    cloudSyncEnabled: true,
    cloudSyncProvider: "dropbox",
    cloudSyncDataProvider: "dropbox",
    cloudSyncFilesProvider: "dropbox",
    cloudSyncDropboxFolderPath: invite.dropboxFolderPath,
    cloudSyncStatus: "syncing",
    cloudSyncLastError: null,
    cloudSyncEncryptDrive: encryptAny,
    cloudSyncEncryptDriveData: encryptData,
    cloudSyncEncryptDriveFiles: encryptFiles,
    cloudSyncDriveEncryptionSalt: manifest.driveEncryptionSalt ?? null,
    cloudSyncDriveDateFolderMode: resolveCountryDriveAttachmentDateFolderMode(
      (existing ?? {}) as Record<string, unknown>
    ),
    ...(companyPassword ? { password: companyPassword } : {}),
    updatedAt: Date.now(),
  });

  await mergeRemoteCloudSyncManifestIntoLocalCompany(canonicalCompanyId, manifest);

  if (encryptAny && !(await isCloudSyncEncryptionReady(canonicalCompanyId))) {
    throw new Error(
      `${CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG} Check the company password and try Join again.`
    );
  }

  await setCloudSyncCursor(canonicalCompanyId, {
    lastSyncedOp: 0,
    lastSyncAt: null,
    syncStatus: "syncing",
    lastError: null,
  });

  const res = await runLocalCloudSyncCycle(canonicalCompanyId, { force: true });
  if (!res.ok) {
    throw new Error(res.error || "Sync failed after join");
  }
  return canonicalCompanyId;
}

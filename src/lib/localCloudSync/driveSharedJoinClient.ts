"use client";

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { getFirebaseAuthUserForApi } from "@/lib/firebaseAuthForApi";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import { getLocalCompanyById, listLocalCompanies, upsertLocalCompany } from "@/lib/localCompanyStore";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { mergeRemoteCloudSyncManifestIntoLocalCompany } from "@/lib/localCloudSync/companyConfig";
import {
  CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG,
  isCloudSyncEncryptionReady,
} from "@/lib/localCloudSync/driveEncryption";
import { setCloudSyncCursor } from "@/lib/localCloudSync/queue";
import type { CloudSyncManifest, DriveSharedCompanyListItem } from "@/lib/localCloudSync/types";

export type DriveSharedCompanyInvite = DriveSharedCompanyListItem;

/** Owner uid lookup — selector me "Shared by" email ke saath. */
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

/** Drive par shared company folders — joined rows UI me "Connected" dikhane ke liye filter mat karo. */
export async function listDriveSharedLocalCompanyInvites(): Promise<DriveSharedCompanyInvite[]> {
  const res = await postDriveJsonViaClient<{ companies?: DriveSharedCompanyInvite[] }>(
    "/api/local-cloud-sync/drive/list-shared-companies",
    {}
  );
  return res.companies ?? [];
}

/** Local registry me ye shared folder pehle se join ho chuka? (Drive folder id primary match). */
export function isDriveSharedInviteAlreadyJoined(
  invite: DriveSharedCompanyInvite,
  locals: Array<{ id?: string; cloudSyncDriveFolderId?: unknown; driveSharedJoin?: unknown; isDeleted?: unknown }>
): boolean {
  const inviteId = String(invite.companyId || "").trim();
  const folderId = String(invite.driveFolderId || "").trim();
  for (const row of locals) {
    if (row.isDeleted === true) continue;
    const localId = String(row.id || "").trim();
    const localFolder = String(row.cloudSyncDriveFolderId ?? "").trim();
    if (folderId && localFolder && localFolder === folderId) return true;
    if (localId && inviteId && (localId === inviteId || localId.endsWith(`_${inviteId}`))) return true;
  }
  return false;
}

/** Join se pehle manifest — encryption salt / flags pata karne ke liye. */
export async function peekDriveSharedCompanyManifest(
  invite: DriveSharedCompanyInvite
): Promise<CloudSyncManifest> {
  return postDriveJsonViaClient<CloudSyncManifest>("/api/local-cloud-sync/drive/manifest", {
    companyId: invite.companyId,
    companyName: invite.companyName,
    driveSharedFolderId: invite.driveFolderId,
    action: "get",
  });
}

export type JoinDriveSharedLocalCompanyOptions = {
  /** Owner wala Company Profile password — Drive encrypt decrypt ke liye. */
  companyPassword?: string;
};

/** Join: local registry row + bootstrap sync (download ops from Drive folder). */
export async function joinDriveSharedLocalCompany(
  invite: DriveSharedCompanyInvite,
  options?: JoinDriveSharedLocalCompanyOptions
): Promise<string> {
  const firebaseUser = await getFirebaseAuthUserForApi();

  let manifest: CloudSyncManifest = { latestOp: 0 };
  try {
    manifest = await peekDriveSharedCompanyManifest(invite);
  } catch {
    /* manifest optional — sync cycle dubara read karega */
  }

  const canonicalCompanyId = String(manifest.companyId || invite.companyId).trim() || invite.companyId;
  const locals = await listLocalCompanies({ includeDeleted: true });
  if (isDriveSharedInviteAlreadyJoined(invite, locals)) {
    throw new Error("This company is already on your device.");
  }

  const existing = await getLocalCompanyById(canonicalCompanyId, { includeDeleted: true });
  if (existing && existing.isDeleted !== true) {
    throw new Error("This company is already on your device.");
  }

  const isOwnedOnDrive = invite.isOwnedOnDrive === true;
  const ownerUid = isOwnedOnDrive
    ? firebaseUser.uid
    : (await resolveOwnerUidByEmail(invite.sharedByEmail)) || invite.sharedByEmail;
  const ownerEmail = isOwnedOnDrive
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
    // Owner restore: khud ka My Drive folder — shared-join flag mat lagao (upload/sync owner path).
    driveSharedJoin: isOwnedOnDrive ? false : true,
    sharedByEmail: isOwnedOnDrive ? null : invite.sharedByEmail,
    cloudSyncEnabled: true,
    cloudSyncProvider: "google_drive",
    cloudSyncDriveFolderId: invite.driveFolderId,
    cloudSyncStatus: "syncing",
    cloudSyncLastError: null,
    cloudSyncEncryptDrive: encryptAny,
    cloudSyncEncryptDriveData: encryptData,
    cloudSyncEncryptDriveFiles: encryptFiles,
    cloudSyncDriveEncryptionSalt: manifest.driveEncryptionSalt ?? null,
    ...(manifest.cloudSyncDriveDateFolderMode
      ? { cloudSyncDriveDateFolderMode: manifest.cloudSyncDriveDateFolderMode }
      : {}),
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

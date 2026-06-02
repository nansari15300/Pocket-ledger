"use client";

import {
  getLocalCompanyById,
  listLocalCompanies,
  localCompanyRowIsDeleted,
  removeLocalCompanyById,
  type LocalCompanyDoc,
} from "@/lib/localCompanyStore";
import { readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import { logLocalCloudSync, warnLocalCloudSync } from "@/lib/localCloudSync/logger";
import { hasRealFirebaseAuthSession } from "@/lib/firebaseAuthForApi";
export function isLocalCompanyDriveFolderOwner(
  reg: LocalCompanyDoc | Record<string, unknown>,
  firebaseUid: string | null | undefined
): boolean {
  if ((reg as { driveSharedJoin?: unknown }).driveSharedJoin === true) return false;
  const uid = String(firebaseUid || "").trim();
  const ownerId = String((reg as { ownerId?: unknown }).ownerId || "").trim();
  return !!uid && !!ownerId && uid === ownerId;
}

/** Drive folder lifecycle: shared/non-owner + already-synced owner — folder gayab ho to local company auto hatao. */
export function shouldPurgeLocalCompanyWhenDriveFolderMissing(
  reg: LocalCompanyDoc | Record<string, unknown>,
  firebaseUid: string | null | undefined
): boolean {
  const cfg = readCloudSyncConfigFromCompany(reg as LocalCompanyDoc);
  if (!cfg.cloudSyncEnabled || cfg.cloudSyncProvider !== "google_drive") return false;
  if (localCompanyRowIsDeleted(reg)) return false;
  if ((reg as { driveSharedJoin?: unknown }).driveSharedJoin === true) return true;
  const uid = String(firebaseUid || "").trim();
  const ownerId = String((reg as { ownerId?: unknown }).ownerId || "").trim();
  if (!!uid && !!ownerId && uid !== ownerId) return true;

  const folderId = String((reg as { cloudSyncDriveFolderId?: unknown }).cloudSyncDriveFolderId ?? "").trim();
  // Owner first setup par folder absent normal hai; once synced/restored, missing folder means user deleted Drive source.
  return !!folderId || (cfg.cloudSyncLastSyncAt != null && cfg.cloudSyncLastSyncAt > 0);
}

/** Company kabhi Drive par sync ho chuki thi — bin delete par folder hatao (ab sync OFF ho to bhi). */
export function localCompanyHadGoogleDriveFolder(
  reg: LocalCompanyDoc | Record<string, unknown>
): boolean {
  const r = reg as Record<string, unknown>;
  if (String(r.cloudSyncDriveFolderId ?? "").trim()) return true;
  const provider = String(r.cloudSyncProvider ?? "").trim().toLowerCase();
  if (provider === "google_drive" || provider === "drive") return true;
  if (r.cloudSyncEnabled === true) return true;
  const lastSync = r.cloudSyncLastSyncAt;
  return typeof lastSync === "number" && Number.isFinite(lastSync) && lastSync > 0;
}

/** Recycle bin permanent delete — pehle owner ka Drive main company folder, phir SQLite. */
export async function deleteDriveCompanyFolderIfOwner(
  reg: LocalCompanyDoc | Record<string, unknown>,
  firebaseUid: string | null | undefined
): Promise<boolean> {
  if (!localCompanyHadGoogleDriveFolder(reg)) return false;
  if (!isLocalCompanyDriveFolderOwner(reg, firebaseUid)) return false;
  if (!hasRealFirebaseAuthSession()) return false;

  const companyId = String((reg as { id?: unknown }).id || "").trim();
  if (!companyId) return false;

  try {
    const res = await postDriveJsonViaClient<{ ok?: boolean; deleted?: boolean }>(
      "/api/local-cloud-sync/drive/delete-company-folder",
      {
        companyId,
        companyName: typeof (reg as { name?: unknown }).name === "string" ? (reg as { name: string }).name : undefined,
        driveSharedFolderId:
          typeof (reg as { cloudSyncDriveFolderId?: unknown }).cloudSyncDriveFolderId === "string"
            ? String((reg as { cloudSyncDriveFolderId: string }).cloudSyncDriveFolderId).trim()
            : undefined,
      }
    );
    logLocalCloudSync("drive company folder deleted", { companyId, deleted: res.deleted === true });
    return res.deleted === true;
  } catch (e) {
    warnLocalCloudSync("drive company folder delete failed (local delete continues)", {
      companyId,
      msg: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/** SQLite + Drive folder (owner) — recycle bin permanent delete helper. */
export async function permanentDeleteLocalCompanyWithDriveCleanup(
  companyId: string,
  options?: { firebaseUid?: string | null }
): Promise<{ driveFolderDeleted: boolean; driveDeleteAttempted: boolean }> {
  const cid = String(companyId || "").trim();
  if (!cid) return { driveFolderDeleted: false, driveDeleteAttempted: false };

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  let driveFolderDeleted = false;
  let driveDeleteAttempted = false;
  if (reg) {
    driveDeleteAttempted =
      localCompanyHadGoogleDriveFolder(reg) && isLocalCompanyDriveFolderOwner(reg, options?.firebaseUid ?? null);
    driveFolderDeleted = await deleteDriveCompanyFolderIfOwner(reg, options?.firebaseUid ?? null);
  }
  await removeLocalCompanyById(cid, { firebaseUid: options?.firebaseUid ?? null });
  return { driveFolderDeleted, driveDeleteAttempted };
}

/** Permanent delete toast — Drive folder delete miss ho to user ko hint. */
export function permanentDeleteDriveFolderHint(result: {
  driveFolderDeleted: boolean;
  driveDeleteAttempted: boolean;
}): string {
  if (!result.driveDeleteAttempted) return "";
  if (result.driveFolderDeleted) return " Google Drive company folder removed.";
  return " Google Drive folder was not removed — sign in with Google and connect Drive, then retry if needed.";
}

export type DriveMissingPurgeResult = { companyId: string; companyName: string };

/** Drive par company main folder nahi — device se local row hatao, re-upload/recreate mat karo. */
export async function purgeLocalCompanyIfDriveFolderMissing(
  companyId: string,
  firebaseUid: string | null | undefined
): Promise<DriveMissingPurgeResult | null> {
  const cid = String(companyId || "").trim();
  if (!cid) return null;
  if (!hasRealFirebaseAuthSession()) return null;

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg) return null;
  if (!shouldPurgeLocalCompanyWhenDriveFolderMissing(reg, firebaseUid)) return null;

  const folderId = String(reg.cloudSyncDriveFolderId ?? "").trim();
  const companyName = typeof reg.name === "string" ? reg.name : cid;
  const isSharedJoin = (reg as { driveSharedJoin?: unknown }).driveSharedJoin === true;

  // Shared join row bina folder id orphan hai; owner rows companyId/name se Drive folder lookup kar sakte hain.
  if (!folderId && isSharedJoin) {
    await removeLocalCompanyById(cid, { firebaseUid: firebaseUid ?? null });
    logLocalCloudSync("purged local company — missing drive folder id", { companyId: cid });
    return { companyId: cid, companyName };
  }

  try {
    const res = await postDriveJsonViaClient<{ accessible?: boolean }>(
      "/api/local-cloud-sync/drive/folder-accessible",
      {
        companyId: cid,
        companyName: typeof reg.name === "string" ? reg.name : undefined,
        // Joined/restored rows have exact folder id; owner rows without id are checked by company folder name/id.
        driveFolderId: folderId || undefined,
      }
    );
    if (res.accessible === true) return null;

    await removeLocalCompanyById(cid, { firebaseUid: firebaseUid ?? null });
    logLocalCloudSync("purged local company — drive folder gone", { companyId: cid, folderId });
    return { companyId: cid, companyName };
  } catch (e) {
    // Offline / Drive not connected — local row mat todo.
    warnLocalCloudSync("drive folder check skipped", {
      companyId: cid,
      msg: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Background tick — saari shared/join companies jinka Drive folder gayab ho. */
export async function purgeAllLocalCompaniesMissingOnDrive(
  firebaseUid: string | null | undefined
): Promise<DriveMissingPurgeResult[]> {
  if (!hasRealFirebaseAuthSession()) return [];
  const rows = await listLocalCompanies();
  const purged: DriveMissingPurgeResult[] = [];
  for (const row of rows) {
    const result = await purgeLocalCompanyIfDriveFolderMissing(row.id, firebaseUid);
    if (result) purged.push(result);
  }
  return purged;
}

"use client";

import { isDeviceLocalCompany } from "@/lib/companyStorageKind";

/** Online / Firebase / Drive link fields — local backup-restore company row me nahi rehne chahiye. */
export const ONLINE_LINK_FIELDS_STRIPPED_FOR_LOCAL_BACKUP = [
  "authoritativeCompanyId",
  "cloudSyncLastSyncAt",
  "cloudSyncStatus",
  "cloudSyncLastError",
  "cloudSyncLastSyncSummary",
  "cloudSyncEnabled",
  "cloudSyncProvider",
  "cloudSyncDriveFolderId",
  "cloudSyncSharedEmails",
  "cloudSyncDriveShareUsers",
  "cloudSyncDriveDateFolderMode",
  "cloudSyncEncryptDrive",
  "cloudSyncEncryptDriveData",
  "cloudSyncEncryptDriveFiles",
  "cloudSyncDriveEncryptionSalt",
  "cloudSyncIntervalSec",
  "cloudSyncHistoricalBackfillDone",
  "plServerShared",
  "driveSharedJoin",
  "demoteReason",
  "demotedFromOnlineAt",
  "backupOfflineFiles",
] as const;

export function stripOnlineLinkFieldsFromCompanyRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const k of ONLINE_LINK_FIELDS_STRIPPED_FOR_LOCAL_BACKUP) delete out[k];
  return out;
}

export function isLocalBackupRestoredCompanyRow(
  row: Record<string, unknown> | null | undefined
): boolean {
  if (!row) return false;
  const ts = (row as { localRestoredFromBackupAt?: unknown }).localRestoredFromBackupAt;
  return typeof ts === "number" && Number.isFinite(ts) && ts > 0;
}

/** SQLite registry row after `.plbp` restore → device-local only (Firestore auto-purge se bachao). */
export function finalizeLocalCompanyRowAfterBackupRestore(
  row: Record<string, unknown>,
  opts: {
    companyId: string;
    ownerUid: string;
    ownerEmail?: string | null;
    companyName: string;
  }
): Record<string, unknown> {
  const cleaned = stripOnlineLinkFieldsFromCompanyRow(row);
  return {
    ...cleaned,
    id: opts.companyId,
    ownerId: opts.ownerUid,
    ownerEmail: opts.ownerEmail ?? null,
    name: opts.companyName || String(cleaned.name || opts.companyId),
    storageOption: "local",
    syncedFromCloud: false,
    syncPolicy: "offline",
    plServerShared: false,
    localRestoredFromBackupAt: Date.now(),
  };
}

/** Post-restore reload: listRecovery ko turant clearCompanyId se bachane ke liye (sessionStorage, ~20s). */
export const LOCAL_BACKUP_RESTORE_SELECTION_GRACE_KEY = "pl-local-backup-restore-selection-grace";

export function markLocalBackupRestoreSelectionGrace(companyId: string): void {
  if (typeof window === "undefined") return;
  const id = String(companyId || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(
      LOCAL_BACKUP_RESTORE_SELECTION_GRACE_KEY,
      JSON.stringify({ companyId: id, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function readLocalBackupRestoreSelectionGrace(
  companyId: string,
  maxAgeMs = 20_000
): boolean {
  if (typeof window === "undefined") return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
    const raw = sessionStorage.getItem(LOCAL_BACKUP_RESTORE_SELECTION_GRACE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { companyId?: string; at?: number };
    if (String(parsed.companyId || "").trim() !== id) return false;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (!at || Date.now() - at > maxAgeMs) return false;
    return true;
  } catch {
    return false;
  }
}

/** Owner ki local backup company — periodic Firestore ghost purge / online mirror stamp se protect. */
export function isProtectedOwnerLocalBackupCompany(
  row: Record<string, unknown> | null | undefined,
  user: { uid: string; email: string | null }
): boolean {
  if (!row) return false;
  const uid = String(user.uid || "").trim();
  if (!uid) return false;
  const ownerId = String(row.ownerId || "").trim();
  const ownerEmail = String(row.ownerEmail || "")
    .toLowerCase()
    .trim();
  const userEmail = String(user.email || "")
    .toLowerCase()
    .trim();
  const isOwner = (ownerId && ownerId === uid) || (!!ownerEmail && !!userEmail && ownerEmail === userEmail);
  if (!isOwner) return false;
  return isDeviceLocalCompany(row as Parameters<typeof isDeviceLocalCompany>[0]) || isLocalBackupRestoredCompanyRow(row);
}

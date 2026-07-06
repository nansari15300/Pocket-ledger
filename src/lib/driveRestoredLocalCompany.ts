"use client";

import { isCurrentUserOwnerOfCompanyRow } from "@/lib/companyOnlineIntegrity";
import { isDeviceLocalCompany } from "@/lib/companyStorageKind";

/** Drive restore/join ke baad SQLite row par — Firestore ghost purge se bachao. */
export function isDriveRestoredLocalCompanyRow(
  row: Record<string, unknown> | null | undefined
): boolean {
  if (!row) return false;
  const ts = (row as { localRestoredFromDriveAt?: unknown }).localRestoredFromDriveAt;
  return typeof ts === "number" && Number.isFinite(ts) && ts > 0;
}

/** Google Drive folder + sync ON — Firestore `companies/{id}` doc ki zaroorat nahi. */
export function isDriveCloudSyncLocalRegistryRow(
  row: Record<string, unknown> | null | undefined
): boolean {
  if (!row) return false;
  const folderId = String(row.cloudSyncDriveFolderId ?? "").trim();
  if (!folderId) return false;
  if (row.cloudSyncEnabled !== true) return false;
  return String(row.cloudSyncProvider ?? "").toLowerCase().trim() === "google_drive";
}

/** Reconcile / ghost purge / snapshot merge — Drive local registry mat udao. */
export function isProtectedDriveLocalRegistryRow(
  row: Record<string, unknown> | null | undefined,
  user?: { uid: string; email: string | null } | null
): boolean {
  if (!row) return false;
  if ((row as { driveSharedJoin?: unknown }).driveSharedJoin === true) return true;
  if (isDriveRestoredLocalCompanyRow(row)) return true;
  if (!isDriveCloudSyncLocalRegistryRow(row)) return false;
  if (isDeviceLocalCompany(row as Parameters<typeof isDeviceLocalCompany>[0])) return true;
  if (user?.uid && isCurrentUserOwnerOfCompanyRow(row as { ownerId?: string; ownerEmail?: string }, user)) {
    return true;
  }
  return true;
}

/** Post-restore selection grace — reconcile clearCompanyId se bachao (~15 min). */
export const DRIVE_RESTORE_SELECTION_GRACE_KEY = "pl-drive-restore-selection-grace";
const DRIVE_RESTORE_SELECTION_GRACE_MS = 15 * 60 * 1000;

export function markDriveRestoreSelectionGrace(companyId: string): void {
  if (typeof window === "undefined") return;
  const id = String(companyId || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(
      DRIVE_RESTORE_SELECTION_GRACE_KEY,
      JSON.stringify({ companyId: id, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function readDriveRestoreSelectionGrace(
  companyId: string,
  maxAgeMs = DRIVE_RESTORE_SELECTION_GRACE_MS
): boolean {
  if (typeof window === "undefined") return false;
  const id = String(companyId || "").trim();
  if (!id) return false;
  try {
    const raw = sessionStorage.getItem(DRIVE_RESTORE_SELECTION_GRACE_KEY);
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

/** Drive folder missing purge — restore ke turant baad false positive se bachao. */
export function isWithinDriveRestorePurgeGrace(
  row: Record<string, unknown> | null | undefined,
  maxAgeMs = DRIVE_RESTORE_SELECTION_GRACE_MS
): boolean {
  if (!row) return false;
  const ts = (row as { localRestoredFromDriveAt?: unknown }).localRestoredFromDriveAt;
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return false;
  return Date.now() - ts <= maxAgeMs;
}

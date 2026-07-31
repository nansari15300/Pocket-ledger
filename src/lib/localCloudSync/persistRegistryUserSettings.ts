"use client";

import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import {
  CLOUD_SYNC_INTERVAL_SEC_OPTIONS,
  DEFAULT_CLOUD_SYNC_INTERVAL_SEC,
  type CloudSyncIntervalSec,
} from "@/lib/localCloudSync/types";
import { companyUsesDeviceOrPlPermissionConfig } from "@/lib/permissionConfigSource";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";

/** User settings — Firestore company mirror in SQLite par overwrite na ho. */
export const LOCAL_CLOUD_SYNC_USER_SETTINGS_KEYS = [
  "cloudSyncIntervalSec",
  "cloudSyncEnabled",
  "cloudSyncProvider",
  "cloudSyncEncryptDriveData",
  "cloudSyncEncryptDriveFiles",
  "cloudSyncEncryptDrive",
  "cloudSyncDriveEncryptionSalt",
  "cloudSyncDriveDateFolderMode",
  "cloudSyncDriveFolderId",
  "cloudSyncDriveShareUsers",
  "cloudSyncSharedEmails",
  "localFirebaseReconcileEnabled",
] as const;

/**
 * PL-server / local company root — skeleton upsert (focus delta) me missing fields
 * existing SQLite se preserve: warna permissionConfig wipe → manager editDays default 7.
 */
export const LOCAL_COMPANY_ROOT_PRESERVE_KEYS = [
  "permissionConfig",
  "localCompanyUsers",
  "adminUsername",
  "password",
  "passwordHash",
  "planId",
  "subscription",
  "backDateEditDays",
] as const;

function hasExplicitCloudSyncInterval(raw: unknown): raw is CloudSyncIntervalSec {
  const n = Number(raw);
  return CLOUD_SYNC_INTERVAL_SEC_OPTIONS.includes(n as CloudSyncIntervalSec);
}

/**
 * Registry upsert se pehle — device par save ki hui Drive sync settings rakho.
 * Firestore mirror / plan overlay rows me ye fields hoti nahi → refresh par 30 sec default na aaye.
 */
export function mergePersistedLocalCloudSyncUserSettings(
  existing: LocalCompanyDoc | null | undefined,
  incoming: LocalCompanyDoc
): LocalCompanyDoc {
  if (!existing?.id) return incoming;
  const out: LocalCompanyDoc = { ...incoming };

  for (const key of LOCAL_CLOUD_SYNC_USER_SETTINGS_KEYS) {
    const existingVal = existing[key];
    const incomingVal = incoming[key];

    if (key === "cloudSyncIntervalSec") {
      if (hasExplicitCloudSyncInterval(incomingVal)) {
        out[key] = incomingVal;
        continue;
      }
      if (hasExplicitCloudSyncInterval(existingVal)) {
        out[key] = existingVal;
        continue;
      }
      out[key] = DEFAULT_CLOUD_SYNC_INTERVAL_SEC;
      continue;
    }

    if (incomingVal === undefined || incomingVal === null) {
      if (existingVal !== undefined && existingVal !== null) {
        out[key] = existingVal;
      }
    }
  }

  // Focus / skeleton company upserts omit these — keep last known SQLite values.
  for (const key of LOCAL_COMPANY_ROOT_PRESERVE_KEYS) {
    const incomingVal = (incoming as Record<string, unknown>)[key];
    const existingVal = (existing as Record<string, unknown>)[key];
    if ((incomingVal === undefined || incomingVal === null) && existingVal != null) {
      (out as Record<string, unknown>)[key] = existingVal;
    }
  }

  // Strict: local / PL-server role permissions never overwritten by Firebase mirror rows.
  // Cloud registry upsert often carries default manager editDays=7 → wiped host save (500→7).
  const existingIsDevice = companyUsesDeviceOrPlPermissionConfig(existing);
  const incomingIsCloud =
    isCloudLinkedCompanyStorage(incoming as { storageOption?: string | null; syncedFromCloud?: boolean }) &&
    !companyUsesDeviceOrPlPermissionConfig(incoming);
  if (existingIsDevice && incomingIsCloud && existing.permissionConfig != null) {
    (out as Record<string, unknown>).permissionConfig = existing.permissionConfig;
  }
  if (existingIsDevice && incomingIsCloud && existing.localCompanyUsers != null) {
    (out as Record<string, unknown>).localCompanyUsers = existing.localCompanyUsers;
  }

  return out;
}

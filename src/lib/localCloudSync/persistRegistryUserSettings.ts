"use client";

import type { LocalCompanyDoc } from "@/lib/localCompanyStore";
import {
  CLOUD_SYNC_INTERVAL_SEC_OPTIONS,
  DEFAULT_CLOUD_SYNC_INTERVAL_SEC,
  type CloudSyncIntervalSec,
} from "@/lib/localCloudSync/types";

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

  return out;
}

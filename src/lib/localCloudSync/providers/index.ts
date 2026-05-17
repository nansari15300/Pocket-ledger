"use client";

import type { CloudSyncProviderId } from "@/lib/localCloudSync/types";
import type { SyncProvider } from "@/lib/localCloudSync/providers/types";
import { GoogleDriveSyncProvider } from "@/lib/localCloudSync/providers/googleDriveProvider";
import { DropboxSyncProvider } from "@/lib/localCloudSync/providers/dropboxProvider";

export function getSyncProviderForCompany(provider: CloudSyncProviderId): SyncProvider {
  if (provider === "dropbox") return new DropboxSyncProvider();
  return new GoogleDriveSyncProvider();
}

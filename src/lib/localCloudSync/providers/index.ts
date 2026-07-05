"use client";

import type { SyncProvider } from "@/lib/localCloudSync/providers/types";
import { GoogleDriveSyncProvider } from "@/lib/localCloudSync/providers/googleDriveProvider";

let cached: GoogleDriveSyncProvider | null = null;

export function getSyncProviderForCompany(): SyncProvider {
  if (!cached) cached = new GoogleDriveSyncProvider();
  return cached;
}

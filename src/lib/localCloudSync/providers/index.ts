"use client";

import type { CloudSyncProviderId } from "@/lib/localCloudSync/types";
import type { SyncProvider } from "@/lib/localCloudSync/providers/types";
import { GoogleDriveSyncProvider } from "@/lib/localCloudSync/providers/googleDriveProvider";
import {
  cloudSyncDataProviderId,
  cloudSyncFilesProviderId,
} from "@/lib/localCloudSync/companyConfig";
import type { LocalCompanyDoc } from "@/lib/localCompanyStore";

export function getSyncProviderForCompany(provider: CloudSyncProviderId): SyncProvider {
  return new GoogleDriveSyncProvider();
}

export function getDataSyncProviderForCompany(
  company: LocalCompanyDoc | Record<string, unknown> | null | undefined
): SyncProvider | null {
  const id = cloudSyncDataProviderId(company);
  return id ? getSyncProviderForCompany(id) : null;
}

export function getFilesSyncProviderForCompany(
  company: LocalCompanyDoc | Record<string, unknown> | null | undefined
): SyncProvider | null {
  const id = cloudSyncFilesProviderId(company);
  return id ? getSyncProviderForCompany(id) : null;
}

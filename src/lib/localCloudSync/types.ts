/** Local-company cloud sync (Drive/Dropbox transport) — Firestore companies is path se bahar. */

export type CloudSyncProviderId = "google_drive" | "dropbox";

export type CloudSyncAction = "create" | "update" | "delete";

/** Ek delta op — provider par `op_XXXXXX.json` ke roop me upload. */
export type LocalCloudSyncOperation = {
  opId: string;
  companyId: string;
  deviceId: string;
  table: string;
  action: CloudSyncAction;
  rowId: string;
  updatedAt: number;
  opSeq: number;
  payload: Record<string, unknown>;
};

export type CloudSyncManifest = {
  latestOp: number;
  updatedAt?: number;
};

export type CloudSyncRunStatus = "idle" | "syncing" | "error";

export type CloudSyncCompanyConfig = {
  cloudSyncEnabled: boolean;
  cloudSyncProvider: CloudSyncProviderId | null;
  cloudSyncLastSyncAt: number | null;
  cloudSyncStatus: CloudSyncRunStatus;
  cloudSyncLastError: string | null;
};

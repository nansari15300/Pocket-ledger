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
  /** Canonical Pocket Ledger company id — Drive folder suffix se alag (join/sync). */
  companyId?: string;
  /** Drive share list + app roles — joined devices par manifest se sync. */
  driveShareUsers?: CloudSyncDriveShareUser[];
  /** Shared devices decrypt ke liye — passphrase alag (Company Profile / local login). */
  driveEncryptionSalt?: string;
  cloudSyncEncryptDriveData?: boolean;
  cloudSyncEncryptDriveFiles?: boolean;
  cloudSyncDriveDateFolderMode?: "ad" | "bs" | "both";
  /** Company recycle-bin move — joined devices par registry `isDeleted` sync (Firestore local-only companies). */
  companyRegistryIsDeleted?: boolean;
  companyRegistryDeletedAt?: number;
};

export type CloudSyncRunStatus = "idle" | "syncing" | "error";

/** Last successful sync cycle — UI summary card. */
export type CloudSyncLastSyncSummary = {
  addedFiles: number;
  addedVouchers: number;
  uploadedFiles: number;
  uploadedVouchers: number;
  /** Drive se download karke local me apply — last cycle. */
  downloadedFiles: number;
  downloadedVouchers: number;
};

/** Background auto-sync interval (seconds) — includes Live (1s) and minute presets. */
export const CLOUD_SYNC_INTERVAL_SEC_OPTIONS = [1, 5, 10, 15, 20, 30, 40, 60, 120, 300, 600] as const;
export type CloudSyncIntervalSec = (typeof CLOUD_SYNC_INTERVAL_SEC_OPTIONS)[number];
export const DEFAULT_CLOUD_SYNC_INTERVAL_SEC: CloudSyncIntervalSec = 30;
/** Manager tick floor: 1s so Live option practical rahe, per-company interval gate alag se apply hota hai. */
export const MIN_CLOUD_SYNC_TICK_MS = 1_000;

/** Save/edit ke baad turant sync — `enqueueFromWrite` dispatch, manager listen. */
export const CLOUD_SYNC_POKE_EVENT = "pl-cloud-sync-poke";

/** Drive folder share row — Drive par hamesha writer; appRole company permissions ke liye. */
export type CloudSyncDriveShareUser = {
  email: string;
  appRole: string;
};

export type CloudSyncCompanyConfig = {
  cloudSyncEnabled: boolean;
  cloudSyncProvider: CloudSyncProviderId | null;
  cloudSyncLastSyncAt: number | null;
  cloudSyncStatus: CloudSyncRunStatus;
  cloudSyncLastError: string | null;
  /** Staff Gmail list — Drive company folder writer share (legacy flat list). */
  cloudSyncSharedEmails: string[];
  /** Drive share users — email + permission (UI list). */
  cloudSyncDriveShareUsers: CloudSyncDriveShareUser[];
  /** Nepal attachments date folder: bs | ad | both */
  cloudSyncDriveDateFolderMode: "bs" | "ad" | "both" | null;
  /** Legacy — true jab data ya files encrypt ON ho. */
  cloudSyncEncryptDrive: boolean;
  /** Drive `data/ops/` + opening JSON — AES encrypt before upload. */
  cloudSyncEncryptDriveData: boolean;
  /** Drive attachments + opening/avatars — AES encrypt file bytes. */
  cloudSyncEncryptDriveFiles: boolean;
  cloudSyncDriveEncryptionSalt: string | null;
  /** Background sync timer — Live/seconds/minutes presets (default 30 sec). */
  cloudSyncIntervalSec: CloudSyncIntervalSec;
  /** Last sync cycle counts — added/downloaded vs uploaded to Drive. */
  cloudSyncLastSyncSummary: CloudSyncLastSyncSummary;
};

/** Drive/Dropbox API calls — folder segment `{name}__{id}` banane ke liye name bhi chahiye. */
export type CloudSyncCompanyRef = {
  companyId: string;
  companyName?: string;
  /** Joined user: owner ke share kiye hue company folder ka Drive id (sirf woh folder, Pocket Ledger root nahi). */
  driveSharedFolderId?: string;
};

/** Drive se join kiya hua local company — selector me "Shared Companies Local" + owner email. */
export type DriveSharedJoinMeta = {
  driveSharedJoin?: boolean;
  sharedByEmail?: string | null;
  cloudSyncDriveFolderId?: string | null;
};

/** Join dialog — Pocket Ledger company folder row (shared-with-me ya My Drive owned). */
export type DriveSharedCompanyListItem = {
  driveFolderId: string;
  folderName: string;
  companyId: string;
  companyName: string;
  sharedByEmail: string;
  sharedByName?: string;
  /** true = user ke My Drive → Pocket Ledger ke andar khud ka synced folder */
  isOwnedOnDrive?: boolean;
};

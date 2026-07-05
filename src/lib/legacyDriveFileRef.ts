/**
 * Google Drive attachment refs — canonical `drive:` (Pocket Ledger cloud sync).
 * Re-export taaki preview/open/sync sab platforms par same detection ho.
 */
export {
  DRIVE_FILE_PREFIX,
  LEGACY_DRIVE_FILE_PREFIX,
  isDriveFileRef,
  remotePathFromDriveFileRef,
  toDriveFileRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";

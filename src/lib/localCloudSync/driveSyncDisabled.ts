/** Emergency kill-switch: keep false unless Drive sync must be stopped globally. */
export const LOCAL_GOOGLE_DRIVE_SYNC_DISABLED = false;

export const LOCAL_GOOGLE_DRIVE_SYNC_DISABLED_MESSAGE =
  "Google Drive sync is temporarily disabled.";

export function isLocalGoogleDriveSyncDisabled(): boolean {
  return LOCAL_GOOGLE_DRIVE_SYNC_DISABLED;
}

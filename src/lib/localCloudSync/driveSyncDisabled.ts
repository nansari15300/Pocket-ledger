/** Temporary hard kill-switch: Google Drive sync UI stays visible, but no Drive calls should run. */
export const LOCAL_GOOGLE_DRIVE_SYNC_DISABLED = true;

export const LOCAL_GOOGLE_DRIVE_SYNC_DISABLED_MESSAGE =
  "Google Drive sync is temporarily disabled.";

export function isLocalGoogleDriveSyncDisabled(): boolean {
  return LOCAL_GOOGLE_DRIVE_SYNC_DISABLED;
}

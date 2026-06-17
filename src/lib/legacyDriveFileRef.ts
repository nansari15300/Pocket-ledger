/** Legacy Google Drive attachment refs (cloud sync removed) — detect/read only for old rows. */
const DRIVE_FILE_PREFIX = "drive://";

export function isDriveFileRef(url: string): boolean {
  return typeof url === "string" && url.startsWith(DRIVE_FILE_PREFIX);
}

export function remotePathFromDriveFileRef(url: string): string | null {
  if (!isDriveFileRef(url)) return null;
  const path = url.slice(DRIVE_FILE_PREFIX.length).trim();
  return path || null;
}

/** Cloud sync removed — local company permanent delete without Drive folder cleanup. */
import { removeLocalCompanyById } from "@/lib/localCompanyStore";

export type PermanentDeleteDriveCleanupResult = {
  driveFolderDeleted?: boolean;
  driveFolderDeleteError?: string;
};

export function permanentDeleteDriveFolderHint(_result?: PermanentDeleteDriveCleanupResult): string {
  return "";
}

export async function permanentDeleteLocalCompanyWithDriveCleanup(
  companyId: string,
  _opts?: { firebaseUid?: string | null }
): Promise<PermanentDeleteDriveCleanupResult> {
  await removeLocalCompanyById(companyId);
  return {};
}

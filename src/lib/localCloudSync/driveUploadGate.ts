"use client";

/** Drive par folder/files banane wale API paths — sync OFF par block. */
const DRIVE_MUTATION_PATHS = new Set([
  "/api/local-cloud-sync/drive/upload-op",
  "/api/local-cloud-sync/drive/upload-file",
  "/api/local-cloud-sync/drive/upload-json",
  "/api/local-cloud-sync/drive/upload-backup",
  "/api/local-cloud-sync/drive/share-folder",
  "/api/local-cloud-sync/drive/delete-file",
]);

function companyIdFromDriveBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  return String((body as { companyId?: unknown }).companyId ?? "").trim();
}

/** Sync disabled ho to upload/share/manifest-set se pehle roko — folder dubara na bane. */
export async function assertDriveMutationAllowedForCompany(path: string, body: unknown): Promise<void> {
  let needsCheck = DRIVE_MUTATION_PATHS.has(path);
  if (!needsCheck && path.endsWith("/manifest")) {
    const action = String((body as { action?: unknown })?.action ?? "get").toLowerCase();
    needsCheck = action === "set";
  }
  if (!needsCheck) return;

  const companyId = companyIdFromDriveBody(body);
  if (!companyId) return;

  const { shouldUseLocalCloudSync } = await import("@/lib/localCloudSync/companyConfig");
  if (!(await shouldUseLocalCloudSync(companyId))) {
    throw new Error("Drive sync is disabled for this company.");
  }
}

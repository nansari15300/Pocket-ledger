import type { CloudSyncManifest, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";

/** Drive/Dropbox transport — primary DB nahi, sirf delta JSON + attachment bytes. */
export interface SyncProvider {
  readonly providerId: "google_drive" | "dropbox";

  uploadOperation(companyId: string, op: LocalCloudSyncOperation): Promise<void>;

  downloadOperations(
    companyId: string,
    afterOpSeq: number
  ): Promise<LocalCloudSyncOperation[]>;

  getManifest(companyId: string): Promise<CloudSyncManifest>;

  updateManifest(companyId: string, manifest: CloudSyncManifest): Promise<void>;

  uploadFile(
    companyId: string,
    fileId: string,
    bytes: ArrayBuffer,
    meta: { contentType?: string; sha256Hex?: string }
  ): Promise<{ remotePath: string }>;

  downloadFile(companyId: string, remotePath: string): Promise<ArrayBuffer | null>;
}

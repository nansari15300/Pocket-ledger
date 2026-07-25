import type {
  CloudSyncCompanyRef,
  CloudSyncManifest,
  LocalCloudSyncOperation,
} from "@/lib/localCloudSync/types";

/** Drive transport — primary DB nahi, sirf delta JSON + attachment bytes. */
export interface SyncProvider {
  readonly providerId: "google_drive" | "dropbox";

  uploadOperation(ref: CloudSyncCompanyRef, op: LocalCloudSyncOperation): Promise<void>;

  downloadOperations(ref: CloudSyncCompanyRef, afterOpSeq: number): Promise<LocalCloudSyncOperation[]>;

  getManifest(ref: CloudSyncCompanyRef): Promise<CloudSyncManifest>;

  updateManifest(ref: CloudSyncCompanyRef, manifest: CloudSyncManifest): Promise<void>;

  uploadFile(
    ref: CloudSyncCompanyRef,
    fileId: string,
    bytes: ArrayBuffer,
    meta: { contentType?: string; sha256Hex?: string; remotePath?: string }
  ): Promise<{ remotePath: string }>;

  downloadFile(ref: CloudSyncCompanyRef, remotePath: string): Promise<ArrayBuffer | null>;
}

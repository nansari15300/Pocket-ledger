"use client";

import type { CloudSyncCompanyRef, CloudSyncManifest, LocalCloudSyncOperation } from "@/lib/localCloudSync/types";
import type { SyncProvider } from "@/lib/localCloudSync/providers/types";

/** Dropbox — same delta layout as Drive; OAuth/API routes baad me extend. */
export class DropboxSyncProvider implements SyncProvider {
  readonly providerId = "dropbox" as const;

  private notReady(): never {
    throw new Error("Dropbox sync is not connected yet. Use Google Drive or connect Dropbox when available.");
  }

  uploadOperation(): Promise<void> {
    return Promise.reject(this.notReady());
  }

  downloadOperations(): Promise<LocalCloudSyncOperation[]> {
    return Promise.reject(this.notReady());
  }

  getManifest(): Promise<CloudSyncManifest> {
    return Promise.reject(this.notReady());
  }

  updateManifest(): Promise<void> {
    return Promise.reject(this.notReady());
  }

  uploadFile(): Promise<{ remotePath: string }> {
    return Promise.reject(this.notReady());
  }

  downloadFile(): Promise<ArrayBuffer | null> {
    return Promise.reject(this.notReady());
  }
}

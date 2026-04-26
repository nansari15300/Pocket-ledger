import { registerPlugin } from "@capacitor/core";

export type BackupSafWriteResult = { uri: string };

export interface BackupSafPlugin {
  /** Write base64 (raw, no data: prefix) into a SAF document tree (content://.../tree/...). */
  writeToTreeUri(options: { treeUri: string; fileName: string; data: string }): Promise<BackupSafWriteResult>;
}

export const BackupSaf = registerPlugin<BackupSafPlugin>("BackupSaf");

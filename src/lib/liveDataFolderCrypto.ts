"use client";

/**
 * `pocket-ledger/` mirror files: AES-GCM (same PBKDF2 as server backup encryption).
 * Passphrase: auto-generated, stored in IndexedDB (`ensureLiveMirrorAutoPassphrase` in backupSaveLocation).
 * Salt: persisted in `pl_live_data_folder_prefs_v1` (one per device folder config).
 */

import {
  decryptServerBackupPayloadJson,
  encryptServerBackupPayloadJson,
} from "@/lib/serverBackupEncryption";

/** Encrypted envelope written as UTF-8 text file under `pocket-ledger/`. */
export async function sealLiveMirrorJson(plainJson: string, passphrase: string, saltBase64: string): Promise<string> {
  const { ivBase64, cipherTextBase64 } = await encryptServerBackupPayloadJson(plainJson, passphrase, saltBase64);
  return JSON.stringify({
    plMirrorEnc: true,
    v: 1,
    iv: ivBase64,
    payload: cipherTextBase64,
  });
}

/** Decrypt envelope or return raw string if legacy plaintext JSON mirror. */
export async function openLiveMirrorJson(
  fileText: string,
  passphrase: string,
  saltBase64: string
): Promise<string> {
  const trimmed = String(fileText || "").trim();
  if (!trimmed) throw new Error("empty file");
  let o: { plMirrorEnc?: boolean; v?: number; iv?: string; payload?: string };
  try {
    o = JSON.parse(trimmed) as typeof o;
  } catch {
    return trimmed;
  }
  if (o?.plMirrorEnc !== true || !o.iv || !o.payload) {
    return trimmed;
  }
  return decryptServerBackupPayloadJson(String(o.iv), String(o.payload), passphrase, saltBase64);
}

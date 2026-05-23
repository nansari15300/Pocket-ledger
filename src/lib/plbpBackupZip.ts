"use client";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** Zip ke andar company JSON — attachment bytes alag `attachments/` paths par. */
export const PLBP_MANIFEST_PATH = "manifest.json";

/** ZIP local file header magic `PK`. */
export function isPlbpZipPayload(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Manifest + binary attachment files → deflate zip (company password baad me poori zip par lagta hai). */
export function packPlbpZipBackup(
  manifest: Record<string, unknown>,
  attachmentFiles: Record<string, Uint8Array>
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [PLBP_MANIFEST_PATH]: strToU8(JSON.stringify(manifest)),
    ...attachmentFiles,
  };
  return zipSync(files, { level: 6 });
}

/** Encrypted zip decrypt ke baad manifest + path→bytes map. */
export function unpackPlbpZipBackup(zipBytes: Uint8Array): {
  manifest: Record<string, unknown>;
  filesByPath: Map<string, Uint8Array>;
} {
  const unzipped = unzipSync(zipBytes);
  const manifestRaw = unzipped[PLBP_MANIFEST_PATH];
  if (!manifestRaw) throw new Error("Invalid backup: manifest.json missing inside zip.");
  const manifest = JSON.parse(strFromU8(manifestRaw)) as Record<string, unknown>;
  const filesByPath = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(unzipped)) {
    if (path === PLBP_MANIFEST_PATH) continue;
    filesByPath.set(path, data);
  }
  return { manifest, filesByPath };
}

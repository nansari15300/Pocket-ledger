"use client";

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { Directory } from "@capacitor/filesystem";

type FsModule = typeof import("@capacitor/filesystem");

/** Capacitor Filesystem lazy import — web/electron bundle me optional dependency path safe rahe. */
async function getFsModule(): Promise<FsModule | null> {
  if (!isCapacitorNativeApp()) return null;
  try {
    return await import("@capacitor/filesystem");
  } catch {
    return null;
  }
}

type BlobWriterFn = (opts: {
  path: string;
  directory?: Directory;
  blob: Blob;
  fast_mode?: boolean;
  recursive?: boolean;
  on_fallback?: (error: Error) => void;
}) => Promise<string>;

/** Native blob writer lazy import — base64 bridge avoid ke liye. */
async function getBlobWriter(): Promise<BlobWriterFn | null> {
  if (!isCapacitorNativeApp()) return null;
  try {
    const mod = await import("capacitor-blob-writer");
    return (mod.default || mod) as BlobWriterFn;
  } catch {
    return null;
  }
}

/** Blob -> base64 (Data URL prefix ke bina) — blob writer unavailable ho to Filesystem fallback. */
async function blobToBase64Raw(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Base64 raw -> Blob (preview/open/upload paths ke liye). */
function base64RawToBlob(base64Raw: string, contentType?: string | null): Blob {
  const bin = atob(base64Raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

/** Capacitor DataDirectory me attachment bytes write; return `path` (SQLite ref me store karne ke liye). */
export async function writeAttachmentBlobToDataDir(path: string, blob: Blob): Promise<boolean> {
  const writer = await getBlobWriter();
  if (writer) {
    try {
      // Native direct blob write: JS base64 conversion avoid, UI freeze pressure kam.
      await writer({
        path,
        directory: Directory.Data,
        blob,
        recursive: true,
        // Fallback path trigger diagnostics: plugin khud handled alternative strategy use kare.
        on_fallback(error) {
          console.warn("[capacitorAttachmentFs] blob-writer fallback", { path, message: error?.message || String(error) });
        },
      });
      // Native writer success: path resolution / permission related issues isolate karne ke liye positive trace.
      console.log("[capacitorAttachmentFs] write_ok_native_blob_writer", {
        path,
        size: blob.size,
        contentType: blob.type || null,
      });
      return true;
    } catch (e) {
      // Native writer failure: permission/path errors logcat me explicit dikhane ke liye.
      console.error("[capacitorAttachmentFs] write_fail_native_blob_writer", {
        path,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      // Filesystem fallback below.
    }
  }
  const fs = await getFsModule();
  if (!fs) return false;
  try {
    // Fallback only: base64 bridge slower hota hai, but reliability ke liye रखा.
    const data = await blobToBase64Raw(blob);
    await fs.Filesystem.writeFile({
      path,
      data,
      directory: fs.Directory.Data,
      recursive: true,
    });
    // Requested debug point: Filesystem.writeFile ke turant baad success trace.
    console.log("[capacitorAttachmentFs] write_ok_filesystem_writeFile", {
      path,
      size: blob.size,
      contentType: blob.type || null,
    });
    return true;
  } catch (e) {
    // Requested debug coverage: permission denied / invalid path / missing dir failures.
    console.error("[capacitorAttachmentFs] write_fail_filesystem_writeFile", {
      path,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return false;
  }
}

/** DataDirectory path -> Blob. */
export async function readAttachmentBlobFromDataDir(
  path: string,
  contentType?: string | null,
  /** Row se aaya `sha256_hex` — mismatch par tamper/corrupt treat karke null. */
  expectedSha256Hex?: string | null
): Promise<Blob | null> {
  const fs = await getFsModule();
  if (!fs) return null;
  try {
    const row = await fs.Filesystem.readFile({
      path,
      directory: fs.Directory.Data,
    });
    const raw = typeof row.data === "string" ? row.data : "";
    if (!raw) return null;
    const blob = base64RawToBlob(raw, contentType);
    const exp = expectedSha256Hex?.trim().toLowerCase();
    if (exp) {
      const { computeSha256HexFromBlob } = await import("@/lib/security/sha256Hex");
      const got = (await computeSha256HexFromBlob(blob)).toLowerCase();
      if (got !== exp) {
        console.warn("[capacitorAttachmentFs] sha256 mismatch on read", { path, exp, got });
        return null;
      }
    }
    return blob;
  } catch {
    return null;
  }
}

/** Relative DataDirectory path ka file:// URI (Capacitor.convertFileSrc ke liye). */
export async function getAttachmentFileUriFromDataDir(path: string): Promise<string | null> {
  const fs = await getFsModule();
  if (!fs) return null;
  try {
    const row = await fs.Filesystem.getUri({
      path,
      directory: fs.Directory.Data,
    });
    return typeof row.uri === "string" && row.uri.trim() ? row.uri : null;
  } catch {
    return null;
  }
}

/** Path existence probe — thumbnail cache hit/miss fast check. */
export async function attachmentFileExistsInDataDir(path: string): Promise<boolean> {
  const fs = await getFsModule();
  if (!fs) return false;
  try {
    await fs.Filesystem.stat({
      path,
      directory: fs.Directory.Data,
    });
    return true;
  } catch {
    return false;
  }
}

/** DataDirectory cleanup — stale attachment rows ka disk usage leak avoid. */
export async function deleteAttachmentBlobFromDataDir(path: string): Promise<void> {
  const fs = await getFsModule();
  if (!fs) return;
  try {
    await fs.Filesystem.deleteFile({
      path,
      directory: fs.Directory.Data,
    });
  } catch {
    /* ignore */
  }
}

"use client";

import { Capacitor } from "@capacitor/core";
import { getRemoteAttachmentBlobPreferOfflineCache } from "@/lib/offlineAttachmentUrlCache";

/** Filesystem write ke liye blob → base64 data URL */
function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Share filename — unsafe chars hatao */
export function sanitizeAttachmentShareFileName(name: string): string {
  const base = String(name || "attachment").trim().replace(/[/\\?%*:|"<>]/g, "_") || "attachment";
  return base;
}

/** Extension missing ho to MIME se lagao */
function extensionForMime(mime: string, fileName: string): string {
  const lower = fileName.toLowerCase();
  if (/\.[a-z0-9]{2,5}$/i.test(lower)) return "";
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  return "";
}

function ensureFileNameWithExtension(fileName: string, blob: Blob): string {
  const safe = sanitizeAttachmentShareFileName(fileName);
  const ext = extensionForMime(blob.type || "", safe);
  if (ext && !safe.toLowerCase().endsWith(ext)) return `${safe}${ext}`;
  return safe;
}

/** Preview `src` (blob/data/https/capacitor path) se bytes lao — share ke liye */
export async function fetchBlobFromAttachmentPreviewSrc(src: string): Promise<Blob> {
  const href = String(src || "").trim();
  if (!href) throw new Error("empty attachment src");

  if (href.startsWith("blob:") || href.startsWith("data:")) {
    const res = await fetch(href);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return await res.blob();
  }

  if (/^https?:\/\//i.test(href)) {
    try {
      const cached = await getRemoteAttachmentBlobPreferOfflineCache(href);
      if (cached && cached.size > 0) return cached;
    } catch {
      /* cache miss */
    }
    const res = await fetch(href, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  }

  // Capacitor `convertFileSrc` / local display URL — WebView fetch
  const res = await fetch(href);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return await res.blob();
}

/** Web Share → Capacitor Share (APK) → secure download fallback */
export async function shareAttachmentBlob(
  blob: Blob,
  fileName: string,
  opts?: { dialogTitle?: string }
): Promise<void> {
  const finalName = ensureFileNameWithExtension(fileName, blob);
  const mime = blob.type || "application/octet-stream";
  const file = new File([blob], finalName, { type: mime });
  const dialogTitle = opts?.dialogTitle ?? "Share file";

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: finalName });
        return;
      }
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "AbortError") return;
      console.warn("[shareAttachmentBlob] navigator.share failed", e);
    }
  }

  let isNative = false;
  try {
    isNative = Capacitor.isNativePlatform();
  } catch {
    isNative = false;
  }

  if (isNative) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const dataUrl = await blobToBase64DataUrl(blob);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      const path = `share-${Date.now()}-${finalName.replace(/[/\\]/g, "_")}`;
      await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Cache,
      });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: finalName, url: uri, dialogTitle });
      return;
    } catch (e) {
      console.warn("[shareAttachmentBlob] Capacitor share failed", e);
      throw e;
    }
  }

  const secure = typeof window !== "undefined" && window.isSecureContext;
  if (secure) {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = finalName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    return;
  }

  throw new Error("share-unavailable");
}

/** Voucher attachment preview toolbar — external app (WhatsApp, Drive, …) share */
export async function shareAttachmentFromPreviewSrc(
  src: string,
  fileName: string,
  opts?: { dialogTitle?: string }
): Promise<void> {
  const blob = await fetchBlobFromAttachmentPreviewSrc(src);
  await shareAttachmentBlob(blob, fileName, opts);
}

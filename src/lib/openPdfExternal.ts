"use client";

import { Capacitor } from "@capacitor/core";
import { isRealMobileDevice } from "@/hooks/use-mobile";

/** Capacitor native check — dynamic import se pehle */
function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * APK / real phone browser: in-app PDF.js overlay skip — turant Chrome Custom Tab (http) ya system PDF viewer (blob).
 * PC / tablet emulation desktop par: false, purana overlay / nayi tab.
 */
export function shouldOpenPdfInExternalViewer(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNative()) return true;
  return isRealMobileDevice();
}

/** Blob → base64 data URL (Filesystem write ke liye) */
function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Remote PDF URL (Firebase download, etc.) — native: @capacitor/browser (Chrome Custom Tab); web: window.open.
 */
export async function openHttpPdfInExternalBrowser(url: string): Promise<void> {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) {
    console.warn("[openPdfExternal] expected http(s) URL", u.slice(0, 64));
    return;
  }
  if (isCapacitorNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: u });
      return;
    } catch (e) {
      console.warn("[openPdfExternal] Browser.open failed", e);
    }
  }
  window.open(u, "_blank", "noopener,noreferrer");
}

/**
 * Client-generated PDF blob — native: cache + FileOpener (Chrome / default PDF app); mobile web: nayi tab me blob URL.
 */
export async function openPdfBlobInExternalViewer(blob: Blob, fileName: string): Promise<void> {
  const safeName = (fileName || "document.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_") || "document.pdf";
  if (typeof window === "undefined") return;

  if (!isCapacitorNative()) {
    const bUrl = URL.createObjectURL(blob);
    window.open(bUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => {
      try {
        URL.revokeObjectURL(bUrl);
      } catch {
        /* ignore */
      }
    }, 120_000);
    return;
  }

  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const dataUrl = await blobToBase64DataUrl(blob);
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
    const path = `pdf-external-${Date.now()}-${safeName}`;
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({
      filePath: uri,
      contentType: "application/pdf",
      openWithDefault: true,
    });
  } catch (e) {
    console.warn("[openPdfExternal] FileOpener failed, Share fallback", e);
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const dataUrl = await blobToBase64DataUrl(blob);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      const path = `pdf-share-${Date.now()}-${safeName}`;
      await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: safeName, url: uri, dialogTitle: "Open PDF" });
    } catch (e2) {
      console.warn("[openPdfExternal] Share fallback failed", e2);
      const bUrl = URL.createObjectURL(blob);
      window.open(bUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(bUrl), 120_000);
    }
  }
}

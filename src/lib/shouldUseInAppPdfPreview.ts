"use client";

/**
 * In-app fullscreen PDF overlay (zoom + Print + Share + Close) — browser me bhi seedha **isi page** par;
 * purana behaviour (nayi tab + `window.open`) hata kar reports/attachments/print samaan UX Electron/APK/mobile jaisi.
 */
export function shouldUseInAppPdfPreviewOverlay(): boolean {
  if (typeof window === "undefined") return false;
  return true;
}

/** PDF.js canvas scroll preview — iframe `blob:` WebView/mobile par kamjor; overlay ke saath hi chalao. */
export function shouldUsePdfJsCanvasPreview(): boolean {
  return shouldUseInAppPdfPreviewOverlay();
}

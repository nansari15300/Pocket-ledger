"use client";

/**
 * pdf.js ek hi jagah se load — `legacy/build/pdf.mjs` = nested Webpack runtime;
 * Next/Turbopack us par dobara bundle karke `Object.defineProperty called on non-object` dete hain.
 * **`pdf.min.mjs`** = min prebundle (Webpack+turbopack friendly).
 */

/** Page API — thumbnail / stitched JPEG render */
export type PdfJsPageLike = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: unknown) => { promise: Promise<void> };
};

/** Open PDF document — `getDocument().promise` */
export type PdfJsDocumentLike = {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPageLike>;
  destroy?: () => Promise<void>;
};

/** `getDocument` return — loadingTask */
export type PdfJsLoadingTask = {
  promise: Promise<PdfJsDocumentLike>;
  destroy?: () => void;
};

/** Default export / namespace — main-thread pdf.js API hamari files use karti hain */
export type PdfJsMainThreadApi = {
  version?: string;
  getDocument: (src: unknown) => PdfJsLoadingTask;
};

export async function importPdfJsDist(): Promise<{
  pdfjsLib: Record<string, unknown> & { version?: string; default?: unknown };
  pdfjs: PdfJsMainThreadApi;
}> {
  const pdfjsLib = (await import(
    "pdfjs-dist/legacy/build/pdf.min.mjs"
  )) as Record<string, unknown> & { version?: string; default?: unknown };
  const raw = pdfjsLib.default ?? pdfjsLib;
  const pdfjs = raw as PdfJsMainThreadApi;
  return { pdfjsLib, pdfjs };
}

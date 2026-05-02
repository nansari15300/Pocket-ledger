"use client";

/**
 * pdf.js ek hi jagah se load — `next.config` me pdfjs-dist rules ke saath mismatch kam.
 * Root `import("pdfjs-dist")` kabhi Next/webpack double-bundle se `Object.defineProperty called on non-object` deta hai.
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
    "pdfjs-dist/build/pdf.mjs"
  )) as Record<string, unknown> & { version?: string; default?: unknown };
  const raw = pdfjsLib.default ?? pdfjsLib;
  const pdfjs = raw as PdfJsMainThreadApi;
  return { pdfjsLib, pdfjs };
}

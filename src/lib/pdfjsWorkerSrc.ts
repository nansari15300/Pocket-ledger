/**
 * Single place to set pdf.js worker URL (pdfToImage, in-app PDF preview, etc.).
 *
 * `public/pdf.worker.min.mjs` is copied from `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`
 * on `npm install` (see `scripts/copy-pdf-worker.cjs`). API and worker builds must match.
 */

const LOCAL_PDF_WORKER = "/pdf.worker.min.mjs";

/** Last-resort fallback when `version` is missing (keep aligned with installed `pdfjs-dist`). */
export const PDFJS_WORKER_VERSION_FALLBACK = "5.6.205";

export function setPdfJsWorkerSrc(pdfjs: unknown, _version?: string): void {
  if (typeof window === "undefined") return;
  const ns = pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } };
  if (ns?.GlobalWorkerOptions) {
    ns.GlobalWorkerOptions.workerSrc = LOCAL_PDF_WORKER;
  }
}

/**
 * `compressPdfForAttachment` retry: pehli baar same-origin worker fail ho to CDN worker try karo (ya ulta).
 * version pdfjs-dist se aata hai taaki worker build match rahe.
 */
export function alternatePdfJsWorkerSrc(current: string | undefined, version: string): string {
  const v = version || PDFJS_WORKER_VERSION_FALLBACK;
  const cdn = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
  if (!current || current === LOCAL_PDF_WORKER || !current.includes("unpkg.com")) {
    return cdn;
  }
  return LOCAL_PDF_WORKER;
}

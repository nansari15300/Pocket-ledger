/**
 * Single place to set pdf.js worker URL (pdfToImage, in-app PDF preview, etc.).
 * Worker file: `public/pdf.worker.min.mjs` (same-origin, APK/offline friendly).
 * Keep worker build in sync with `pdfjs-dist` version in package.json when upgrading.
 */

const LOCAL_PDF_WORKER = "/pdf.worker.min.mjs";

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
  const v = version || "5.4.624";
  const cdn = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
  if (!current || current === LOCAL_PDF_WORKER || !current.includes("unpkg.com")) {
    return cdn;
  }
  return LOCAL_PDF_WORKER;
}

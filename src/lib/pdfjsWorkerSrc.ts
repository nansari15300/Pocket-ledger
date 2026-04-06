/**
 * Single place to set pdf.js worker URL (pdfToImage, in-app PDF preview, etc.).
 * Worker file: `public/pdf.worker.min.mjs` (same-origin, APK/offline friendly).
 * Keep worker build in sync with `pdfjs-dist` version in package.json when upgrading.
 */

export function setPdfJsWorkerSrc(pdfjs: unknown, _version?: string): void {
  if (typeof window === "undefined") return;
  const ns = pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } };
  if (ns?.GlobalWorkerOptions) {
    ns.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
}

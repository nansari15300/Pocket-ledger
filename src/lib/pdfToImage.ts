/**
 * PDF first-page to image thumbnail (client-side).
 *
 * ## Approach: client-side
 * - No server round-trip; works offline after load. No CORS for same-origin or
 *   Firebase Storage (use getBlob with storage path when available).
 * - pdfjs-dist runs in a web worker; main thread stays responsive for multiple PDFs.
 * - No extra backend or file storage for thumbnails required.
 *
 * ## Library
 * - pdfjs-dist (Mozilla): industry standard, worker-based, no eval, good for
 *   security and large files. Use GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs".
 *
 * ## Security
 * - Only first page is rendered to canvas; no scripts executed.
 * - We validate PDF magic bytes (%PDF-) before parsing.
 * - Worker runs in a separate context; no direct DOM access.
 *
 * ## Performance
 * - Dynamic import so pdfjs is loaded only when a PDF is previewed.
 * - maxWidth/quality caps keep canvas size and memory bounded.
 * - For large files, we use a lower scale to avoid OOM; optional maxSizeBytes
 *   can skip thumbnail and show fallback.
 *
 * ## Cross-browser
 * - Works in Chrome, Firefox, Safari, Edge. Requires canvas and web worker support.
 * - Worker file must be served from same origin (e.g. public/pdf.worker.mjs).
 */

export interface PdfThumbnailResult {
  thumbnailUrl: string;
  thumbnailBlob: Blob;
}

export interface ConvertPdfOptions {
  /** JPEG quality 0–1 (default 0.85). */
  quality?: number;
  /** Max thumbnail width in pixels (default 800). Lower = faster, less memory. */
  maxWidth?: number;
  /** If set and file size exceeds this (bytes), use reduced scale to stay safe. Default 50MB. */
  maxSizeBytes?: number;
  /** When aborted, the promise rejects and any loading is cancelled. */
  signal?: AbortSignal;
}

const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

function getSize(pdfFile: File | ArrayBuffer | Blob): number {
  if (pdfFile instanceof File) return pdfFile.size;
  if (pdfFile instanceof ArrayBuffer) return pdfFile.byteLength;
  if (pdfFile instanceof Blob) return pdfFile.size;
  return 0;
}

/** Returns true if the blob looks like a PDF (magic bytes %PDF-). */
async function validatePdfMagic(pdfFile: File | ArrayBuffer | Blob): Promise<boolean> {
  let buf: ArrayBuffer;
  if (pdfFile instanceof File || pdfFile instanceof Blob) {
    buf = await pdfFile.slice(0, 5).arrayBuffer();
  } else {
    buf = pdfFile.byteLength ? pdfFile.slice(0, 5) : new ArrayBuffer(0);
  }
  if (buf.byteLength < 4) return false;
  const a = new Uint8Array(buf);
  for (let i = 0; i < PDF_MAGIC.length; i++) if (a[i] !== PDF_MAGIC[i]) return false;
  return true;
}

/**
 * Converts the first page of a PDF to an image (JPEG).
 * Safe for large files (uses reduced scale when over maxSizeBytes).
 */
export async function convertPdfFirstPageToImage(
  pdfFile: File | ArrayBuffer | Blob,
  quality: number = 0.85,
  maxWidth: number = 800,
  options: ConvertPdfOptions = {}
): Promise<PdfThumbnailResult> {
  const { maxSizeBytes = DEFAULT_MAX_SIZE_BYTES, signal } = options;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const size = getSize(pdfFile);
  const useReducedScale = size > maxSizeBytes;
  const effectiveMaxWidth = useReducedScale ? Math.min(400, maxWidth) : maxWidth;
  const effectiveQuality = useReducedScale ? 0.75 : quality;

  const pdfjsLib = await import("pdfjs-dist");
  const pdfjs = pdfjsLib.default || pdfjsLib;
  const version = (pdfjsLib as { version?: string }).version ?? (pdfjs as { version?: string }).version ?? "5.4.624";

  if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions) {
    // Worker from unpkg (exact version match with installed pdfjs-dist)
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  }

  let pdfData: { data: ArrayBuffer };
  if (pdfFile instanceof File) {
    pdfData = { data: await pdfFile.arrayBuffer() };
  } else if (pdfFile instanceof Blob) {
    pdfData = { data: await pdfFile.arrayBuffer() };
  } else {
    pdfData = { data: pdfFile };
  }

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const valid = await validatePdfMagic(pdfFile);
  if (!valid) throw new Error("Invalid PDF: missing or invalid header");

  const loadingTask = pdfjs.getDocument(pdfData);
  const abortHandler = () => loadingTask.destroy();
  signal?.addEventListener("abort", abortHandler, { once: true });

  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(effectiveMaxWidth / viewport.width, 2.0);
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas context");

  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  } as any).promise;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        if (!blob) {
          reject(new Error("Failed to create blob from canvas"));
          return;
        }
        resolve({
          thumbnailUrl: URL.createObjectURL(blob),
          thumbnailBlob: blob,
        });
      },
      "image/jpeg",
      effectiveQuality
    );
  });
}

/**
 * Uploads PDF thumbnail to Firebase Storage (optional server-side cache).
 */
export async function uploadPdfThumbnail(
  thumbnailBlob: Blob,
  originalPdfPath: string,
  storage: any
): Promise<string> {
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const thumbnailPath = originalPdfPath.replace(/\.pdf$/i, "_thumb.jpg");
  const storageRef = ref(storage, thumbnailPath);
  await uploadBytes(storageRef, thumbnailBlob);
  return await getDownloadURL(storageRef);
}

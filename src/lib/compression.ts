"use client";

import { importPdfJsDist } from "@/lib/importPdfJsDist";
import {
  ensurePdfJsWorker,
  PDFJS_WORKER_VERSION_FALLBACK,
} from "@/lib/pdfjsWorkerSrc";

/**
 * Images: A4 @150 DPI max, JPEG out, <= maxKB (default ~150KB band).
 * PDFs (reference app): pdf-lib copy+save, phir zarurat par pdf.js → JPEG per page → pdf-lib embed (0.5MB tak).
 * Mobile: bade image par createImageBitmap se max side 4096.
 */

const MAX_KB_DEFAULT = 150;
const MIN_KB_DEFAULT = 75;

/** Default post-compress ceiling — voucher forms ke 0.5MB check par align */
const DEFAULT_MAX_PDF_BYTES_AFTER = 512 * 1024;

const A4_PORTRAIT = { w: 1240, h: 1754 };
const A4_LANDSCAPE = { w: 1754, h: 1240 };

const MAX_DECODE_DIMENSION = 4096;

/** Bahut zyada pages par raster skip (reference: 50) */
const MAX_PDF_PAGES_FOR_RASTER = 50;

function isPdfLike(file: File): boolean {
  return (
    (file.type || "").toLowerCase() === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export async function compressFile(
  file: File,
  options?: { maxKB?: number; minKB?: number; maxPdfBytesAfter?: number }
): Promise<File> {
  const MAX_KB = options?.maxKB ?? MAX_KB_DEFAULT;
  const MIN_KB = options?.minKB ?? MIN_KB_DEFAULT;
  const maxPdfBytes = options?.maxPdfBytesAfter ?? DEFAULT_MAX_PDF_BYTES_AFTER;

  if (isPdfLike(file)) {
    return compressPdfFile(file, maxPdfBytes);
  }

  if (!file.type.startsWith("image/")) return file;

  if (file.size <= MAX_KB * 1024) return file;

  let imageBitmapToClose: ImageBitmap | null = null;

  try {
    const { source, width: srcW, height: srcH } = await decodeImageForCanvas(file);
    if (source instanceof ImageBitmap) {
      imageBitmapToClose = source;
    }

    const isPortrait = srcH >= srcW;
    const maxW = isPortrait ? A4_PORTRAIT.w : A4_LANDSCAPE.w;
    const maxH = isPortrait ? A4_PORTRAIT.h : A4_LANDSCAPE.h;

    let width = srcW;
    let height = srcH;
    if (width > maxW || height > maxH) {
      const ratio = Math.min(maxW / width, maxH / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);

    if (imageBitmapToClose) {
      try {
        imageBitmapToClose.close();
      } catch {
        /* ignore */
      }
      imageBitmapToClose = null;
    }

    const outType = "image/jpeg";
    let quality = 0.9;
    let bestBlob: Blob | null = null;

    for (let i = 0; i < 14; i++) {
      const blob = await canvasToBlob(canvas, outType, quality);
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;

      const kb = blob.size / 1024;

      if (kb <= MAX_KB) {
        if (kb < MIN_KB) {
          const bumped = await canvasToBlob(canvas, outType, Math.min(0.95, quality + 0.08));
          if (bumped.size / 1024 <= MAX_KB) bestBlob = bumped;
        }
        break;
      }

      quality -= 0.05;
      if (quality < 0.35) break;
    }

    if (!bestBlob) return file;

    const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";

    return new File([bestBlob], newName, {
      type: outType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (imageBitmapToClose) {
      try {
        imageBitmapToClose.close();
      } catch {
        /* ignore */
      }
    }
  }
}

async function decodeImageForCanvas(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      let bm = await createImageBitmap(file);
      const w = bm.width;
      const h = bm.height;
      const maxDim = Math.max(w, h);
      if (maxDim > MAX_DECODE_DIMENSION) {
        const scale = MAX_DECODE_DIMENSION / maxDim;
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const resized = await createImageBitmap(bm, {
          resizeWidth: tw,
          resizeHeight: th,
          resizeQuality: "high",
        });
        bm.close();
        bm = resized;
      }
      return { source: bm, width: bm.width, height: bm.height };
    } catch {
      /* Image() fallback */
    }
  }

  const img = await loadImageWithImageElement(file);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

function loadImageWithImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error("Failed to compress image."));
        resolve(b);
      },
      type,
      quality
    );
  });
}

/**
 * PDF: (1) pdf-lib copy+save, (2) zarurat par pdf.js → JPEG per page → pdf-lib embed.
 * Reference Other App logic — smallest candidate return.
 */
export async function compressPdfFile(
  file: File,
  maxBytes: number = DEFAULT_MAX_PDF_BYTES_AFTER,
  opts?: { forceOptimizeChunkyUnderCap?: boolean }
): Promise<File> {
  if (!isPdfLike(file) || typeof window === "undefined") return file;

  const SOFT_FLOOR = 220 * 1024;
  const chunkyUnderCap =
    opts?.forceOptimizeChunkyUnderCap === true &&
    file.size <= maxBytes &&
    file.size >= SOFT_FLOOR;

  if (file.size <= maxBytes && !chunkyUnderCap) return file;

  const candidates: File[] = [file];

  const shrunk = await tryPdfLibShrink(file);
  if (shrunk) candidates.push(shrunk);

  let bestAfterShrink = shrunk ?? file;
  if (bestAfterShrink.size <= maxBytes && !chunkyUnderCap) return bestAfterShrink;

  const raster = await tryRasterizePdfToSmaller(file, maxBytes);
  candidates.push(raster);

  return candidates.reduce((a, b) => (a.size <= b.size ? a : b));
}

async function tryPdfLibShrink(file: File): Promise<File | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const bytes = await file.arrayBuffer();
    const src = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
    const saved = await out.save({ useObjectStreams: true });
    const bytesCopy = new Uint8Array(saved);
    return new File([bytesCopy], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

async function tryRasterizePdfToSmaller(file: File, maxBytes: number): Promise<File> {
  if (typeof document === "undefined") return file;

  try {
    const { pdfjsLib, pdfjs } = await importPdfJsDist();
    const version =
      (pdfjsLib as { version?: string }).version ??
      pdfjs.version ??
      PDFJS_WORKER_VERSION_FALLBACK;

    await ensurePdfJsWorker(pdfjs as never, version);

    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data,
    }) as { promise: Promise<PdfJsDocLike>; destroy?: () => void };
    const pdfSrc = await loadingTask.promise;

    if (pdfSrc.numPages > MAX_PDF_PAGES_FOR_RASTER) {
      try {
        await pdfSrc.destroy();
      } catch {
        /* ignore */
      }
      return file;
    }
    const numPages = pdfSrc.numPages;

    const passes: { maxW: number; jpegQ: number }[] = [
      { maxW: 1024, jpegQ: 0.62 },
      { maxW: 820, jpegQ: 0.52 },
      { maxW: 640, jpegQ: 0.44 },
      { maxW: 480, jpegQ: 0.38 },
    ];

    let bestFile: File = file;

    for (const pass of passes) {
      const { PDFDocument } = await import("pdf-lib");
      const outDoc = await PDFDocument.create();

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfSrc.getPage(pageNum);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(pass.maxW / base.width, 2.0);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", pass.jpegQ);
        });
        if (!blob) continue;

        const jpgBytes = await blob.arrayBuffer();
        const image = await outDoc.embedJpg(jpgBytes);
        const w = image.width;
        const h = image.height;
        const pdfPage = outDoc.addPage([w, h]);
        pdfPage.drawImage(image, {
          x: 0,
          y: 0,
          width: w,
          height: h,
        });
      }

      const saved = await outDoc.save({ useObjectStreams: true });
      const bytesCopy = new Uint8Array(saved);
      const candidate = new File([bytesCopy], file.name, {
        type: "application/pdf",
        lastModified: Date.now(),
      });

      if (candidate.size < bestFile.size) bestFile = candidate;
      if (candidate.size <= maxBytes) break;
    }

    try {
      await pdfSrc.destroy();
    } catch {
      /* ignore */
    }

    return bestFile;
  } catch {
    return file;
  }
}

type PdfJsDocLike = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: unknown) => { promise: Promise<void> };
  }>;
  destroy: () => Promise<void>;
};

/**
 * Voucher attachments: reference `compressPdfFile` + tiny skip + chunky-under-cap optimize (220KB+).
 */
export async function compressPdfForAttachment(file: File, maxBytes: number): Promise<File> {
  if (!isPdfLike(file) || typeof window === "undefined") return file;

  const MIN_PDF_BYTES_TO_TOUCH = 56 * 1024;
  if (file.size <= MIN_PDF_BYTES_TO_TOUCH) return file;

  const SOFT_SKIP_UNDER_CAP_BYTES = 220 * 1024;
  const chunkyUnderCap = file.size <= maxBytes && file.size >= SOFT_SKIP_UNDER_CAP_BYTES;

  if (file.size <= maxBytes && !chunkyUnderCap) return file;

  return compressPdfFile(file, maxBytes, {
    forceOptimizeChunkyUnderCap: chunkyUnderCap,
  });
}

/** Drive attachment upload ceiling — voucher forms ke 0.5MB check par align. */
export const DRIVE_ATTACHMENT_MAX_BYTES = 512 * 1024;

/** Blob → File → voucher-grade compress; masters / items / vouchers sab Drive par same size band. */
export async function compressAttachmentBlobForDriveUpload(
  blob: Blob,
  opts?: { fileName?: string; contentType?: string; maxBytes?: number }
): Promise<Blob> {
  const maxBytes = opts?.maxBytes ?? DRIVE_ATTACHMENT_MAX_BYTES;
  const contentType = opts?.contentType || blob.type || "";
  const t = contentType.toLowerCase();
  const fileName = opts?.fileName || "file";
  const isPdf = t === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage = t.startsWith("image/");
  if (!isPdf && !isImage) return blob;
  const file = new File([blob], fileName, { type: contentType || "application/octet-stream" });
  return compressVoucherAttachment(file, maxBytes);
}

/** Payment / voucher attachments: image → compressFile; PDF → compressPdfForAttachment; baaki as-is. */
export async function compressVoucherAttachment(file: File, maxBytes: number): Promise<File> {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) {
    const maxKB = Math.max(24, Math.floor(maxBytes / 1024));
    const minKB = Math.min(50, Math.floor(maxKB * 0.45));
    return compressFile(file, { maxKB, minKB, maxPdfBytesAfter: maxBytes });
  }
  if (t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return compressPdfForAttachment(file, maxBytes);
  }
  return file;
}

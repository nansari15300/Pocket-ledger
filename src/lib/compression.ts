"use client";

import { importPdfJsDist } from "@/lib/importPdfJsDist";
import {
  ensurePdfJsWorker,
  PDFJS_WORKER_VERSION_FALLBACK,
} from "@/lib/pdfjsWorkerSrc";

/**
 * Images: A4 @150 DPI max, JPEG out; progressive re-compress until ≤ maxKB.
 * Defaults: Online band max 100KB / soft floor 50KB (callers pass 150KB for Local/PL/Drive).
 * PDFs: pdf-lib shrink, zarurat par pdf.js → JPEG → pdf-lib embed (~0.5MB).
 * Mobile: bade image par createImageBitmap se max side 4096.
 */

const MAX_KB_DEFAULT = 100;
const MIN_KB_DEFAULT = 50;

/** Default post-compress ceiling — voucher PDF / Drive PDF band */
const DEFAULT_MAX_PDF_BYTES_AFTER = 512 * 1024;

const A4_PORTRAIT = { w: 1240, h: 1754 };
const A4_LANDSCAPE = { w: 1754, h: 1240 };

const MAX_DECODE_DIMENSION = 4096;
const QUALITY_FLOOR = 0.26;
const MIN_SCALE = 0.03;
const MAX_IMAGE_PASSES = 40;

/** Bahut zyada pages par raster skip (reference: 50) */
const MAX_PDF_PAGES_FOR_RASTER = 50;

function isPdfLike(file: File): boolean {
  return (
    (file.type || "").toLowerCase() === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Pass size cut: ~101KB → ~10%; ~10000KB → ~50%; mid sizes lerp.
 * Matches: just-over = light; huge = half then re-compress until under max.
 */
function passSizeKeepFactor(currentKb: number, maxKb: number): number {
  if (currentKb <= maxKb * 1.2 || currentKb <= 200) return 0.88;
  if (currentKb >= 10_000) return 0.5;
  const t = Math.min(1, Math.max(0, (currentKb - 200) / (10_000 - 200)));
  return 0.88 - t * 0.38;
}

async function encodeJpegAt(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvasToBlob(canvas, "image/jpeg", quality);
}

export async function compressFile(
  file: File,
  options?: { maxKB?: number; minKB?: number; maxPdfBytesAfter?: number }
): Promise<File> {
  const MAX_KB = options?.maxKB ?? MAX_KB_DEFAULT;
  const MIN_KB = Math.min(options?.minKB ?? MIN_KB_DEFAULT, Math.floor(MAX_KB * 0.85));
  const maxPdfBytes = options?.maxPdfBytesAfter ?? DEFAULT_MAX_PDF_BYTES_AFTER;
  const maxBytes = MAX_KB * 1024;

  if (isPdfLike(file)) {
    return compressPdfFile(file, maxPdfBytes);
  }

  if (!file.type.startsWith("image/")) return file;

  // At/under cap — no compression (quality preserve).
  if (file.size <= maxBytes) return file;

  let imageBitmapToClose: ImageBitmap | null = null;

  try {
    const { source, width: srcW, height: srcH } = await decodeImageForCanvas(file);
    if (source instanceof ImageBitmap) {
      imageBitmapToClose = source;
    }

    const isPortrait = srcH >= srcW;
    const maxW = isPortrait ? A4_PORTRAIT.w : A4_LANDSCAPE.w;
    const maxH = isPortrait ? A4_PORTRAIT.h : A4_LANDSCAPE.h;

    let baseW = srcW;
    let baseH = srcH;
    if (baseW > maxW || baseH > maxH) {
      const ratio = Math.min(maxW / baseW, maxH / baseH);
      baseW = Math.max(1, Math.round(baseW * ratio));
      baseH = Math.max(1, Math.round(baseH * ratio));
    }

    // Huge inputs: start smaller so first passes land near the band faster.
    const sizeKb = file.size / 1024;
    if (sizeKb >= 4000) {
      baseW = Math.max(1, Math.round(baseW * 0.55));
      baseH = Math.max(1, Math.round(baseH * 0.55));
    } else if (sizeKb >= 1500) {
      baseW = Math.max(1, Math.round(baseW * 0.75));
      baseH = Math.max(1, Math.round(baseH * 0.75));
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    const outType = "image/jpeg";
    let quality = sizeKb >= 10_000 ? 0.68 : sizeKb >= 1000 ? 0.8 : 0.9;
    let scale = 1;
    let bestBlob: Blob | null = null;

    for (let pass = 0; pass < MAX_IMAGE_PASSES; pass++) {
      const width = Math.max(1, Math.round(baseW * scale));
      const height = Math.max(1, Math.round(baseH * scale));
      const blob = await encodeJpegAt(canvas, ctx, source as CanvasImageSource, width, height, quality);
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;

      const kb = blob.size / 1024;
      if (kb <= MAX_KB) {
        if (kb < MIN_KB && quality < 0.92) {
          const bumped = await encodeJpegAt(
            canvas,
            ctx,
            source as CanvasImageSource,
            width,
            height,
            Math.min(0.94, quality + 0.08)
          );
          if (bumped.size <= maxBytes && bumped.size >= blob.size) bestBlob = bumped;
        }
        break;
      }

      const keep = passSizeKeepFactor(kb, MAX_KB);
      if (quality > QUALITY_FLOOR + 0.03) {
        quality = Math.max(QUALITY_FLOOR, quality * Math.sqrt(keep));
      } else {
        scale *= Math.sqrt(keep);
        quality = Math.min(0.72, Math.max(QUALITY_FLOOR, quality + 0.04));
      }

      if (scale < MIN_SCALE) break;
    }

    // Hard guarantee: never hand back an oversize image when encode worked.
    let emergency = 0;
    while (bestBlob && bestBlob.size > maxBytes && scale > 0.012 && emergency < 24) {
      emergency += 1;
      scale *= 0.62;
      quality = Math.max(0.2, quality * 0.88);
      const width = Math.max(1, Math.round(baseW * scale));
      const height = Math.max(1, Math.round(baseH * scale));
      const blob = await encodeJpegAt(canvas, ctx, source as CanvasImageSource, width, height, quality);
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= maxBytes) {
        bestBlob = blob;
        break;
      }
    }

    if (imageBitmapToClose) {
      try {
        imageBitmapToClose.close();
      } catch {
        /* ignore */
      }
      imageBitmapToClose = null;
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

/** Drive attachment PDF / non-image ceiling. */
export const DRIVE_ATTACHMENT_MAX_BYTES = 512 * 1024;

/** Drive / local-like image ceiling (Local / PL Server / Drive). */
export const DRIVE_IMAGE_ATTACHMENT_MAX_BYTES = 150 * 1024;

/** Blob → File → voucher-grade compress; masters / items / vouchers sab Drive par same size band. */
export async function compressAttachmentBlobForDriveUpload(
  blob: Blob,
  opts?: { fileName?: string; contentType?: string; maxBytes?: number }
): Promise<Blob> {
  const contentType = opts?.contentType || blob.type || "";
  const t = contentType.toLowerCase();
  const fileName = opts?.fileName || "file";
  const isPdf = t === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage = t.startsWith("image/");
  if (!isPdf && !isImage) return blob;
  const file = new File([blob], fileName, { type: contentType || "application/octet-stream" });
  const maxBytes =
    opts?.maxBytes ??
    (isImage ? DRIVE_IMAGE_ATTACHMENT_MAX_BYTES : DRIVE_ATTACHMENT_MAX_BYTES);
  return compressVoucherAttachment(file, maxBytes);
}

/** Payment / voucher attachments: image → compressFile; PDF → compressPdfForAttachment; baaki as-is. */
export async function compressVoucherAttachment(file: File, maxBytes: number): Promise<File> {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) {
    const maxKB = Math.max(24, Math.floor(maxBytes / 1024));
    // Soft floor ~50KB, but never above ~85% of max (online 100 → 50; local 150 → 50 by default).
    const minKB = Math.min(50, Math.floor(maxKB * 0.5));
    let out = await compressFile(file, { maxKB, minKB, maxPdfBytesAfter: maxBytes });
    // Never leave an oversize image — second pass with a tighter ceiling.
    if (out.size > maxBytes) {
      out = await compressFile(out.size < file.size ? out : file, {
        maxKB: Math.max(18, maxKB - 12),
        minKB: 12,
        maxPdfBytesAfter: maxBytes,
      });
    }
    return out;
  }
  if (t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return compressPdfForAttachment(file, maxBytes);
  }
  return file;
}

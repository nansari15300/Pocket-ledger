"use client";

/**
 * compressFile — Images: A4 @150 DPI max, JPEG out, <= maxKB (default ~150KB band).
 * PDFs: pehle pdf-lib se copy+save (object streams); phir zarurat par pdf.js → JPEG per page → naya PDF (0.5MB tak).
 * Mobile WebView: bade image par decode/canvas fail — pehle createImageBitmap se max side 4096 (PC jaisa stable).
 */

const MAX_KB_DEFAULT = 150;
const MIN_KB_DEFAULT = 75;
/** Default post-compress ceiling (bytes) — voucher forms ke 0.5MB check par align */
const DEFAULT_MAX_PDF_BYTES_AFTER = 512 * 1024;
/** Bahut zyada pages par browser hang / OOM — sirf itne tak raster fallback */
const MAX_PDF_PAGES_FOR_RASTER = 50;

const A4_PORTRAIT = { w: 1240, h: 1754 };
const A4_LANDSCAPE = { w: 1754, h: 1240 };

/** In-memory decode max dimension — mobile GPU / canvas safe zone */
const MAX_DECODE_DIMENSION = 4096;

export async function compressFile(
  file: File,
  options?: { maxKB?: number; minKB?: number; maxPdfBytesAfter?: number }
): Promise<File> {
  const MAX_KB = options?.maxKB ?? MAX_KB_DEFAULT;
  const MIN_KB = options?.minKB ?? MIN_KB_DEFAULT;
  const maxPdfBytes =
    options?.maxPdfBytesAfter ?? DEFAULT_MAX_PDF_BYTES_AFTER;

  // PDF: pehle lossless-ish re-save, phir heavy raster — taaki 0.5MB ke andar aane ki koshish ho
  if (file.type === "application/pdf") {
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
 * PDF ko chhota banane ke liye: (1) pdf-lib copy+save, (2) fail par har page ko JPEG canvas se → naya PDF.
 * Sab attempts ke baad bhi limit se upar ho to smallest file return (caller toast dikha sakta hai).
 */
export async function compressPdfFile(
  file: File,
  maxBytes: number = DEFAULT_MAX_PDF_BYTES_AFTER
): Promise<File> {
  if (file.type !== "application/pdf") return file;
  if (file.size <= maxBytes) return file;

  const candidates: File[] = [file];

  const shrunk = await tryPdfLibShrink(file);
  if (shrunk) candidates.push(shrunk);

  let bestAfterShrink = shrunk ?? file;
  if (bestAfterShrink.size <= maxBytes) return bestAfterShrink;

  const raster = await tryRasterizePdfToSmaller(file, maxBytes);
  candidates.push(raster);

  return candidates.reduce((a, b) => (a.size <= b.size ? a : b));
}

/** pdf-lib: naya document + copy pages — kai PDFs isse hi chhote ho jate hain (duplicate streams hata) */
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
    // Copy: pdf-lib bytes ka type BlobPart se match (SharedArrayBuffer union avoid)
    const bytesCopy = new Uint8Array(saved);
    return new File([bytesCopy], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

/**
 * pdf.js se render + JPEG embed (pdf-lib) — multi-pass: width/quality kam karte hue 0.5MB ke paas lane ki koshish.
 */
async function tryRasterizePdfToSmaller(
  file: File,
  maxBytes: number
): Promise<File> {
  if (typeof document === "undefined") return file;

  try {
    const pdfjsLib = await import("pdfjs-dist");
    const pdfjs = pdfjsLib.default || pdfjsLib;
    const version =
      (pdfjsLib as { version?: string }).version ??
      (pdfjs as { version?: string }).version ??
      "5.4.624";

    const { setPdfJsWorkerSrc } = await import("@/lib/pdfjsWorkerSrc");
    setPdfJsWorkerSrc(pdfjs, version);

    const data = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data });
    const pdfSrc = await loadingTask.promise;
    // Truncate mat karo — 50+ pages par sirf pdf-lib shrink rely (browser hang / OOM se bachne ke liye)
    if (pdfSrc.numPages > MAX_PDF_PAGES_FOR_RASTER) {
      await pdfSrc.destroy();
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

        await page.render({ canvasContext: ctx, viewport } as any).promise;

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
      await pdfSrc.destroy(); // pdf.js: worker / document cleanup
    } catch {
      /* ignore */
    }

    return bestFile;
  } catch {
    return file;
  }
}

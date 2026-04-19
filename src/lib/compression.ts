"use client";

import { alternatePdfJsWorkerSrc, setPdfJsWorkerSrc } from "@/lib/pdfjsWorkerSrc";

/**
 * compressFile — A4 @150 DPI max, JPEG out, <= maxKB (default ~150KB band).
 * Mobile WebView: bade image par decode/canvas fail — pehle createImageBitmap se max side 4096 (PC jaisa stable).
 */

const MAX_KB_DEFAULT = 150;
const MIN_KB_DEFAULT = 75;

const A4_PORTRAIT = { w: 1240, h: 1754 };
const A4_LANDSCAPE = { w: 1754, h: 1240 };

/** In-memory decode max dimension — mobile GPU / canvas safe zone */
const MAX_DECODE_DIMENSION = 4096;

export async function compressFile(
  file: File,
  options?: { maxKB?: number; minKB?: number }
): Promise<File> {
  const MAX_KB = options?.maxKB ?? MAX_KB_DEFAULT;
  const MIN_KB = options?.minKB ?? MIN_KB_DEFAULT;

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

/** Voucher attachment cap (~0.5MB) ke liye PDF page cap — zyada pages par memory/time */
const MAX_PDF_PAGES_COMPRESS = 32;
/** Rasterize width cap; neeche quality / width ghatate hue maxBytes tak */
const PDF_RASTER_MAX_WIDTH_INITIAL = 1120;

async function pdfJsRenderPageToDataUrl(
  page: { getViewport: (p: { scale: number }) => { width: number; height: number }; render: (p: unknown) => { promise: Promise<void> } },
  maxW: number,
  jpegQuality: number
): Promise<{ dataUrl: string; w: number; h: number }> {
  const baseVp = page.getViewport({ scale: 1 });
  const scale = Math.min(1, maxW / baseVp.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const w = Math.max(1, Math.floor(viewport.width));
  const h = Math.max(1, Math.floor(viewport.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");
  const task = page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]);
  await task.promise;
  const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
  return { dataUrl, w, h };
}

async function buildCompressedPdfBlob(
  pdf: { numPages: number; getPage: (i: number) => Promise<unknown> },
  numPages: number,
  jpegQuality: number,
  maxW: number
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  let doc: import("jspdf").jsPDF | null = null;
  for (let i = 1; i <= numPages; i++) {
    const page = (await pdf.getPage(i)) as Parameters<typeof pdfJsRenderPageToDataUrl>[0];
    const { dataUrl, w, h } = await pdfJsRenderPageToDataUrl(page, maxW, jpegQuality);
    if (!doc) {
      doc = new jsPDF({
        unit: "px",
        format: [w, h],
        orientation: w > h ? "landscape" : "portrait",
        compress: true,
      });
      doc.addImage(dataUrl, "JPEG", 0, 0, w, h, undefined, "FAST");
    } else {
      doc.addPage([w, h], w > h ? "l" : "p");
      doc.addImage(dataUrl, "JPEG", 0, 0, w, h, undefined, "FAST");
    }
  }
  if (!doc) throw new Error("Empty PDF.");
  return doc.output("blob") as Blob;
}

/**
 * PDF ko JPEG pages+jsPDF se dubara bandh kar chhota karo (path: voucher ~0.5MB).
 * Pehle `compressFile` image-only tha — PDF pass-through hone se Payment In upload fail ho raha tha.
 */
export async function compressPdfForAttachment(file: File, maxBytes: number): Promise<File> {
  const isPdf =
    (file.type || "").toLowerCase() === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf || typeof window === "undefined") return file;
  if (file.size <= maxBytes) return file;

  const pdfjsLib = await import("pdfjs-dist");
  const pdfjs = (pdfjsLib as { default?: unknown }).default ?? pdfjsLib;
  const version =
    (pdfjsLib as { version?: string }).version ?? (pdfjs as { version?: string }).version ?? "5.4.624";
  setPdfJsWorkerSrc(pdfjs as never, version);

  const raw = new Uint8Array(await file.arrayBuffer());
  let pdf: { numPages: number; getPage: (i: number) => Promise<unknown>; destroy: () => Promise<void> };
  try {
    const loadingTask = (pdfjs as { getDocument: (src: { data: Uint8Array }) => { promise: Promise<typeof pdf> } }).getDocument({ data: raw });
    pdf = await loadingTask.promise;
  } catch (firstErr) {
    console.warn("[compressPdfForAttachment] getDocument retry", firstErr);
    try {
      const ns = pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } };
      const cur = ns.GlobalWorkerOptions?.workerSrc;
      if (ns.GlobalWorkerOptions) ns.GlobalWorkerOptions.workerSrc = alternatePdfJsWorkerSrc(cur, version);
      const loadingTask2 = (pdfjs as { getDocument: (src: { data: Uint8Array }) => { promise: Promise<typeof pdf> } }).getDocument({ data: raw });
      pdf = await loadingTask2.promise;
    } catch {
      return file;
    }
  }

  try {
    if (pdf.numPages > MAX_PDF_PAGES_COMPRESS) {
      throw new Error(
        `This PDF has too many pages (max ${MAX_PDF_PAGES_COMPRESS}). Split the file or shorten it.`
      );
    }
    const n = pdf.numPages;
    let quality = 0.78;
    let maxW = PDF_RASTER_MAX_WIDTH_INITIAL;
    let blob = await buildCompressedPdfBlob(pdf, n, quality, maxW);
    let attempts = 0;
    while (blob.size > maxBytes && attempts < 16) {
      attempts += 1;
      if (quality > 0.42) {
        quality = Math.max(0.38, quality - 0.07);
      } else if (maxW > 560) {
        maxW = Math.floor(maxW * 0.82);
        quality = 0.72;
      } else {
        break;
      }
      blob = await buildCompressedPdfBlob(pdf, n, quality, maxW);
    }
    const baseName = file.name.replace(/\.[^/.]+$/, "") || "document";
    return new File([blob], `${baseName}.pdf`, { type: "application/pdf", lastModified: Date.now() });
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
}

/** Payment / voucher attachments: image → compressFile; PDF → raster+repack; baaki as-is. */
export async function compressVoucherAttachment(file: File, maxBytes: number): Promise<File> {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) {
    const maxKB = Math.max(24, Math.floor(maxBytes / 1024));
    const minKB = Math.min(50, Math.floor(maxKB * 0.45));
    return compressFile(file, { maxKB, minKB });
  }
  if (t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return compressPdfForAttachment(file, maxBytes);
  }
  return file;
}

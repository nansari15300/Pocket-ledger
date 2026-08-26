"use client";

/**
 * Poora PDF (max N pages) ek lambe JPEG me — voucher attach ke liye "PDF ko image me save".
 * Browser canvas height limit (~16k px) — zarurat par scale down.
 */
import { importPdfJsDist } from "@/lib/importPdfJsDist";
import { isPdfLikeUint8Header } from "@/lib/pdfToImage";
import { PDFJS_WORKER_VERSION_FALLBACK, ensurePdfJsWorker } from "@/lib/pdfjsWorkerSrc";

const DEFAULT_MAX_PAGES = 48;
/** Chrome/canvas practical cap — neeche sab pages scale ho kar fit */
const MAX_CANVAS_HEIGHT = 16000;
const DEFAULT_PAGE_MAX_WIDTH = 1000;
/** Do pages ke beech safed gap (px) — stitched JPEG me */
const PAGE_GAP_PX = 30;

type PdfJsDocLike = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: unknown) => { promise: Promise<void> };
  }>;
  destroy: () => Promise<void>;
};

export type ConvertPdfToStitchedJpegOptions = {
  maxPages?: number;
  maxPageWidth?: number;
  quality?: number;
  signal?: AbortSignal;
};

/** Open / preview: multi-page PDF image shortcut se bachne ke liye. */
export async function getPdfPageCount(pdfInput: File | Blob): Promise<number> {
  if (typeof document === "undefined") return 1;
  const { pdfjsLib, pdfjs } = await importPdfJsDist();
  const version =
    (pdfjsLib as { version?: string }).version ??
    pdfjs.version ??
    PDFJS_WORKER_VERSION_FALLBACK;
  await ensurePdfJsWorker(pdfjs as never, version);

  const pdfBytes = new Uint8Array(await pdfInput.arrayBuffer());
  if (!isPdfLikeUint8Header(pdfBytes.subarray(0, Math.min(pdfBytes.byteLength, 256)))) {
    return 1;
  }
  const loadingTask = pdfjs.getDocument({ data: pdfBytes }) as {
    promise: Promise<PdfJsDocLike>;
  };
  const pdfSrc = await loadingTask.promise;
  const n = Math.max(1, pdfSrc.numPages || 1);
  try {
    await pdfSrc.destroy();
  } catch {
    /* ignore */
  }
  return n;
}

export type PortalPdfRasterMeta = {
  pageCount: number;
  /** Stitched JPEG me pehli page ki height (natural px) — portal fit 1 page ke liye. */
  onePageHeightPx: number;
};

/** Hover portal: 1 page → first-page raster; 2+ pages → vertical stitched JPEG (scroll). */
export async function convertPdfForPortalRasterPreview(
  pdfInput: File | Blob,
  options?: { quality?: number; maxPageWidth?: number; signal?: AbortSignal }
): Promise<{ thumbnailUrl: string; thumbnailBlob: Blob; portalMeta?: PortalPdfRasterMeta }> {
  const quality = options?.quality ?? 0.92;
  const maxPageWidth = options?.maxPageWidth ?? 1800;
  const signal = options?.signal;

  const pageCount = await getPdfPageCount(pdfInput);
  if (pageCount > 1) {
    const stitched = await convertPdfToStitchedJpegFile(pdfInput, {
      maxPageWidth,
      quality,
      signal,
    });
    return {
      thumbnailUrl: URL.createObjectURL(stitched.file),
      thumbnailBlob: stitched.file,
      portalMeta: {
        pageCount: stitched.pageCount,
        onePageHeightPx: stitched.onePageHeightPx,
      },
    };
  }

  const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
  return convertPdfFirstPageToImage(pdfInput, quality, maxPageWidth, { signal });
}

export type StitchedJpegResult = {
  file: File;
  pageCount: number;
  onePageHeightPx: number;
};

/**
 * PDF → ek hi JPEG file (pages vertically stacked). Naam: `foo.pdf` → `foo_all_pages.jpg`
 */
export async function convertPdfToStitchedJpegFile(
  pdfInput: File | Blob,
  options: ConvertPdfToStitchedJpegOptions = {}
): Promise<StitchedJpegResult> {
  if (typeof document === "undefined") {
    throw new Error("convertPdfToStitchedJpegFile requires browser");
  }
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxPageWidth = options.maxPageWidth ?? DEFAULT_PAGE_MAX_WIDTH;
  const quality = options.quality ?? 0.82;
  const signal = options.signal;

  const { pdfjsLib, pdfjs } = await importPdfJsDist();
  const version =
    (pdfjsLib as { version?: string }).version ??
    pdfjs.version ??
    PDFJS_WORKER_VERSION_FALLBACK;
  await ensurePdfJsWorker(pdfjs as never, version);

  const pdfBytes = new Uint8Array(await pdfInput.arrayBuffer());
  if (!isPdfLikeUint8Header(pdfBytes.subarray(0, Math.min(pdfBytes.byteLength, 256)))) {
    throw new Error("Invalid PDF: missing header");
  }
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
  }) as { promise: Promise<PdfJsDocLike>; destroy?: () => void };
  const pdfSrc = await loadingTask.promise;

  const numPages = Math.min(pdfSrc.numPages, maxPages);

  const pageDims: { w: number; h: number }[] = [];
  for (let p = 1; p <= numPages; p++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const page = await pdfSrc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxPageWidth / base.width, 2);
    const vp = page.getViewport({ scale });
    pageDims.push({ w: vp.width, h: vp.height });
  }

  const targetW = Math.max(...pageDims.map((d) => d.w), 1);
  let totalH = pageDims.reduce((s, d) => s + d.h, 0);
  if (numPages > 1) totalH += (numPages - 1) * PAGE_GAP_PX;
  let globalScale = 1;
  if (totalH > MAX_CANVAS_HEIGHT) {
    globalScale = MAX_CANVAS_HEIGHT / totalH;
  }

  const canvasW = Math.max(1, Math.floor(targetW * globalScale));
  const canvasH = Math.max(1, Math.floor(totalH * globalScale));
  const onePageHeightPx = Math.max(1, Math.floor(pageDims[0].h * globalScale));

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  let y = 0;
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (pageNum > 1 && pageNum % 2 === 1) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    const page = await pdfSrc.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(maxPageWidth / base.width, 2) * globalScale;
    const viewport = page.getViewport({ scale });
    const pw = Math.floor(viewport.width);
    const ph = Math.floor(viewport.height);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = pw;
    pageCanvas.height = ph;
    const pctx = pageCanvas.getContext("2d");
    if (!pctx) continue;
    pctx.fillStyle = "#ffffff";
    pctx.fillRect(0, 0, pw, ph);
    await page.render({ canvasContext: pctx, viewport } as Parameters<typeof page.render>[0]).promise;

    const drawH = ph;
    // Pehli page ke baad 30px gap (globalScale se canvas coords me)
    if (pageNum > 1) y += PAGE_GAP_PX * globalScale;
    ctx.drawImage(pageCanvas, 0, y, pw, drawH);
    y += drawH;
  }

  try {
    await pdfSrc.destroy();
  } catch {
    /* ignore */
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("JPEG export failed"));
        else resolve(b);
      },
      "image/jpeg",
      quality
    );
  });

  const baseName =
    pdfInput instanceof File
      ? pdfInput.name.replace(/\.pdf$/i, "_all_pages")
      : "attachment_all_pages";

  const file = new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
  return { file, pageCount: numPages, onePageHeightPx };
}

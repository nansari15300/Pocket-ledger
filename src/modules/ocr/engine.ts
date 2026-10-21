"use client";
/**
 * Fully local OCR engine: tesseract.js (runs in its own Web Worker) + locally bundled assets under
 * `public/ocr/` (worker, wasm core, eng+nep traineddata). No CDN / cloud calls.
 */
import type { OcrRawResult } from "./types";
import { fileToOcrCanvas } from "./preprocess";
import { linesFromTesseractData } from "./layout";
import { publicAssetUrl } from "@/lib/webAppBasePath";
import { resolvePdfJsWorkerHref } from "@/lib/pdfjsWorkerSrc";

type TWorker = {
  recognize: (img: unknown, opts?: unknown, output?: unknown) => Promise<{ data: any }>;
  setParameters: (p: Record<string, unknown>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

const workers = new Map<string, Promise<TWorker>>();

/**
 * Public asset base for OCR files. Web app runs under a basePath (dev gateway / prod: `/app`), so
 * `/ocr/` must go through `publicAssetUrl` (same as pdf.worker). file:// (packaged Electron): next to
 * the export root, found the same way as the pdf.js worker.
 */
export function ocrAssetBase(): string {
  if (typeof window === "undefined") return publicAssetUrl("/ocr/");
  if (window.location.protocol === "file:") {
    const pdfWorker = resolvePdfJsWorkerHref();
    return new URL("ocr/", pdfWorker).href;
  }
  return new URL(publicAssetUrl("/ocr/"), window.location.origin).href;
}

/** One worker per language set. English first: mixed eng+nep on English bills hurt accuracy (PAN read as Devanagari). */
function getWorker(langs: "eng" | "nep" = "eng"): Promise<TWorker> {
  let p = workers.get(langs);
  if (!p) {
    p = (async () => {
      const { createWorker } = await import("tesseract.js");
      const base = ocrAssetBase();
      const w = await createWorker(langs === "nep" ? ["nep", "eng"] : ["eng"], 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: `${base}tessdata`,
        gzip: true,
      } as never);
      return w as unknown as TWorker;
    })().catch((e) => {
      workers.delete(langs);
      throw e;
    });
    workers.set(langs, p);
  }
  return p;
}

export async function terminateOcrWorker() {
  const all = [...workers.values()];
  workers.clear();
  for (const p of all) (await p.catch(() => null))?.terminate();
}

function isAndroidWebView() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export async function runOcrOnFile(file: Blob, mime: string): Promise<OcrRawResult> {
  const timeoutMs = isAndroidWebView() ? 40000 : 25000;
  const job = (async () => {
    const canvas = await fileToOcrCanvas(file, mime, isAndroidWebView() ? 2500 : 3500);
    if (process.env.NODE_ENV !== "production") {
      console.info(`[OCR] engine input ${mime} ${(file.size / 1024).toFixed(0)} KB -> canvas ${canvas.width}x${canvas.height}px`);
    }
    const worker = await getWorker("eng");
    // Pass A (layout + words): PSM 6 single block - PSM 3 split the bill table into column blocks (no header/lines/VAT)
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    let { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
    // Devanagari bill? (few Latin letters) -> nep+eng pass replaces A
    const txt = String(data?.text ?? "");
    const latin = (txt.match(/[A-Za-z]/g) ?? []).length;
    const deva = (txt.match(/[\u0900-\u097F]/g) ?? []).length;
    if (latin < 40 || deva > latin) {
      const nep = await getWorker("nep");
      data = (await nep.recognize(canvas, {}, { blocks: true, text: true })).data;
    }
    // Pass B (sparse text): only used to CONFIRM numbers pass A missed (e.g. bold boxed grand total)
    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    const alt = (await worker.recognize(canvas, {}, { text: true })).data;
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    return {
      text: String(data?.text ?? ""),
      lines: linesFromTesseractData(data),
      meanConfidence: Number(data?.confidence ?? 0),
      pageHeight: canvas.height,
      pageWidth: canvas.width,
      altText: String(alt?.text ?? ""),
    } satisfies OcrRawResult;
  })();
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("OCR timed out")), timeoutMs);
  });
  try {
    return await Promise.race([job, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

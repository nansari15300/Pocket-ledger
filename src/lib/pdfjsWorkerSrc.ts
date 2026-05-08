/**
 * Single place to set pdf.js worker URL (pdfToImage, in-app PDF preview, etc.).
 *
 * `public/pdf.worker.min.mjs` is copied from `node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs`
 * on `npm install` (see `scripts/copy-pdf-worker.cjs`). API and worker builds must match.
 *
 * EXE (Electron localhost static server) + APK WebView: root-relative `/...` kabhi MIME/host resolve me atak jata tha —
 * **`origin` + absolute href** + (packaged Electron) **`text/javascript` for *.mjs`** se worker load web jaisa stable.
 */

const LOCAL_PDF_WORKER_PATH = "/pdf.worker.min.mjs";

/** Last-resort fallback when `version` is missing (keep aligned with installed `pdfjs-dist`). */
export const PDFJS_WORKER_VERSION_FALLBACK = "5.6.205";

/** Same-document origin par worker ka poora URL — `new URL("/", href)` avoids base-tag edge cases */
export function resolvePdfJsWorkerHref(): string {
  if (typeof window === "undefined") return LOCAL_PDF_WORKER_PATH;
  try {
    return new URL(LOCAL_PDF_WORKER_PATH, window.location.origin).href;
  } catch {
    return LOCAL_PDF_WORKER_PATH;
  }
}

/**
 * Har `getDocument` se pehle await karo — worker URL set + local asset reachable check;
 * fail par CDN worker (sirf online) ta EXE/APK me bhi web jaisa PDF→canvas flow chale.
 */
export async function ensurePdfJsWorker(pdfjs: unknown, version?: string): Promise<void> {
  if (typeof window === "undefined") return;
  const ns = pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } };
  if (!ns?.GlobalWorkerOptions) return;

  const v = version || PDFJS_WORKER_VERSION_FALLBACK;
  const localHref = resolvePdfJsWorkerHref();

  ns.GlobalWorkerOptions.workerSrc = localHref;

  const okLocal = await fetchWorkerProbe(localHref);
  if (okLocal) return;

  const cdn = `https://unpkg.com/pdfjs-dist@${v}/legacy/build/pdf.worker.min.mjs`;
  const okCdn = await fetchWorkerProbe(cdn);
  if (okCdn) {
    ns.GlobalWorkerOptions.workerSrc = cdn;
    return;
  }

  ns.GlobalWorkerOptions.workerSrc = localHref;
}

async function fetchWorkerProbe(href: string): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 12_000);
    try {
      const res = await fetch(href, { method: "GET", cache: "force-cache", signal: ac.signal });
      return res.ok;
    } finally {
      window.clearTimeout(t);
    }
  } catch {
    return false;
  }
}

/** Legacy sync hook — sirf URL set karta hai; naya code `ensurePdfJsWorker` prefer kare */
export function setPdfJsWorkerSrc(pdfjs: unknown, _version?: string): void {
  if (typeof window === "undefined") return;
  const ns = pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } };
  if (ns?.GlobalWorkerOptions) {
    ns.GlobalWorkerOptions.workerSrc = resolvePdfJsWorkerHref();
  }
}

/**
 * `compressPdfForAttachment` retry: pehli baar same-origin worker fail ho to CDN worker try karo (ya ulta).
 * version pdfjs-dist se aata hai taaki worker build match rahe.
 */
export function alternatePdfJsWorkerSrc(current: string | undefined, version: string): string {
  const v = version || PDFJS_WORKER_VERSION_FALLBACK;
  const cdn = `https://unpkg.com/pdfjs-dist@${v}/legacy/build/pdf.worker.min.mjs`;
  if (!current || current === LOCAL_PDF_WORKER_PATH || !current.includes("unpkg.com")) {
    return cdn;
  }
  return resolvePdfJsWorkerHref();
}

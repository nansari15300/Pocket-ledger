# PDF first-page preview (thumbnail)

This app generates a preview image of **page 1** for uploaded or selected PDFs, so users see a thumbnail before opening the full file.

## Best approach: client-side

We use **client-side rendering** for the first-page preview:

- **No server round-trip** – works offline after the app and worker are loaded; no CORS for same-origin or Firebase Storage (we use the Storage SDK when we have a path).
- **Web worker** – `pdfjs-dist` runs in a worker so the main thread stays responsive when multiple PDFs are previewed.
- **No backend thumbnail storage required** – thumbnails are generated on demand and kept in memory (blob URLs) or can be cached via `uploadPdfThumbnail()` if needed.

Server-side would require uploading the PDF to the server, generating the image there, and returning a URL – more latency, CORS, and infrastructure. Client-side is the recommended approach for modern browsers.

## Recommended library

- **pdfjs-dist** (Mozilla PDF.js)  
  Used for parsing and rendering the first page to a canvas. It’s the same engine used in Firefox, runs in a web worker, and doesn’t rely on `eval` or unsafe patterns. Worker file must be served from your origin (e.g. `public/pdf.worker.min.mjs`).

## Where it’s implemented

| File | Role |
|------|------|
| `src/lib/pdfToImage.ts` | Converts first page of a PDF (File/Blob/ArrayBuffer) to a JPEG; options for quality, maxWidth, large-file handling, and AbortSignal. |
| `src/components/vouchers/FilePreview.tsx` | Uses `convertPdfFirstPageToImage` for PDFs; shows loading spinner, then thumbnail or fallback PDF icon; supports `storagePath` for Firebase. |

## Security considerations

- **Only first page** is rendered to a canvas; no execution of PDF scripts.
- **Magic-byte check** – we validate the blob starts with `%PDF-` before passing it to the parser to avoid treating non-PDF data as PDF.
- **Worker** runs in a separate context with no direct DOM access.
- **Blob URLs** are created for thumbnails and are **revoked** on cleanup or when the preview is replaced to avoid leaks and long-lived references.
- **Firebase Storage**: when you have the storage path, we use `getBlob(ref(storage, path))` instead of `fetch(url)` so we don’t depend on CORS for download URLs.

## Performance

- **Dynamic import** – `pdfjs-dist` is loaded only when a PDF is previewed.
- **maxWidth / quality** – thumbnail size and JPEG quality are capped so canvas and memory use stay bounded.
- **Large files** – if the file is over `maxSizeBytes` (default 50MB), we use a lower scale and quality to reduce memory and avoid OOM.
- **Cancellation** – when the component unmounts or the file changes, we abort the loading task and revoke blob URLs so work and memory are released quickly.
- **Multiple PDFs** – each `FilePreview` instance runs its own generation; the worker and abort logic keep the UI responsive.

## Cross-browser

- Works in **Chrome, Firefox, Safari, Edge** with standard canvas and web worker support.
- The worker script must be served from the **same origin** (e.g. from `public/` in Next.js). Use `GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` (or your actual worker filename).
- No special browser settings or flags are required.

## Fallback

If thumbnail generation fails (network, CORS, invalid PDF, or abort), we show a **fallback PDF icon** (red box with “PDF” label) and do not log to the console for expected failures.

## Usage

- **Gallery / unassigned documents**: pass `file={url}` and `storagePath={file.path}` so PDFs are loaded via Firebase Storage and preview is generated from the first page.
- **Upload flows**: pass a `File`; `FilePreview` will use it directly and show the loading indicator, then the first-page thumbnail or the fallback icon.

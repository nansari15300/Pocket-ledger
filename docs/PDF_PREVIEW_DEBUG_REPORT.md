# PDF Preview Debug Checklist – Report

Checklist अनुसार codebase मा के छ / के छैन को रिपोर्ट।

---

## A. Basic Setup

| Check | Status | Details |
|-------|--------|---------|
| pdfjs-dist installed? | ✅ **छ** | `npm list pdfjs-dist` → `pdfjs-dist@5.4.624` |
| Install command | ✅ Not needed | Already in `package.json` |

---

## B. Worker Config (सबैभन्दा common issue)

| Check | Status | Details |
|-------|--------|---------|
| workerSrc set? | ✅ **छ** | `src/lib/pdfToImage.ts` |
| CDN (version-matched)? | ✅ **छ** | Worker अहिले **unpkg** CDN बाट load हुन्छ (installed version जस्तै `5.4.624`) |

**Current:**  
`pdfjs.GlobalWorkerOptions.workerSrc = \`https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs\``  

यसले local `public/pdf.worker.min.mjs` को 404 / version mismatch issue हटाउँछ। Console मा "workerSrc not set" वा "Failed to load worker" आउनु पर्दैन।

---

## C. File Load Check

| Check | Status | Details |
|-------|--------|---------|
| File object सही? | ✅ **छ** | File / Blob / ArrayBuffer सबै handle छ (`FilePreview` + `pdfToImage`) |
| URL create (blob URL)? | ✅ **छ** | `FilePreview`: blob URL only for display/open; PDF load को लागि **ArrayBuffer** use छ (URL होइन) |

**Note:** हामी PDF load गर्दा `getDocument({ data: arrayBuffer })` use गर्छौं, `getDocument(url)` होइन। त्यसैले blob URL को लागि “URL सही generate भएको छ?” को जवाफ: **data path मा सही ArrayBuffer/Blob पुग्छ**, URL optional छ।

---

## D. PDF Load Stage

| Check | Status | Details |
|-------|--------|---------|
| getDocument run हुन्छ? | ✅ **छ** | `pdfToImage.ts` line 111–118: `pdfjs.getDocument(pdfData)` then `loadingTask.promise` |
| invalid/corrupted/network | ✅ Handled | Magic bytes check (`%PDF-`), then getDocument; error → catch → fallback icon |
| Abort support | ✅ **छ** | `loadingTask.destroy()` on `signal.abort` |

---

## E. Page Fetch Stage

| Check | Status | Details |
|-------|--------|---------|
| page fetch (first page)? | ✅ **छ** | `const page = await pdf.getPage(1);` – line 124 |

---

## F. Canvas Render

| Check | Status | Details |
|-------|--------|---------|
| canvas dimensions 0 छैन? | ✅ **छ** | `scale` from viewport; `canvas.width/height = scaledViewport.width/height` (line 129–130) |
| render promise complete? | ✅ **छ** | `await page.render({...}).promise` – line 136–139 |

---

## G. Image Convert

| Check | Status | Details |
|-------|--------|---------|
| Image data generate? | ✅ **छ** | `canvas.toBlob(..., "image/jpeg", quality)` → `URL.createObjectURL(blob)` (toDataURL होइन, blob URL use छ) |
| Preview state set? | ✅ **छ** | `setPdfThumbnailSafe(result.thumbnailUrl)` in `FilePreview` |

---

## H. UI Render

| Check | Status | Details |
|-------|--------|---------|
| img ma src pass? | ✅ **छ** | `<Image src={pdfThumbnail} ... />` when `pdfThumbnail` is set – line 251–258 |
| preview state null check? | ✅ **छ** | `pdfThumbnail` truthy भएमा image, नभएमा fallback PDF icon (line 249–266) |

---

## I. Browser Issues

| Check | Status | Details |
|-------|--------|---------|
| Chrome / Incognito / Adblock | ⬜ Manual | Code मा check गर्न मिल्दैन; manually test गर्नुपर्छ |

---

## J. Next.js Specific

| Check | Status | Details |
|-------|--------|---------|
| "use client" component? | ✅ **छ** | `FilePreview.tsx` line 1: `"use client"` |
| PDF logic in server component? | ✅ **छैन** | PDF logic सबै `FilePreview` (client) र `pdfToImage` (dynamic import, client-side) मा छ |

---

## Summary – के पुगेको छैन / सुधार

1. **Worker (B)** – ✅ **पुगेको छ:** CDN (unpkg) बाट version-matched worker use हुन्छ।  
2. **बाँकी checklist**  
   - A, C, D, E, F, G, H, J सबै code मा **पुगेको छ**।  
   - I (Browser) manual testing मा निर्भर छ।

---

## 90% case

- **worker path:** अहिले CDN (unpkg) use भएकोले worker-not-set / Failed-to-load-worker समस्या नआउनुपर्छ।  
- **file/URL:** ArrayBuffer/Blob + Firebase storagePath सही पुगिरहेको छ।

यो report को आधारमा सबैभन्दा पहिले **Worker Config (B)** fix गर्दा धेरै जसो “preview spin / load नभएको” issue सुल्झन्छ।

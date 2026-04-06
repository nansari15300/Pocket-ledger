"use client";

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

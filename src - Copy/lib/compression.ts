"use client";

/**
 * ✅ Drop-in replacement for your existing compressFile()
 * - A4 @150 DPI max
 *   Portrait: 1240x1754
 *   Landscape: 1754x1240
 * - If image is bigger => resize to fit
 * - Auto detects orientation
 * - Compresses to <= 500KB (best effort) and avoids going too low (<100KB)
 * - Same export name: compressFile
 */

const MAX_KB_DEFAULT = 150;
const MIN_KB_DEFAULT = 75;

const A4_PORTRAIT = { w: 1240, h: 1754 };
const A4_LANDSCAPE = { w: 1754, h: 1240 };

export async function compressFile(
  file: File,
  options?: { maxKB?: number; minKB?: number }
): Promise<File> {
  const MAX_KB = options?.maxKB ?? MAX_KB_DEFAULT;
  const MIN_KB = options?.minKB ?? MIN_KB_DEFAULT;

  // Only images
  if (!file.type.startsWith("image/")) return file;

  // If already within max, keep it (no quality loss)
  if (file.size <= MAX_KB * 1024) return file;

  const img = await loadImage(file);

  // Original dimensions
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  // Orientation detect
  const isPortrait = height >= width;
  const maxW = isPortrait ? A4_PORTRAIT.w : A4_LANDSCAPE.w;
  const maxH = isPortrait ? A4_PORTRAIT.h : A4_LANDSCAPE.h;

  // Resize only if larger than A4@150dpi box
  if (width > maxW || height > maxH) {
    const ratio = Math.min(maxW / width, maxH / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  // Draw on canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  // Choose output type:
  // - PNG is huge; for documents/photos, JPEG is best.
  // - Keep JPG/JPEG as JPEG, and also convert PNG -> JPEG.
  const outType = "image/jpeg";

  // Try qualities from high to low until <= MAX_KB
  let quality = 0.9;
  let bestBlob: Blob | null = null;

  for (let i = 0; i < 14; i++) {
    const blob = await canvasToBlob(canvas, outType, quality);
    if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;

    const kb = blob.size / 1024;

    if (kb <= MAX_KB) {
      // Avoid going too tiny (< MIN_KB) if possible: bump quality slightly once
      if (kb < MIN_KB) {
        const bumped = await canvasToBlob(canvas, outType, Math.min(0.95, quality + 0.08));
        if (bumped.size / 1024 <= MAX_KB) bestBlob = bumped;
      }
      break;
    }

    quality -= 0.05;
    if (quality < 0.35) break;
  }

  // If something failed, return original
  if (!bestBlob) return file;

  // Rename extension to .jpg if original was png/webp etc (optional but clean)
  const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";

  return new File([bestBlob], newName, {
    type: outType,
    lastModified: Date.now(),
  });
}

/* ---------------- helpers ---------------- */

function loadImage(file: File): Promise<HTMLImageElement> {
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

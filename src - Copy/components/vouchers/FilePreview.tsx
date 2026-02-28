"use client";

import * as React from "react";
import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { storage } from "@/lib/firebase";
import { ref, getBlob } from "firebase/storage";

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

interface FilePreviewProps {
  file: File | string;
  onRemove?: () => void;
  isAvatar?: boolean;
  isCompressing?: boolean;
  compressionResult?: { originalSize: number; compressedSize: number } | null;
  children?: React.ReactNode;
  size?: number;
  fileSize?: number; // Accept size from parent
  className?: string;
  disabled?: boolean; // Make preview non-clickable
  /** Firebase Storage path (e.g. companies/xxx/unassigned/yyy.pdf). When set, PDF thumbnail is loaded via SDK to avoid CORS/fetch failures. */
  storagePath?: string;
}

const getCleanName = (name: string) => {
  if (name.includes('_')) {
    return name.split('_').slice(1).join('_');
  }
  return name;
};

export function FilePreview({
  file,
  onRemove,
  isCompressing: isCompressingProp,
  compressionResult,
  children,
  size = 96,
  fileSize,
  className,
  disabled = false,
  storagePath,
}: FilePreviewProps) {
  
  const [fileInfo, setFileInfo] = useState<{
    url: string | null;
    type: "image" | "pdf" | "other";
    name: string;
    size: number | null;
  }>({ url: null, type: "other", name: "loading...", size: null });

  const [isLoading, setIsLoading] = useState(true);
  const [pdfThumbnail, setPdfThumbnail] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const thumbnailUrlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Revoke object URL to avoid memory leaks (thumbnails are blob URLs)
  const revokeThumbnailUrl = useCallback((url: string | null) => {
    if (url && url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }, []);

  const setPdfThumbnailSafe = useCallback((url: string | null) => {
    if (thumbnailUrlRef.current !== url) {
      revokeThumbnailUrl(thumbnailUrlRef.current);
      thumbnailUrlRef.current = url;
      setPdfThumbnail(url);
    }
  }, [revokeThumbnailUrl]);

  const PDF_THUMBNAIL_TIMEOUT_MS = 3_000;

  // Generate PDF thumbnail (first page as image). Supports multiple PDFs; loading state and fallback icon handled.
  const generatePdfThumbnail = useCallback(
    async (
      pdfUrl: string,
      fileObject?: File,
      firebaseStoragePath?: string,
      signal?: AbortSignal
    ) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const t = setTimeout(
          () => reject(new DOMException("PDF preview timed out", "AbortError")),
          PDF_THUMBNAIL_TIMEOUT_MS
        );
        signal?.addEventListener("abort", () => clearTimeout(t), { once: true });
      });

      const run = async () => {
        setIsPdfLoading(true);
        let pdfFile: File | ArrayBuffer | Blob;

        if (fileObject instanceof File) {
          pdfFile = fileObject;
        } else if (firebaseStoragePath && storage) {
          const storageRef = ref(storage, firebaseStoragePath);
          pdfFile = await getBlob(storageRef);
        } else if (pdfUrl.startsWith("blob:")) {
          const response = await fetch(pdfUrl, { signal });
          pdfFile = await response.blob();
        } else if (pdfUrl.startsWith("http")) {
          const response = await fetch(pdfUrl, { mode: "cors", signal });
          pdfFile = await response.blob();
        } else {
          setIsPdfLoading(false);
          return;
        }

        if (signal?.aborted) return;

        const { convertPdfFirstPageToImage } = await import("@/lib/pdfToImage");
        const result = await convertPdfFirstPageToImage(
          pdfFile,
          0.85,
          size > 150 ? 800 : 600,
          { signal }
        );

        if (signal?.aborted) {
          revokeThumbnailUrl(result.thumbnailUrl);
          return;
        }
        setPdfThumbnailSafe(result.thumbnailUrl);
      };

      try {
        await Promise.race([run(), timeoutPromise]);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setPdfThumbnailSafe(null);
      } finally {
        setIsPdfLoading(false);
      }
    },
    [size, revokeThumbnailUrl, setPdfThumbnailSafe]
  );

  useEffect(() => {
    let objectUrl: string | null = null;
    const controller = new AbortController();
    let fileObject: File | null = null;

    const processFile = async () => {
      setIsLoading(true);
      let resolvedUrl: string | null = null;
      let resolvedType: "image" | "pdf" | "other" = "other";
      let resolvedName = "file";
      let resolvedSize: number | null = fileSize ?? null;

      if (typeof file === "string") {
        resolvedUrl = file;
        const cleanUrl = file.split("?")[0].toLowerCase();
        if (cleanUrl.endsWith(".pdf") || file.startsWith("data:application/pdf")) {
          resolvedType = "pdf";
        } else if (cleanUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)$/) || file.startsWith("data:image/")) {
          resolvedType = "image";
        }
        try {
          resolvedName = decodeURIComponent(file.split("/").pop()?.split("?")[0] || "file");
        } catch (e) {
          console.error("Could not decode file name", e);
        }
      } else if (file instanceof File) {
        fileObject = file;
        objectUrl = URL.createObjectURL(file);
        resolvedUrl = objectUrl;
        resolvedName = file.name;
        resolvedSize = file.size;
        if (file.type.startsWith("image/")) {
          resolvedType = "image";
        } else if (file.type === "application/pdf") {
          resolvedType = "pdf";
        }
      }

      setFileInfo({ url: resolvedUrl, type: resolvedType, name: resolvedName, size: resolvedSize });
      setIsLoading(false);

      if (resolvedType === "pdf") {
        setPdfThumbnailSafe(null); // clear previous so loading shows for this PDF
        if (fileObject) {
          generatePdfThumbnail(resolvedUrl!, fileObject, undefined, controller.signal);
        } else if (resolvedUrl) {
          generatePdfThumbnail(resolvedUrl, undefined, storagePath, controller.signal);
        }
      } else {
        setPdfThumbnailSafe(null);
      }
    };

    processFile();

    // Stop spinner after 12s if thumbnail never loads (e.g. worker or PDF hang)
    const timeoutId = setTimeout(() => controller.abort(), PDF_THUMBNAIL_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      revokeThumbnailUrl(thumbnailUrlRef.current);
      thumbnailUrlRef.current = null;
      setPdfThumbnail(null);
    };
  }, [file, fileSize, storagePath, generatePdfThumbnail, setPdfThumbnailSafe, revokeThumbnailUrl]);

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (children || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (fileInfo.url) {
      window.open(fileInfo.url, '_blank', 'noopener,noreferrer');
    }
  };
  
  const ThumbnailContent = () => {
    if (isLoading || (fileInfo.type === "pdf" && isPdfLoading && !pdfThumbnail)) {
      return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }
    
    switch (fileInfo.type) {
      case "image":
        return children || (
          <Image 
            src={fileInfo.url!} 
            alt={fileInfo.name} 
            fill 
            sizes={`${size}px`} 
            className="object-cover" 
            unoptimized 
          />
        );
      case "pdf":
        // Show PDF thumbnail if available, otherwise show icon
        if (pdfThumbnail) {
          return children || (
            <Image 
              src={pdfThumbnail} 
              alt={fileInfo.name} 
              fill 
              sizes={`${size}px`} 
              className="object-cover" 
              unoptimized 
            />
          );
        }
        // Fallback to icon if thumbnail generation fails
        return (
          <div className="flex h-full w-full flex-col items-center justify-center bg-red-50 text-red-500">
            <FileText className="h-8 w-8 mb-1" />
            <span className="text-[12px] font-black leading-none">PDF</span>
          </div>
        );
      default:
        return children || (
          <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 text-slate-500">
            <FileText className="h-8 w-8" />
            <span className="mt-1 text-xs font-bold uppercase">File</span>
          </div>
        );
    }
  };
  
  const reduction = compressionResult
    ? (((compressionResult.originalSize - compressionResult.compressedSize) / compressionResult.originalSize) * 100).toFixed(0)
    : 0;
    
  const showSpinner = isCompressingProp || isLoading;

  return (
    <div 
      className={cn("relative group w-full h-full", className)} 
      style={{ width: `${size}px`, height: `${size}px` }}
    >
        {onRemove && (
            <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove();
                }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        )}
        <div
            className={cn(
              "relative w-full h-full border rounded-lg overflow-hidden bg-background shadow-sm flex items-center justify-center",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            )}
            onClick={children || disabled ? undefined : handlePreviewClick}
        >
            <ThumbnailContent />

            {showSpinner && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
            )}
            {compressionResult && (
                <div className="absolute bottom-0 left-0 right-0 bg-emerald-600/90 text-white text-center text-[10px] py-0.5 z-10 font-medium">
                    -{reduction}%
                </div>
            )}
        </div>
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import type { DragEvent, HTMLAttributes } from "react";

/** Desktop OS file drag (Explorer / Finder) — not in-app text/URL drags. */
export function isPcFileDragEvent(e: DragEvent): boolean {
  const types = Array.from(e.dataTransfer?.types ?? []);
  return types.includes("Files");
}

export function collectFilesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt?.files?.length) return [];
  return Array.from(dt.files);
}

export type UsePcFileDropZoneOptions = {
  enabled: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
};

/**
 * Drag-and-drop from PC onto dashed attachment tiles / preview rows.
 * Nested enter/leave counter avoids flicker when dragging over children.
 */
export function usePcFileDropZone({ enabled, onFiles }: UsePcFileDropZoneOptions): {
  isDragOver: boolean;
  dropZoneProps: Pick<
    HTMLAttributes<HTMLElement>,
    "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop"
  >;
} {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragOver(false);
  }, []);

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!enabled || !isPcFileDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      setIsDragOver(true);
    },
    [enabled]
  );

  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (!enabled || !isPcFileDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragOver(false);
    },
    [enabled]
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!enabled || !isPcFileDragEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [enabled]
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      resetDrag();
      const picked = collectFilesFromDataTransfer(e.dataTransfer);
      if (picked.length === 0) return;
      void onFiles(picked);
    },
    [enabled, onFiles, resetDrag]
  );

  return {
    isDragOver,
    dropZoneProps: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}

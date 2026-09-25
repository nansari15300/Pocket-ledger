"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_W = 480;
const MIN_H = 400;

export const ITEM_MASTER_DIALOG_SIZE_STORAGE_KEY = "pl-item-master-dialog-size-v1";

export const ITEM_MASTER_DIALOG_DEFAULT_SIZE = {
  w: Math.round(14 * 96),
  h: Math.round(12 * 96),
};

type DialogSize = { w: number; h: number };
type DialogPosition = { x: number; y: number };

function clampSize(w: number, h: number, vw: number, vh: number): DialogSize {
  return {
    w: Math.max(MIN_W, Math.min(w, Math.floor(vw * 0.98))),
    h: Math.max(MIN_H, Math.min(h, Math.floor(vh * 0.92))),
  };
}

function defaultSizeForViewport(vw: number, vh: number): DialogSize {
  const w = Math.min(ITEM_MASTER_DIALOG_DEFAULT_SIZE.w, Math.floor(vw * 0.9));
  const h = Math.min(ITEM_MASTER_DIALOG_DEFAULT_SIZE.h, Math.floor(vh * 0.85));
  return clampSize(w, h, vw, vh);
}

type SavedDialogLayout = { w?: number; h?: number; x?: number; y?: number };

function readSavedLayout(
  storageKey: string,
  vw: number,
  vh: number
): { size: DialogSize; position: DialogPosition | null } | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedDialogLayout;
    if (typeof saved.w !== "number" || typeof saved.h !== "number") return null;
    const size = clampSize(saved.w, saved.h, vw, vh);
    const hasPos = typeof saved.x === "number" && typeof saved.y === "number";
    const position = hasPos
      ? clampPosition(saved.x!, saved.y!, size.w, size.h, vw, vh)
      : null;
    return { size, position };
  } catch {
    return null;
  }
}

function centerPosition(w: number, h: number, vw: number, vh: number): DialogPosition {
  return {
    x: Math.max(0, Math.round((vw - w) / 2)),
    y: Math.max(0, Math.round((vh - h) / 2)),
  };
}

function clampPosition(x: number, y: number, w: number, h: number, vw: number, vh: number): DialogPosition {
  const maxX = Math.max(0, vw - Math.min(w, vw));
  const maxY = Math.max(0, vh - Math.min(h, vh));
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

/** Desktop master dialogs: width/height resize + localStorage restore on open. */
export function usePersistedResizableDialogSize(
  isOpen: boolean,
  enabled: boolean,
  storageKey: string = ITEM_MASTER_DIALOG_SIZE_STORAGE_KEY
) {
  const [size, setSize] = useState<DialogSize>(ITEM_MASTER_DIALOG_DEFAULT_SIZE);
  const [position, setPosition] = useState<DialogPosition>({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const resizeRef = useRef<{
    handle: "e" | "s" | "se";
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !enabled || typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const saved = readSavedLayout(storageKey, vw, vh);
    const nextSize = saved?.size ?? defaultSizeForViewport(vw, vh);
    setSize(nextSize);
    setPosition(saved?.position ?? centerPosition(nextSize.w, nextSize.h, vw, vh));
  }, [isOpen, enabled, storageKey]);

  useEffect(() => {
    if (prevOpenRef.current && !isOpen && enabled && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ w: size.w, h: size.h, x: position.x, y: position.y })
        );
      } catch {
        /* ignore */
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, enabled, size.w, size.h, position.x, position.y, storageKey]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      const t = e.target as HTMLElement;
      if (
        t.closest(
          "button, a, input, textarea, select, [role='switch'], [role='combobox'], [data-radix-select-trigger]"
        )
      ) {
        return;
      }
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startLeft: position.x,
        startTop: position.y,
      };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rawX = dragRef.current.startLeft + ev.clientX - dragRef.current.startX;
        const rawY = dragRef.current.startTop + ev.clientY - dragRef.current.startY;
        setPosition(clampPosition(rawX, rawY, size.w, size.h, vw, vh));
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [enabled, position.x, position.y, size.w, size.h]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: "e" | "s" | "se") => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };
      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const { handle: h, startX, startY, startW, startH } = resizeRef.current;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let w = startW;
        let hh = startH;
        if (h === "e" || h === "se") w = startW + dx;
        if (h === "s" || h === "se") hh = startH + dy;
        setSize(clampSize(w, hh, vw, vh));
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [enabled, size.w, size.h]
  );

  return { size, position, handleResizeStart, handleDragStart, resizable: enabled };
}

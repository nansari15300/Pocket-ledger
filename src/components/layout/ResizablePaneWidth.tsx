"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ResizeHandleProps = {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  className?: string;
  title?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStoredNumber(storageKey: string, min: number, max: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : null;
  } catch {
    return null;
  }
}

function writeStoredNumber(storageKey: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    /* storage optional */
  }
}

export function ResizeWidthHandle({ onPointerDown, className, title = "Drag to resize" }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title}
      onPointerDown={onPointerDown}
      className={cn(
        "group absolute right-0 top-0 z-30 hidden h-full w-2 translate-x-1 cursor-col-resize touch-none select-none md:block",
        className
      )}
    >
      <div className="mx-auto h-full w-px bg-border transition-colors group-hover:bg-primary group-active:bg-primary" />
    </div>
  );
}

export function useResizablePixelWidth({
  storageKey,
  defaultPx,
  minPx,
  maxPx,
}: {
  storageKey: string;
  defaultPx: number;
  minPx: number;
  maxPx: number;
}) {
  const [widthPx, setWidthPx] = React.useState(defaultPx);

  React.useEffect(() => {
    const stored = readStoredNumber(storageKey, minPx, maxPx);
    if (stored != null) setWidthPx(stored);
  }, [storageKey, minPx, maxPx]);

  const beginResize = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthPx;
      const controller = new AbortController();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (moveEvent: PointerEvent) => {
        const next = clamp(startWidth + moveEvent.clientX - startX, minPx, maxPx);
        setWidthPx(next);
      };
      const onEnd = (endEvent: PointerEvent) => {
        const next = clamp(startWidth + endEvent.clientX - startX, minPx, maxPx);
        setWidthPx(next);
        writeStoredNumber(storageKey, next);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        controller.abort();
      };

      window.addEventListener("pointermove", onMove, { signal: controller.signal });
      window.addEventListener("pointerup", onEnd, { once: true, signal: controller.signal });
      window.addEventListener("pointercancel", onEnd, { once: true, signal: controller.signal });
    },
    [widthPx, minPx, maxPx, storageKey]
  );

  return { widthPx, beginResize };
}

export function useResizablePercentWidth({
  storageKey,
  defaultPercent,
  minPercent,
  maxPercent,
  containerRef,
}: {
  storageKey: string;
  defaultPercent: number;
  minPercent: number;
  maxPercent: number;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [widthPercent, setWidthPercent] = React.useState(defaultPercent);

  React.useEffect(() => {
    const stored = readStoredNumber(storageKey, minPercent, maxPercent);
    if (stored != null) setWidthPercent(stored);
  }, [storageKey, minPercent, maxPercent]);

  const beginResize = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const container = containerRef.current;
      if (!container) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const controller = new AbortController();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const nextFromClientX = (clientX: number) =>
        clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 100, minPercent, maxPercent);

      const onMove = (moveEvent: PointerEvent) => setWidthPercent(nextFromClientX(moveEvent.clientX));
      const onEnd = (endEvent: PointerEvent) => {
        const next = nextFromClientX(endEvent.clientX);
        setWidthPercent(next);
        writeStoredNumber(storageKey, next);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        controller.abort();
      };

      window.addEventListener("pointermove", onMove, { signal: controller.signal });
      window.addEventListener("pointerup", onEnd, { once: true, signal: controller.signal });
      window.addEventListener("pointercancel", onEnd, { once: true, signal: controller.signal });
    },
    [containerRef, minPercent, maxPercent, storageKey]
  );

  return { widthPercent, beginResize };
}

"use client";

import { useRef, type MouseEvent } from "react";
import { Rotate3d, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import type { QuotationPageImage } from "../types";

export function pictureSlotMinHeight(
  _page: HTMLElement | null,
  _images: QuotationPageImage[]
): number {
  return 0;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_W = 48;
const MIN_H = 40;
const ROTATION_SNAP_THRESHOLD = 6;

const ROTATION_SNAP_ANGLES = [0, 90, 180, 270] as const;

const RESIZE_ZONES: { handle: ResizeHandle; className: string }[] = [
  { handle: "n", className: "quotation-letter-page-image-zone-n" },
  { handle: "s", className: "quotation-letter-page-image-zone-s" },
  { handle: "e", className: "quotation-letter-page-image-zone-e" },
  { handle: "w", className: "quotation-letter-page-image-zone-w" },
  { handle: "nw", className: "quotation-letter-page-image-zone-nw" },
  { handle: "ne", className: "quotation-letter-page-image-zone-ne" },
  { handle: "sw", className: "quotation-letter-page-image-zone-sw" },
  { handle: "se", className: "quotation-letter-page-image-zone-se" },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeRotationFree(deg: number): number {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

function normalizeRotation(deg: number): number {
  const v = normalizeRotationFree(deg);
  if (v === 0) return 0;
  return Math.min(360, Math.max(1, v));
}

function rotationSnapDelta(deg: number, snap: number): number {
  const v = normalizeRotationFree(deg);
  return Math.min(Math.abs(v - snap), Math.abs(v - snap + 360), Math.abs(v - snap - 360));
}

function nearestRightAngleSnap(deg: number): number | null {
  let best: number | null = null;
  let bestDist = ROTATION_SNAP_THRESHOLD + 1;
  for (const snap of ROTATION_SNAP_ANGLES) {
    const d = rotationSnapDelta(deg, snap);
    if (d <= ROTATION_SNAP_THRESHOLD && d < bestDist) {
      bestDist = d;
      best = snap;
    }
  }
  return best;
}

function applyRotationSnap(deg: number): number {
  const snap = nearestRightAngleSnap(deg);
  return snap !== null ? snap : normalizeRotationFree(deg);
}

/** Resize from edge/corner — right/bottom grow with dx/dy; left/top anchor opposite edge. */
function resizePatch(
  handle: ResizeHandle,
  drag: { origX: number; origY: number; origW: number; origH: number },
  dx: number,
  dy: number,
  maxW: number,
  maxH: number
): Pick<QuotationPageImage, "x" | "y" | "width" | "height"> {
  let x = drag.origX;
  let y = drag.origY;
  let width = drag.origW;
  let height = drag.origH;

  const growEast = handle === "e" || handle === "ne" || handle === "se";
  const growWest = handle === "w" || handle === "nw" || handle === "sw";
  const growSouth = handle === "s" || handle === "se" || handle === "sw";
  const growNorth = handle === "n" || handle === "ne" || handle === "nw";

  if (growEast) {
    width = clamp(drag.origW + dx, MIN_W, Math.max(MIN_W, maxW - drag.origX));
  }
  if (growWest) {
    const nextW = clamp(drag.origW - dx, MIN_W, drag.origW + drag.origX);
    x = drag.origX + drag.origW - nextW;
    width = nextW;
  }
  if (growSouth) {
    height = clamp(drag.origH + dy, MIN_H, Math.max(MIN_H, maxH - drag.origY));
  }
  if (growNorth) {
    const nextH = clamp(drag.origH - dy, MIN_H, drag.origH + drag.origY);
    y = drag.origY + drag.origH - nextH;
    height = nextH;
  }

  return { x, y, width, height };
}

export function QuotationPagePictures({
  images,
  selectedId,
  onSelect,
  onChange,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  images: QuotationPageImage[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<QuotationPageImage>) => void;
  onRemove: (id: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    resizeHandle?: ResizeHandle;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const startDrag = (
    e: MouseEvent<HTMLElement>,
    img: QuotationPageImage,
    mode: "move" | "resize",
    resizeHandle?: ResizeHandle
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart?.();
    onSelect(img.id);
    const page = (e.currentTarget as HTMLElement).closest(".quotation-letter-page") as HTMLElement | null;
    if (!page) return;
    dragRef.current = {
      id: img.id,
      mode,
      resizeHandle,
      startX: e.clientX,
      startY: e.clientY,
      origX: img.x,
      origY: img.y,
      origW: img.width,
      origH: img.height,
    };
    const move = (ev: globalThis.MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      const box = page.getBoundingClientRect();
      const maxW = box.width - 16;
      const maxH = box.height;

      if (drag.mode === "resize" && drag.resizeHandle) {
        onChange(
          drag.id,
          resizePatch(
            drag.resizeHandle,
            { origX: drag.origX, origY: drag.origY, origW: drag.origW, origH: drag.origH },
            dx,
            dy,
            maxW,
            maxH
          )
        );
        return;
      }

      const x = Math.max(0, Math.min(box.width - MIN_W, drag.origX + dx));
      const y = Math.max(0, Math.min(box.height - MIN_H, drag.origY + dy));
      onChange(drag.id, { x, y });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.setTimeout(() => {
        onDragEnd?.();
      }, 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const rotateBy = (img: QuotationPageImage, delta: number) => {
    onChange(img.id, { rotation: normalizeRotation((img.rotation ?? 0) + delta) });
  };

  const startFreeRotate = (e: MouseEvent<HTMLElement>, img: QuotationPageImage) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart?.();
    onSelect(img.id);
    const frame = (e.currentTarget as HTMLElement).closest(".quotation-letter-page-image") as HTMLElement | null;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startPointer = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    const startRot = img.rotation ?? 0;
    let latestRot = startRot;
    const move = (ev: globalThis.MouseEvent) => {
      const pointer = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI);
      const delta = pointer - startPointer;
      latestRot = applyRotationSnap(startRot + delta);
      onChange(img.id, { rotation: latestRot });
    };
    const up = () => {
      onChange(img.id, { rotation: applyRotationSnap(latestRot) });
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.setTimeout(() => {
        onDragEnd?.();
      }, 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const isResizeTarget = (target: EventTarget | null) =>
    Boolean((target as HTMLElement | null)?.closest?.(".quotation-letter-page-image-resize-zone"));

  return (
    <>
      {images.map((img) => {
        const selected = selectedId === img.id;
        const rotation = img.rotation ?? 0;
        const hasRotation = Math.abs(rotation) > 0.01;
        const snapAngle = nearestRightAngleSnap(rotation);
        return (
          <div
            key={img.id}
            className={
              selected
                ? "quotation-letter-page-image is-selected"
                : "quotation-letter-page-image"
            }
            style={{
              left: img.x,
              top: img.y,
              width: img.width,
              height: img.height,
              transform: hasRotation ? `rotate(${rotation}deg)` : undefined,
              transformOrigin: "center center",
            }}
            onMouseDown={(e) => {
              if (isResizeTarget(e.target)) return;
              if ((e.target as HTMLElement).closest(".quotation-letter-page-image-rotate")) return;
              if ((e.target as HTMLElement).closest(".quotation-letter-page-image-free-rotate")) return;
              if ((e.target as HTMLElement).closest(".quotation-letter-page-image-remove")) return;
              startDrag(e, img, "move");
            }}
          >
            <div className="quotation-letter-page-image-media" aria-hidden>
              <img src={img.src} alt="" draggable={false} />
            </div>
            {selected && snapAngle !== null ? (
              <div className="quotation-letter-page-image-snap-guides quotation-letter-ui-only" aria-hidden>
                <div className="quotation-letter-page-image-snap-line quotation-letter-page-image-snap-line-h" />
                <div className="quotation-letter-page-image-snap-line quotation-letter-page-image-snap-line-v" />
                <span className="quotation-letter-page-image-snap-label">{snapAngle}°</span>
              </div>
            ) : null}
            {selected ? (
              <>
                <div className="quotation-letter-page-image-rotate quotation-letter-ui-only">
                  <button
                    type="button"
                    title="Rotate left"
                    aria-label="Rotate left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      rotateBy(img, -90);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Rotate right"
                    aria-label="Rotate right"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      rotateBy(img, 90);
                    }}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  className="quotation-letter-page-image-free-rotate quotation-letter-ui-only"
                  title="Drag to rotate (1°–360°)"
                  aria-label="Drag to rotate"
                  onMouseDown={(e) => startFreeRotate(e, img)}
                >
                  <Rotate3d className="h-3.5 w-3.5" />
                </button>
                {RESIZE_ZONES.map((zone) => (
                  <div
                    key={zone.handle}
                    role="presentation"
                    className={`quotation-letter-page-image-resize-zone ${zone.className} quotation-letter-ui-only`}
                    onMouseDown={(e) => startDrag(e, img, "resize", zone.handle)}
                  />
                ))}
                <button
                  type="button"
                  className="quotation-letter-page-image-remove quotation-letter-ui-only"
                  title="Remove picture"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(img.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

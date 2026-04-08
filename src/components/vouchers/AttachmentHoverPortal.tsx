"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Tooltip se zyada: fixed portal + solid bg taaki table/parent overflow ya blend se file transparent na dikhe */
const HOVER_CLOSE_MS = 280;
const PANEL_Z = 400000;

type AttachmentHoverPortalProps = {
  /** Hover trigger (icon / thumbnail) */
  children: React.ReactNode;
  /** Preview content — panel ke andar solid background par */
  preview: React.ReactNode;
  disabled?: boolean;
  /** Trigger wrapper class — table icon vs bile FilePreview tile ke liye */
  triggerClassName?: string;
};

export function AttachmentHoverPortal({
  children,
  preview,
  disabled = false,
  triggerClassName,
}: AttachmentHoverPortalProps) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }, [cancelClose]);

  const updatePosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 10;
    const maxPanelW = Math.min(820, window.innerWidth - 2 * margin);
    let left = r.right + margin;
    if (left + maxPanelW > window.innerWidth - margin) {
      left = Math.max(margin, r.left - maxPanelW - margin);
    }
    let top = r.top;
    const maxH = window.innerHeight * 0.88;
    if (top + maxH > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - maxH - margin);
    }
    setPos({ top, left });
  }, []);

  const handleOpen = React.useCallback(() => {
    if (disabled) return;
    cancelClose();
    updatePosition();
    setOpen(true);
  }, [disabled, cancelClose, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  const panel =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className={cn(
          "pointer-events-auto fixed max-h-[88vh] w-[min(820px,calc(100vw-20px))] overflow-hidden",
          "rounded-[20mm] border-[3px] border-blue-600 bg-white shadow-2xl dark:bg-zinc-950",
          "isolate [opacity:1]"
        )}
        style={{ top: pos.top, left: pos.left, zIndex: PANEL_Z }}
        data-attachment-preview-portal=""
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
      >
        {/* Inner scroll: explicit solid layer taaki PDF/image ke peeche page bleed na ho */}
        <div className="max-h-[88vh] overflow-auto bg-white p-3 dark:bg-zinc-950">{preview}</div>
      </div>,
      document.body
    );

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("inline-flex", triggerClassName)}
        onPointerEnter={handleOpen}
        onPointerLeave={scheduleClose}
      >
        {children}
      </span>
      {panel}
    </>
  );
}

"use client";

import * as React from "react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAttachmentHoldPointer } from "@/hooks/useAttachmentHoldPointer";
import {
  readAttachmentHoldClipboardText,
  parseAttachmentHoldClipboardText,
  fetchBlobForAttachmentHoldPaste,
  blobToFile,
} from "@/lib/attachmentHoldClipboard";
import { toast as sonnerToast } from "sonner";

function sanitizeDownloadFileName(raw: string): string {
  const base = String(raw || "attachment").trim() || "attachment";
  const noPath = base.includes("/") ? base.split("/").pop() || base : base;
  return noPath.replace(/[^\w.\- ()\u0900-\u097F]+/g, "_").slice(0, 180) || "attachment";
}

type Props = {
  /** Khali slot + role allow ho tab hi */
  enabled: boolean;
  /** Normal tap — file picker */
  onShortActivate: () => void;
  /** Hold ke baad naya File (server pe save par upload) */
  onPastedFiles: (files: File[]) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
};

/**
 * Dashed "Add File" tile: ~2s hold se paste (pehle), ab PC hover / mobile chip se bhi `Paste` — clipboard me PL marker ya session backup.
 */
export function AttachmentHoldPasteSurface({
  enabled,
  onShortActivate,
  onPastedFiles,
  className,
  children,
}: Props) {
  /** Hold + Paste button dono isi path se — ek hi toast / validation. */
  const runPasteFromHoldClipboard = useCallback(async () => {
    const text = await readAttachmentHoldClipboardText();
    if (!text) {
      sonnerToast.message("No attachment in clipboard", {
        description: "Copy from a thumbnail first (Copy button or ~2s hold).",
      });
      return;
    }
    const payload = parseAttachmentHoldClipboardText(text);
    if (!payload) {
      sonnerToast.error("Clipboard is not a Pocket Ledger attachment");
      return;
    }
    const got = await fetchBlobForAttachmentHoldPaste(payload);
    if (!got || got.blob.size === 0) {
      sonnerToast.error("Could not read attachment (offline or link expired)");
      return;
    }
    const file = blobToFile(got.blob, sanitizeDownloadFileName(got.fileName), got.contentType);
    await onPastedFiles([file]);
    sonnerToast.success("Pasted as new file", {
      description: "Save to upload a separate copy — source delete won’t remove this.",
    });
  }, [onPastedFiles]);

  const hold = useAttachmentHoldPointer({
    disabled: !enabled,
    onHoldComplete: runPasteFromHoldClipboard,
  });

  return (
    <div
      className={cn("group relative flex min-h-0 flex-col", className)}
      onClickCapture={hold.onClickCapture}
      onPointerDown={hold.onPointerDown}
      onPointerMove={hold.onPointerMove}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
    >
      <div
        role="button"
        tabIndex={0}
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center outline-none"
        onClick={() => onShortActivate()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onShortActivate();
          }
        }}
      >
        {children}
        {/* PC fine pointer: hover par Paste — wrapper `pointer-events-none` taaki Add area click file picker tak jaye. */}
        {enabled ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden justify-center pt-0.5 opacity-0 transition-opacity [@media(pointer:fine)]:flex [@media(pointer:fine)]:group-hover:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="pointer-events-auto h-7 gap-0.5 px-2 text-[10px] font-semibold shadow-md"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void runPasteFromHoldClipboard();
              }}
            >
              Paste
            </Button>
          </div>
        ) : null}
      </div>
      {/* Mobile / coarse pointer: chip — touch se paste; PC par fine-pointer rule se yeh row chhupti hai. */}
      {enabled ? (
        <div className="flex shrink-0 justify-center pb-0.5 pt-0 [@media(pointer:fine)]:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[10px] font-semibold"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              void runPasteFromHoldClipboard();
            }}
          >
            Paste
          </Button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
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
 * Dashed "Add File" / "Add photo" tile: 2s hold = clipboard se attachment paste (naya copy).
 */
export function AttachmentHoldPasteSurface({
  enabled,
  onShortActivate,
  onPastedFiles,
  className,
  children,
}: Props) {
  const hold = useAttachmentHoldPointer({
    disabled: !enabled,
    onHoldComplete: async () => {
      const text = await readAttachmentHoldClipboardText();
      if (!text) {
        sonnerToast.message("No attachment in clipboard", {
          description: "Hold an attachment thumbnail ~2s to copy first.",
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
    },
  });

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(className)}
      onClickCapture={hold.onClickCapture}
      onClick={() => onShortActivate()}
      onPointerDown={hold.onPointerDown}
      onPointerMove={hold.onPointerMove}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onShortActivate();
        }
      }}
    >
      {children}
    </div>
  );
}

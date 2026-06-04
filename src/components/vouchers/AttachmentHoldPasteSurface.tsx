"use client";

import * as React from "react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  useAttachmentHoldPointer,
  ATTACHMENT_HOLD_MS_MOBILE,
} from "@/hooks/useAttachmentHoldPointer";
import { useTapInteractionMode } from "@/components/vouchers/AttachmentHoverPortal";
import {
  readAttachmentHoldClipboardText,
  parseAttachmentHoldClipboardText,
  fetchBlobForAttachmentHoldPaste,
  blobToFile,
  refreshAttachmentHoldSessionBackup,
  persistableAttachmentRefFromHoldPayload,
} from "@/lib/attachmentHoldClipboard";
import { toast as sonnerToast } from "sonner";
import { CompanyAttachmentReuseButton } from "@/components/vouchers/CompanyAttachmentReuseDialog";
import { voucherAttachmentReuseEnabled } from "@/lib/firebaseBillingOptimization";
import { linkCloudAttachmentRefs } from "@/lib/companyAttachmentRegistry";
import { useCompany } from "@/hooks/useCompany";

function sanitizeDownloadFileName(raw: string): string {
  const base = String(raw || "attachment").trim() || "attachment";
  const noPath = base.includes("/") ? base.split("/").pop() || base : base;
  return noPath.replace(/[^\w.\- ()\u0900-\u097F]+/g, "_").slice(0, 180) || "attachment";
}

type VoucherAttachmentReuseConfig = {
  currentFiles: Array<File | string>;
  setFiles: React.Dispatch<React.SetStateAction<Array<File | string>>>;
  maxFiles: number;
};

type Props = {
  /** Khali slot + role allow ho tab hi */
  enabled: boolean;
  /** Normal tap — file picker */
  onShortActivate: () => void;
  /** Hold paste fallback: unsaved File only (upload on save). */
  onPastedFiles: (files: File[]) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
  /** Existing company file URL reuse (voucher forms) */
  voucherAttachmentReuse?: VoucherAttachmentReuseConfig;
};

/**
 * Dashed "Add File" tile: PC hover / mobile ~1s hold par `Paste` chip; click se paste — last copy session me rehta hai.
 */
export function AttachmentHoldPasteSurface({
  enabled,
  onShortActivate,
  onPastedFiles,
  className,
  children,
  voucherAttachmentReuse,
}: Props) {
  const { companyId } = useCompany();
  const tapMode = useTapInteractionMode();
  const [mobilePasteRevealed, setMobilePasteRevealed] = useState(false);

  /** Hold + Paste button dono isi path se — ek hi toast / validation. */
  const runPasteFromHoldClipboard = useCallback(async () => {
    const text = await readAttachmentHoldClipboardText();
    if (!text) {
      sonnerToast.message("No attachment in clipboard", {
        description: "Copy from a thumbnail first (Copy button or ~1s hold on mobile).",
      });
      return;
    }
    const payload = parseAttachmentHoldClipboardText(text);
    if (!payload) {
      sonnerToast.error("Clipboard is not a Pocket Ledger attachment");
      return;
    }

    const reuseRef = persistableAttachmentRefFromHoldPayload(payload);
    const canReuseUrl =
      voucherAttachmentReuseEnabled() &&
      voucherAttachmentReuse &&
      reuseRef &&
      !voucherAttachmentReuse.currentFiles.some(
        (f) => typeof f === "string" && f.trim() === reuseRef
      );

    if (canReuseUrl) {
      try {
        if (companyId) await linkCloudAttachmentRefs(companyId, [reuseRef]);
        voucherAttachmentReuse.setFiles((prev) => [...prev, reuseRef]);
        refreshAttachmentHoldSessionBackup(payload);
        sonnerToast.success("Pasted — same file reused", {
          description: "No new upload on save. Shared link stays on other vouchers too.",
        });
        setMobilePasteRevealed(false);
        return;
      } catch (e) {
        sonnerToast.error("Could not link attachment", {
          description: e instanceof Error ? e.message : String(e),
        });
        return;
      }
    }

    const got = await fetchBlobForAttachmentHoldPaste(payload);
    if (!got || got.blob.size === 0) {
      sonnerToast.error("Could not read attachment (offline or link expired)");
      return;
    }
    const file = blobToFile(got.blob, sanitizeDownloadFileName(got.fileName), got.contentType);
    await onPastedFiles([file]);
    refreshAttachmentHoldSessionBackup(payload);
    sonnerToast.success("Pasted as new file", {
      description: reuseRef
        ? "Already on this voucher — or copy was unsaved (no stored link)."
        : "Unsaved copy — save uploads a separate file.",
    });
    setMobilePasteRevealed(false);
  }, [companyId, onPastedFiles, voucherAttachmentReuse]);

  const hold = useAttachmentHoldPointer({
    disabled: !enabled,
    holdMs: tapMode ? ATTACHMENT_HOLD_MS_MOBILE : undefined,
    onHoldComplete: tapMode
      ? () => {
          setMobilePasteRevealed(true);
        }
      : undefined,
  });

  const reuseTile =
    voucherAttachmentReuse &&
    voucherAttachmentReuseEnabled() &&
    enabled &&
    voucherAttachmentReuse.currentFiles.length < voucherAttachmentReuse.maxFiles ? (
      <CompanyAttachmentReuseButton
        currentFiles={voucherAttachmentReuse.currentFiles}
        maxFiles={voucherAttachmentReuse.maxFiles}
        onAddUrls={(urls) => voucherAttachmentReuse.setFiles((prev) => [...prev, ...urls])}
        disabled={!enabled}
        className={cn(
          "h-24 w-24 flex-col gap-1 border-2 border-dashed text-[10px] px-1 shrink-0",
          className?.includes("w-24") ? "" : "h-24 w-24"
        )}
      />
    ) : null;

  const addTile = (
    <div
      className={cn("group relative flex h-full w-full min-h-0 flex-col", className)}
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
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center touch-manipulation outline-none"
        onClick={() => onShortActivate()}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onShortActivate();
          }
        }}
      >
        {children}
        {enabled ? (
          <>
            {/* PC: hover par Paste — wrapper `pointer-events-none` taaki Add area click file picker tak jaye */}
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
            {/* Mobile: ~1s hold ke baad Paste chip; click se paste */}
            {mobilePasteRevealed ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-0.5 [@media(pointer:fine)]:hidden">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="pointer-events-auto h-6 gap-0.5 px-1.5 text-[9px] font-semibold shadow-md"
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
          </>
        ) : null}
      </div>
    </div>
  );

  const addTileSlot = <div className="relative h-24 w-24 shrink-0">{addTile}</div>;

  if (!reuseTile) return addTileSlot;

  /** Reuse + Add alag tiles — ek `h-24` box ke andar stack na ho (Add File niche na jaye). */
  return (
    <div className="flex shrink-0 flex-row flex-wrap items-start gap-4">
      {reuseTile}
      {addTileSlot}
    </div>
  );
}

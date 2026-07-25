"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  useAttachmentHoldPointer,
  ATTACHMENT_HOLD_MS_MOBILE,
} from "@/hooks/useAttachmentHoldPointer";
import { useTapInteractionMode } from "@/components/vouchers/AttachmentHoverPortal";
import {
  resolveAttachmentHoldPayloadForPaste,
  parseAttachmentHoldPayloadFromAnyText,
  fetchBlobForAttachmentHoldPaste,
  blobToFile,
  refreshAttachmentHoldSessionBackup,
  persistableAttachmentRefFromHoldPayload,
  voucherFormFilesIncludePersistableRef,
  ATTACHMENT_HOLD_CROSS_TAB_BACKUP_KEY,
} from "@/lib/attachmentHoldClipboard";
import { toast as sonnerToast } from "sonner";
import { CompanyAttachmentReuseButton } from "@/components/vouchers/CompanyAttachmentReuseDialog";
import { voucherAttachmentReuseEnabled } from "@/lib/firebaseBillingOptimization";
import { linkCloudAttachmentRefs } from "@/lib/companyAttachmentRegistry";
import { useCompany } from "@/hooks/useCompany";
import { useCrossCompanyAttachmentAccess } from "@/hooks/useCrossCompanyAttachmentAccess";

function sanitizeDownloadFileName(raw: string): string {
  const base = String(raw || "attachment").trim() || "attachment";
  const noPath = base.includes("/") ? base.split("/").pop() || base : base;
  return noPath.replace(/[^\w.\- ()\u0900-\u097F]+/g, "_").slice(0, 180) || "attachment";
}

export type VoucherAttachmentReuseConfig = {
  currentFiles: Array<File | string>;
  setFiles: React.Dispatch<React.SetStateAction<Array<File | string>>>;
  maxFiles: number;
};

/** Reuse action inside the Add File tile. */
export const VOUCHER_ATTACHMENT_REUSE_TILE_CLASS =
  "absolute inset-x-2 bottom-1 z-10 h-6 gap-1 rounded-md border-sky-300 bg-sky-100/95 px-1.5 text-[10px] font-semibold leading-tight text-sky-900 shadow-sm hover:border-sky-500 hover:bg-sky-200/95 dark:border-sky-400/55 dark:bg-sky-950/85 dark:text-sky-100";

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
  const { isHoldPayloadVisible } = useCrossCompanyAttachmentAccess();
  const tapMode = useTapInteractionMode();
  const [mobilePasteRevealed, setMobilePasteRevealed] = useState(false);

  /** EXE multi-tab: Tab A copy → Tab B me Paste chip dikhao (storage event). */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ATTACHMENT_HOLD_CROSS_TAB_BACKUP_KEY || !e.newValue) return;
      setMobilePasteRevealed(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** Hold + Paste button + Ctrl+V — plain https / local: / drive: link bhi chale. */
  const runPasteFromHoldClipboard = useCallback(async (clipboardTextOverride?: string) => {
    const payload =
      (clipboardTextOverride
        ? parseAttachmentHoldPayloadFromAnyText(clipboardTextOverride)
        : null) ?? (await resolveAttachmentHoldPayloadForPaste());
    if (!payload) {
      sonnerToast.message("No attachment link in clipboard", {
        description:
          "Paste a copied file link (https, local:, or drive:) — from another voucher, tab, or app.",
      });
      return;
    }

    if (!isHoldPayloadVisible(payload)) {
      sonnerToast.error("Other company file (not available here)", {
        description:
          "This attachment is from another company. Switch to that company, or use a login where both companies are available.",
      });
      return;
    }

    const reuseRef = persistableAttachmentRefFromHoldPayload(payload);
    const canReuseUrl =
      voucherAttachmentReuseEnabled() &&
      voucherAttachmentReuse &&
      reuseRef &&
      !voucherFormFilesIncludePersistableRef(voucherAttachmentReuse.currentFiles, reuseRef);

    const pasteReusedUrl = async (ref: string) => {
      if (companyId) await linkCloudAttachmentRefs(companyId, [ref]);
      voucherAttachmentReuse!.setFiles((prev) => [...prev, ref]);
      refreshAttachmentHoldSessionBackup(payload);
      sonnerToast.success("Pasted — same file reused", {
        description: "No new upload on save. Shared link stays on other vouchers too.",
      });
      setMobilePasteRevealed(false);
    };

    if (canReuseUrl) {
      try {
        await pasteReusedUrl(reuseRef);
        return;
      } catch (e) {
        sonnerToast.error("Could not link attachment", {
          description: e instanceof Error ? e.message : String(e),
        });
        return;
      }
    }

    const got = await fetchBlobForAttachmentHoldPaste(payload, undefined, {
      companyId: companyId ?? undefined,
    });
    if (!got || got.blob.size === 0) {
      if (
        voucherAttachmentReuseEnabled() &&
        voucherAttachmentReuse &&
        reuseRef &&
        !voucherFormFilesIncludePersistableRef(voucherAttachmentReuse.currentFiles, reuseRef)
      ) {
        try {
          await pasteReusedUrl(reuseRef);
          return;
        } catch (e) {
          sonnerToast.error("Could not link attachment", {
            description: e instanceof Error ? e.message : String(e),
          });
          return;
        }
      }
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
  }, [companyId, isHoldPayloadVisible, onPastedFiles, voucherAttachmentReuse]);

  const hold = useAttachmentHoldPointer({
    disabled: !enabled,
    holdMs: tapMode ? ATTACHMENT_HOLD_MS_MOBILE : undefined,
    onHoldComplete: tapMode
      ? () => {
          setMobilePasteRevealed(true);
        }
      : undefined,
  });

  const canShowReuseTile =
    Boolean(voucherAttachmentReuse) &&
    voucherAttachmentReuseEnabled() &&
    (voucherAttachmentReuse?.currentFiles.length ?? 0) < (voucherAttachmentReuse?.maxFiles ?? 0);

  const reuseAction = canShowReuseTile && voucherAttachmentReuse ? (
    <CompanyAttachmentReuseButton
      currentFiles={voucherAttachmentReuse.currentFiles}
      maxFiles={voucherAttachmentReuse.maxFiles}
      onAddUrls={(urls) => voucherAttachmentReuse.setFiles((prev) => [...prev, ...urls])}
      disabled={!enabled}
      className={VOUCHER_ATTACHMENT_REUSE_TILE_CLASS}
    />
  ) : null;

  const addTile = (
    <div
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-disabled={!enabled}
      className={cn(
        "group relative flex h-full w-full min-h-0 flex-col items-center justify-center touch-manipulation outline-none",
        className
      )}
      onClickCapture={hold.onClickCapture}
      onPointerDown={hold.onPointerDown}
      onPointerMove={hold.onPointerMove}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onClick={(e) => {
        if (!enabled) return;
        if ((e.target as HTMLElement).closest("[data-attachment-paste-chip]")) return;
        if ((e.target as HTMLElement).closest("[data-attachment-reuse-action]")) return;
        onShortActivate();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPaste={(e) => {
        if (!enabled) return;
        const text = e.clipboardData.getData("text/plain");
        if (!text?.trim()) return;
        e.preventDefault();
        e.stopPropagation();
        void runPasteFromHoldClipboard(text);
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onShortActivate();
        }
      }}
    >
      {children}
      {reuseAction}
      {enabled ? (
        <>
          {/* PC: hover par Paste — chip alag click; baaki poori tile file picker */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden justify-center pt-0.5 opacity-0 transition-opacity [@media(pointer:fine)]:flex [@media(pointer:fine)]:group-hover:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-attachment-paste-chip
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
                data-attachment-paste-chip
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
  );

  const addTileSlot = <div className="relative h-24 w-24 shrink-0">{addTile}</div>;
  return addTileSlot;
}

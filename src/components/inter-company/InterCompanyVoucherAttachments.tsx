"use client";

/**
 * Inter Company voucher — optional file attachments (source voucher par save).
 */
import { useMemo, useRef } from "react";
import { PlusCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RestrictedFileUploader } from "@/components/ui/RestrictedFileUploader";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { VoucherAttachmentFallbackContext } from "@/contexts/VoucherAttachmentFallbackContext";
import { appendCompressedVoucherAttachmentsToState } from "@/lib/appendCompressedVoucherAttachments";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import usePermissions from "@/hooks/usePermissions";
import {
  interCompanyCardClass,
  interCompanyPanelClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";

type FileEntry = File | string;

type Props = {
  files: FileEntry[];
  onFilesChange: (next: FileEntry[]) => void;
  disabled?: boolean;
  className?: string;
  /** Reverse-request dialog — auto height; `h-full` se footer overlap na ho */
  compact?: boolean;
  /** Box heading — Source Attach / Target Attach jaisa customizable */
  title?: string;
  /** IC voucher — peer company copy par attachments dikhao */
  shareWithPeer?: boolean;
  onShareWithPeerChange?: (checked: boolean) => void;
  /** Source side — checkbox to share files with peer */
  showShareCheckbox?: boolean;
  /** View-only par bhi share tick allow (source save alag se) */
  shareCheckboxDisabled?: boolean;
  /** Checkbox label — har side "Show my attachment on other side" */
  checkboxLabel?: string;
  /** Checkbox id/htmlFor — dono boxes ek saath render hone par unique */
  checkboxId?: string;
  /** IC voucher — peer company copy par bhi preview open */
  allowPreviewWhenDisabled?: boolean;
  /** Image compress cap: online 100KB vs local/PL/Drive 150KB */
  companyId?: string | null;
  /** Other side ne "Show my attachment on other side" tick kiya — yahan read-only preview */
  peerPreviewFiles?: FileEntry[];
  peerPreviewCompanyId?: string | null;
  peerPreviewVoucherId?: string | null;
};

export function InterCompanyVoucherAttachments({
  files,
  onFilesChange,
  disabled = false,
  className,
  compact = false,
  title = "Attachments (optional)",
  shareWithPeer = false,
  onShareWithPeerChange,
  showShareCheckbox = false,
  shareCheckboxDisabled = false,
  checkboxLabel = "Show my attachment on other side",
  checkboxId = "ic-share-attachments-with-peer",
  allowPreviewWhenDisabled = true,
  companyId = null,
  peerPreviewFiles = [],
  peerPreviewCompanyId = null,
  peerPreviewVoucherId = null,
}: Props) {
  const stringFileUrls = files.filter((f): f is string => typeof f === "string");
  const peerStringUrls = peerPreviewFiles.filter((f): f is string => typeof f === "string");
  const previewClientUrls = [...stringFileUrls, ...peerStringUrls];
  const peerFallback = useMemo(() => {
    const cid = String(peerPreviewCompanyId || "").trim();
    const vid = String(peerPreviewVoucherId || "").trim();
    if (!cid) return null;
    return {
      companyId: cid,
      voucherId: vid || cid,
      interCompanyPeer: vid
        ? { peerCompanyId: cid, peerVoucherId: vid }
        : { peerCompanyId: cid, peerVoucherId: cid },
    };
  }, [peerPreviewCompanyId, peerPreviewVoucherId]);
  const { toast } = useToast();
  const { fileAttachmentLimits, allowAttachments } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAttach =
    allowAttachments && !disabled && fileAttachmentLimits.maxFileCount > 0;

  return (
    <div
      className={cn(
        compact
          ? cn(interCompanyCardClass, "flex flex-col gap-2 p-3 min-w-0")
          : cn(interCompanyPanelClass, "flex h-full min-h-0 flex-col space-y-2 p-3 min-w-0"),
        className
      )}
    >
      {/* Label — FormLabel nahi: reverse dialog bhi yahi use karta hai (FormProvider ke bina). */}
      <Label>{title}</Label>
      {showShareCheckbox && onShareWithPeerChange ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id={checkboxId}
            checked={shareWithPeer}
            disabled={shareCheckboxDisabled}
            onCheckedChange={(v) => onShareWithPeerChange(v === true)}
          />
          <Label
            htmlFor={checkboxId}
            className={cn(
              "text-xs font-normal leading-snug",
              shareCheckboxDisabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"
            )}
          >
            {checkboxLabel}
          </Label>
        </div>
      ) : null}
      <RestrictedFileUploader>
        <div className="flex flex-wrap gap-3">
          {files.map((file, idx) => (
            <FilePreview
              key={`own-${idx}-${typeof file === "string" ? file : file.name}`}
              file={file}
              allowPreviewWhenDisabled={allowPreviewWhenDisabled}
              attachmentClientFileUrls={previewClientUrls}
              attachmentCompanyId={companyId ?? undefined}
              onRemove={
                canAttach && fileAttachmentLimits.allowDelete
                  ? () => onFilesChange(files.filter((_, i) => i !== idx))
                  : undefined
              }
              className={
                !canAttach && !allowPreviewWhenDisabled ? "pointer-events-none opacity-60" : ""
              }
            />
          ))}
          {peerPreviewFiles.map((file, idx) => {
            const preview = (
              <FilePreview
                file={file}
                allowPreviewWhenDisabled
                attachmentClientFileUrls={previewClientUrls}
                attachmentCompanyId={peerPreviewCompanyId ?? companyId ?? undefined}
              />
            );
            return peerFallback ? (
              <VoucherAttachmentFallbackContext.Provider
                key={`peer-${idx}-${typeof file === "string" ? file : file.name}`}
                value={peerFallback}
              >
                {preview}
              </VoucherAttachmentFallbackContext.Provider>
            ) : (
              <div key={`peer-${idx}-${typeof file === "string" ? file : file.name}`}>{preview}</div>
            );
          })}
          {canAttach && files.length < fileAttachmentLimits.maxFileCount ? (
            <>
              <AttachmentHoldPasteSurface
                enabled={canAttach}
                voucherAttachmentReuse={{
                  currentFiles: files,
                  setFiles: (updater) => {
                    const next = typeof updater === "function" ? updater(files) : updater;
                    onFilesChange(next);
                  },
                  maxFiles: fileAttachmentLimits.maxFileCount,
                }}
                onShortActivate={() => fileInputRef.current?.click()}
                onPastedFiles={(incoming) =>
                  void appendCompressedVoucherAttachmentsToState({
                    companyId,
                    incomingFiles: incoming,
                    currentFiles: files,
                    maxFiles: fileAttachmentLimits.maxFileCount,
                    allowImage: fileAttachmentLimits.allowImage,
                    allowPDF: fileAttachmentLimits.allowPDF,
                    setFiles: onFilesChange,
                    toast,
                  })
                }
                className={cn(
                  "h-24 w-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors",
                  "border-sky-400/70 bg-sky-100/80 hover:border-sky-500 dark:border-sky-400/55 dark:bg-sky-950/35"
                )}
              >
                <PlusCircle className="h-6 w-6 text-muted-foreground" />
                <span className="text-[10px] mt-1">Add file</span>
              </AttachmentHoldPasteSurface>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple={fileAttachmentLimits.maxFileCount > 1}
                accept={[
                  fileAttachmentLimits.allowImage ? "image/*" : "",
                  fileAttachmentLimits.allowPDF ? "application/pdf" : "",
                ]
                  .filter(Boolean)
                  .join(",")}
                disabled={!canAttach}
                onChange={(e) => {
                  const picked = e.target.files;
                  if (!picked?.length) return;
                  void appendCompressedVoucherAttachmentsToState({
                    companyId,
                    incomingFiles: Array.from(picked),
                    currentFiles: files,
                    maxFiles: fileAttachmentLimits.maxFileCount,
                    allowImage: fileAttachmentLimits.allowImage,
                    allowPDF: fileAttachmentLimits.allowPDF,
                    setFiles: onFilesChange,
                    toast,
                  });
                  e.target.value = "";
                }}
              />
            </>
          ) : null}
        </div>
      </RestrictedFileUploader>
    </div>
  );
}

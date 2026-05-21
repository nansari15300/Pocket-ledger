"use client";

/**
 * Inter Company voucher — optional file attachments (source voucher par save).
 */
import { useRef } from "react";
import { PlusCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RestrictedFileUploader } from "@/components/ui/RestrictedFileUploader";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { FilePreview } from "@/components/vouchers/FilePreview";
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
};

export function InterCompanyVoucherAttachments({
  files,
  onFilesChange,
  disabled = false,
  className,
  compact = false,
}: Props) {
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
      <Label>Attachments (optional)</Label>
      <RestrictedFileUploader>
        <div className="flex flex-wrap gap-3">
          {files.map((file, idx) => (
            <FilePreview
              key={`${idx}-${typeof file === "string" ? file : file.name}`}
              file={file}
              onRemove={
                canAttach && fileAttachmentLimits.allowDelete
                  ? () => onFilesChange(files.filter((_, i) => i !== idx))
                  : undefined
              }
              className={!canAttach ? "pointer-events-none opacity-60" : ""}
            />
          ))}
          {canAttach && files.length < fileAttachmentLimits.maxFileCount ? (
            <>
              <AttachmentHoldPasteSurface
                enabled={canAttach}
                onShortActivate={() => fileInputRef.current?.click()}
                onPastedFiles={(incoming) =>
                  void appendCompressedVoucherAttachmentsToState({
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

"use client";

/**
 * Inter Company voucher — optional file attachments (source voucher par save).
 */
import { useRef } from "react";
import { PlusCircle } from "lucide-react";
import { FormLabel } from "@/components/ui/form";
import { RestrictedFileUploader } from "@/components/ui/RestrictedFileUploader";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { appendCompressedVoucherAttachmentsToState } from "@/lib/appendCompressedVoucherAttachments";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import usePermissions from "@/hooks/usePermissions";
import { interCompanyPanelClass } from "@/lib/interCompany/interCompanyVoucherChrome";

type FileEntry = File | string;

type Props = {
  files: FileEntry[];
  onFilesChange: (next: FileEntry[]) => void;
  disabled?: boolean;
  className?: string;
};

export function InterCompanyVoucherAttachments({
  files,
  onFilesChange,
  disabled = false,
  className,
}: Props) {
  const { toast } = useToast();
  const { fileAttachmentLimits, allowAttachments } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAttach =
    allowAttachments && !disabled && fileAttachmentLimits.maxFileCount > 0;

  return (
    <div className={cn(interCompanyPanelClass, "flex h-full min-h-0 flex-col space-y-2 p-3 min-w-0", className)}>
      <FormLabel>Attachments (optional)</FormLabel>
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
                  "border-emerald-200/70 bg-emerald-50/60 hover:border-emerald-400 dark:border-emerald-900/60 dark:bg-emerald-950/40"
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

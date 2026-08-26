"use client";

import { useId, useMemo, useRef } from "react";
import { PlusCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RestrictedFileUploader } from "@/components/ui/RestrictedFileUploader";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import {
  appendCompressedVoucherAttachmentsToState,
  handleVoucherAttachmentInputChange,
  useVoucherAttachmentProcessing,
} from "@/lib/appendCompressedVoucherAttachments";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { getVoucherAttachmentUrlsForUi } from "@/lib/voucherAttachmentNormalize";
import { toast } from "@/hooks/use-toast";

export function LoanVoucherAttachmentsField({
  files,
  setFiles,
  label = "Attach Files (Optional)",
}: {
  files: (File | string)[];
  setFiles: React.Dispatch<React.SetStateAction<(File | string)[]>>;
  label?: string;
}) {
  const { companyId, company } = useCompany();
  const { fileAttachmentLimits, allowAttachments } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachFileInputId = useId();
  const canAddMoreFiles =
    allowAttachments && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount;
  const isAttachmentProcessing = useVoucherAttachmentProcessing();

  const attachmentClientFileUrlsForPreview = useMemo(
    () => getVoucherAttachmentUrlsForUi({ fileUrls: files }),
    [files]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await handleVoucherAttachmentInputChange(e, {
      companyId,
      currentFiles: files,
      maxFiles: fileAttachmentLimits.maxFileCount || 0,
      allowImage: fileAttachmentLimits.allowImage,
      allowPDF: fileAttachmentLimits.allowPDF,
      setFiles,
      toast,
    });
    e.target.value = "";
  };

  if (!allowAttachments || fileAttachmentLimits.maxFileCount === 0) return null;

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <RestrictedFileUploader>
        <div className="flex flex-wrap gap-3">
          {files.map((file, index) => (
            <FilePreview
              key={`${typeof file === "string" ? file : file.name}-${index}`}
              file={file}
              isCompressing={isAttachmentProcessing}
              attachmentCompanyId={companyId || undefined}
              attachmentClientFileUrls={attachmentClientFileUrlsForPreview}
              onRemove={
                fileAttachmentLimits.allowDelete
                  ? () => setFiles((prev) => prev.filter((_, i) => i !== index))
                  : undefined
              }
            />
          ))}
          {canAddMoreFiles ? (
            <>
              <AttachmentHoldPasteSurface
                enabled={canAddMoreFiles}
                onShortActivate={() => fileInputRef.current?.click()}
                onPastedFiles={(incoming) =>
                  void appendCompressedVoucherAttachmentsToState({
                    companyId,
                    incomingFiles: incoming,
                    currentFiles: files,
                    maxFiles: fileAttachmentLimits.maxFileCount || 0,
                    allowImage: fileAttachmentLimits.allowImage,
                    allowPDF: fileAttachmentLimits.allowPDF,
                    setFiles,
                    toast,
                  })
                }
                voucherAttachmentReuse={{
                  currentFiles: files,
                  setFiles,
                  maxFiles: fileAttachmentLimits.maxFileCount,
                }}
                className="relative flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-primary"
              >
                <PlusCircle className="h-5 w-5" />
                <span className="mt-1 text-[10px]">Add File</span>
              </AttachmentHoldPasteSurface>
              <Input
                id={attachFileInputId}
                type="file"
                className="sr-only"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={
                  [fileAttachmentLimits.allowImage ? "image/*" : "", fileAttachmentLimits.allowPDF ? "application/pdf" : ""]
                    .filter(Boolean)
                    .join(",") || "image/*,application/pdf"
                }
                multiple={fileAttachmentLimits.maxFileCount > 1}
              />
            </>
          ) : null}
        </div>
      </RestrictedFileUploader>
    </div>
  );
}

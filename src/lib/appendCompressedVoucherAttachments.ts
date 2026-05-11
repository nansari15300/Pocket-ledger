"use client";

import type { Dispatch, SetStateAction } from "react";
import { compressVoucherAttachment } from "@/lib/compression";
import { attachmentMaxBytes, attachmentStillTooLargeToastFields } from "@/lib/attachmentCompressionUi";

export type VoucherAttachmentToastFn = (opts: {
  variant?: "default" | "destructive";
  title: string;
  description?: string;
}) => void;

/**
 * Voucher forms: naye File[] ko compress karke `files` state me append — file input aur hold-paste dono yahi.
 */
export async function appendCompressedVoucherAttachmentsToState(opts: {
  incomingFiles: File[];
  currentFiles: (File | string)[];
  maxFiles: number;
  allowImage: boolean;
  allowPDF: boolean;
  setFiles: Dispatch<SetStateAction<(File | string)[]>>;
  toast: VoucherAttachmentToastFn;
}): Promise<void> {
  const { incomingFiles, currentFiles, maxFiles, allowImage, allowPDF, setFiles, toast } = opts;
  if (maxFiles <= 0) {
    toast({
      variant: "destructive",
      title: "File Attachments Disabled",
      description: "File attachments are not allowed for your role.",
    });
    return;
  }

  const remainingSlots = maxFiles - currentFiles.length;
  if (remainingSlots <= 0) {
    toast({
      variant: "destructive",
      title: "Limit Reached",
      description: `You can only upload up to ${maxFiles} file${maxFiles > 1 ? "s" : ""}.`,
    });
    return;
  }

  const filesToProcess = incomingFiles.slice(0, remainingSlots);
  const maxBytes = attachmentMaxBytes();

  for (const file of filesToProcess) {
    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!allowImage && isImage) {
      toast({
        variant: "destructive",
        title: "File Type Not Allowed",
        description: "Image files are not allowed for your role.",
      });
      continue;
    }
    if (!allowPDF && isPDF) {
      toast({
        variant: "destructive",
        title: "File Type Not Allowed",
        description: "PDF files are not allowed for your role.",
      });
      continue;
    }
    if (!isImage && !isPDF) {
      toast({
        variant: "destructive",
        title: "File Type Not Allowed",
        description: "Only image and PDF files are allowed.",
      });
      continue;
    }

    try {
      const processedFile = await compressVoucherAttachment(file, maxBytes);
      if (processedFile.size > maxBytes) {
        toast({
          variant: "destructive",
          ...attachmentStillTooLargeToastFields(),
        });
        continue;
      }
      setFiles((prev) => {
        if (prev.length >= maxFiles) return prev;
        return [...prev, processedFile];
      });
    } catch (error) {
      console.error("Compression error:", error);
      toast({
        variant: "destructive",
        title: "Could not process file",
        description: error instanceof Error ? error.message : "Compression or PDF read failed.",
      });
    }
  }
}

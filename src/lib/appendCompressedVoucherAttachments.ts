"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { useSyncExternalStore } from "react";
import { compressVoucherAttachment } from "@/lib/compression";
import {
  attachmentMaxBytes,
  attachmentStillTooLargeToastFields,
  resolveAttachmentImageMaxBytes,
} from "@/lib/attachmentCompressionUi";

export type VoucherAttachmentToastFn = (opts: {
  variant?: "default" | "destructive";
  title: string;
  description?: string;
}) => void;

const attachmentProcessingListeners = new Set<() => void>();
let attachmentProcessingCount = 0;

function emitAttachmentProcessingChange(): void {
  attachmentProcessingListeners.forEach((listener) => listener());
}

function beginAttachmentProcessing(): () => void {
  attachmentProcessingCount += 1;
  emitAttachmentProcessingChange();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    attachmentProcessingCount = Math.max(0, attachmentProcessingCount - 1);
    emitAttachmentProcessingChange();
  };
}

function subscribeAttachmentProcessing(listener: () => void): () => void {
  attachmentProcessingListeners.add(listener);
  return () => attachmentProcessingListeners.delete(listener);
}

export function isVoucherAttachmentProcessing(): boolean {
  return attachmentProcessingCount > 0;
}

export function useVoucherAttachmentProcessing(): boolean {
  return useSyncExternalStore(
    subscribeAttachmentProcessing,
    isVoucherAttachmentProcessing,
    () => false
  );
}

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
  /** Online 100KB vs Local/PL/Drive 150KB image cap. */
  companyId?: string | null;
}): Promise<void> {
  const endProcessing = beginAttachmentProcessing();
  try {
    const {
      incomingFiles,
      currentFiles,
      maxFiles,
      allowImage,
      allowPDF,
      setFiles,
      toast,
      companyId,
    } = opts;
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
    const pdfMaxBytes = attachmentMaxBytes();
    const imageMaxBytes = await resolveAttachmentImageMaxBytes(companyId);

    const processedFiles: File[] = [];
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
        const maxBytes = isImage ? imageMaxBytes : pdfMaxBytes;
        const processedFile = await compressVoucherAttachment(file, maxBytes);
        // Images: never reject for size — always attach best compression.
        // PDFs keep soft 0.5MB reject (raster quality).
        if (!isImage && processedFile.size > maxBytes) {
          toast({
            variant: "destructive",
            ...attachmentStillTooLargeToastFields(),
          });
          continue;
        }
        processedFiles.push(processedFile);
      } catch (error) {
        console.error("Compression error:", error);
        toast({
          variant: "destructive",
          title: "Could not process file",
          description: error instanceof Error ? error.message : "Compression or PDF read failed.",
        });
      }
    }

    if (processedFiles.length > 0) {
      setFiles((prev) => {
        const slots = Math.max(0, maxFiles - prev.length);
        if (slots <= 0) return prev;
        return [...prev, ...processedFiles.slice(0, slots)];
      });
    }
  } finally {
    endProcessing();
  }
}

/** `<input type="file" onChange>` — sab voucher forms ek hi path (double-append avoid). */
export async function handleVoucherAttachmentInputChange(
  e: ChangeEvent<HTMLInputElement>,
  opts: Omit<Parameters<typeof appendCompressedVoucherAttachmentsToState>[0], "incomingFiles">
): Promise<void> {
  if (!e.target.files?.length) return;
  const incomingFiles = Array.from(e.target.files);
  await appendCompressedVoucherAttachmentsToState({ ...opts, incomingFiles });
  e.target.value = "";
}

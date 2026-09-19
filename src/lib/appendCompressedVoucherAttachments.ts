"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { useSyncExternalStore } from "react";
import { compressVoucherAttachment } from "@/lib/compression";
import {
  attachmentMaxBytes,
  attachmentStillTooLargeToastFields,
  resolveAttachmentImageKbBand,
  setAttachmentCompressionProgress,
  finishAttachmentCompressionProgress,
  createParallelAttachmentCompressionReporter,
  beginAttachmentCompressionAbortScope,
  endAttachmentCompressionAbortScope,
  throwIfAttachmentCompressionAborted,
  isAttachmentCompressionCancelledError,
  showAttachmentCompressionCancelledToast,
  dismissAttachmentCompressionProgressToast,
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

export function resetVoucherAttachmentProcessing(): void {
  attachmentProcessingCount = 0;
  emitAttachmentProcessingChange();
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
  let compressionCancelled = false;
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
    const imageBand = await resolveAttachmentImageKbBand(companyId);
    const imageMaxBytes = imageBand.maxKb * 1024;

    type IncomingJob = { file: File; isImage: boolean; isPDF: boolean };
    const validJobs: IncomingJob[] = [];
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
      validJobs.push({ file, isImage, isPDF });
    }

    const processedFiles: File[] = [];
    const signal = beginAttachmentCompressionAbortScope();
    setAttachmentCompressionProgress(1);
    const reportJob = createParallelAttachmentCompressionReporter(validJobs.length);
    const compressedResults = await Promise.all(
      validJobs.map(async (job, jobIdx) => {
        try {
          throwIfAttachmentCompressionAborted(signal);
          const maxBytes = job.isImage ? imageMaxBytes : pdfMaxBytes;
          reportJob(jobIdx, 0);
          const processedFile = await compressVoucherAttachment(
            job.file,
            maxBytes,
            job.isImage
              ? {
                  minKB: imageBand.minKb,
                  onProgress: (pct) => reportJob(jobIdx, pct),
                  signal,
                }
              : {
                  onProgress: (pct) => reportJob(jobIdx, pct),
                  signal,
                }
          );
          reportJob(jobIdx, 100);
          if (!job.isImage && processedFile.size > maxBytes) {
            return { ok: false as const, kind: "too_large" as const };
          }
          return { ok: true as const, file: processedFile };
        } catch (error) {
          if (isAttachmentCompressionCancelledError(error)) throw error;
          console.error("Compression error:", error);
          return {
            ok: false as const,
            kind: "error" as const,
            title: "Could not process file",
            description:
              error instanceof Error ? error.message : "Compression or PDF read failed.",
          };
        }
      })
    );

    for (const result of compressedResults) {
      if (result.ok) {
        processedFiles.push(result.file);
        continue;
      }
      if (result.kind === "too_large") {
        toast({ variant: "destructive", ...attachmentStillTooLargeToastFields() });
      } else {
        toast({
          variant: "destructive",
          title: result.title,
          description: result.description,
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
  } catch (error) {
    if (isAttachmentCompressionCancelledError(error)) {
      compressionCancelled = true;
      dismissAttachmentCompressionProgressToast();
      showAttachmentCompressionCancelledToast();
      return;
    }
    throw error;
  } finally {
    endAttachmentCompressionAbortScope();
    if (compressionCancelled) {
      dismissAttachmentCompressionProgressToast();
    } else {
      setAttachmentCompressionProgress(100);
      finishAttachmentCompressionProgress();
    }
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

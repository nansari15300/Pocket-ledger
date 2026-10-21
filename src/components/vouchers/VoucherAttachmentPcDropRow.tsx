"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AttachmentPcDropWrap } from "@/components/vouchers/AttachmentHoldPasteSurface";
import {
  appendCompressedVoucherAttachmentsToState as __frozenAppendAttachments,
  type VoucherAttachmentToastFn,
} from "@/lib/appendCompressedVoucherAttachments";
import { ocrWrapAppend } from "@/modules/ocr";
const appendCompressedVoucherAttachmentsToState = ocrWrapAppend(__frozenAppendAttachments);

type Limits = {
  maxFileCount: number;
  allowImage: boolean;
  allowPDF: boolean;
};

/** Voucher attach row — PC drag-drop on previews + Add File tile (same compress path as picker). */
export function VoucherAttachmentPcDropRow({
  enabled,
  companyId,
  files,
  setFiles,
  limits,
  toast,
  className,
  children,
}: {
  enabled: boolean;
  companyId?: string | null;
  files: (File | string)[];
  setFiles: Dispatch<SetStateAction<(File | string)[]>>;
  limits: Limits;
  toast: VoucherAttachmentToastFn;
  className?: string;
  children: ReactNode;
}) {
  const canDrop =
    enabled &&
    limits.maxFileCount > 0 &&
    files.length < limits.maxFileCount;

  return (
    <AttachmentPcDropWrap
      enabled={canDrop}
      className={className}
      onDropFiles={(incoming) =>
        void appendCompressedVoucherAttachmentsToState({
          companyId,
          incomingFiles: incoming,
          currentFiles: files,
          maxFiles: limits.maxFileCount || 0,
          allowImage: limits.allowImage,
          allowPDF: limits.allowPDF,
          setFiles,
          toast,
        })
      }
    >
      {children}
    </AttachmentPcDropWrap>
  );
}

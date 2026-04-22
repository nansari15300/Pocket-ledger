/**
 * Shared UX for voucher-style attachments (reference app): compress first, then cap.
 * Title + body stay identical everywhere so users see one consistent message.
 */
export const ATTACHMENT_MAX_SIZE_MB = 0.5;

export function attachmentMaxBytes(): number {
  return ATTACHMENT_MAX_SIZE_MB * 1024 * 1024;
}

/**
 * After `compressVoucherAttachment` / `compressFile`, if size still exceeds `maxBytes`
 * (default 0.5 MB), show this toast.
 */
export function attachmentStillTooLargeToastFields(maxMb: number = ATTACHMENT_MAX_SIZE_MB): {
  title: string;
  description: string;
} {
  return {
    title: "File Still Too Large",
    description: `After compression the file is still over ${maxMb} MB. Try a smaller PDF or image.`,
  };
}

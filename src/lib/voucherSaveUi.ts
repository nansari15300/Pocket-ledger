"use client";

import { toast as sonnerToast } from "sonner";

/**
 * Global snappy voucher feedback (Sonner `Toaster` bhi ~1s rakhta hai) —
 * Save & Close branch me dialog band hone se pehle loading toast hatana + chhota success.
 */
export const VOUCHER_SONNER_SUCCESS_MS = 1000;

/** `sonnerToast.loading` ko dismiss karke short success dikhao (same toast id recycle). */
export function replaceVoucherSaveLoadingWithShortSuccess(
  toastId: string | number,
  title: string,
  description?: string
): void {
  sonnerToast.dismiss(toastId);
  sonnerToast.success(title, {
    id: toastId,
    description,
    duration: VOUCHER_SONNER_SUCCESS_MS,
  });
}

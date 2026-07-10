"use client";

import { toast as sonnerToast } from "sonner";

/**
 * Global snappy voucher feedback (Sonner `Toaster` bhi ~1s rakhta hai) —
 * Save & Close branch me dialog band hone se pehle loading toast hatana + chhota success.
 */
export const VOUCHER_SONNER_SUCCESS_MS = 1000;

const VOUCHER_BACKGROUND_TOAST_POSITION = "bottom-center" as const;

/** Save & Close ke baad spend-wise / bill-wise sync — chhota bottom loading popup. */
export function showVoucherBackgroundProgress(message = "Saving links…"): string | number {
  return sonnerToast.loading(message, {
    position: VOUCHER_BACKGROUND_TOAST_POSITION,
    duration: Infinity,
    classNames: {
      toast: "text-sm py-2 px-3 min-h-0 w-auto max-w-[min(92vw,20rem)]",
    },
  });
}

export function completeVoucherBackgroundProgress(
  toastId: string | number | null | undefined,
  outcome: { ok: boolean; title: string; description?: string }
): void {
  if (toastId == null) return;
  sonnerToast.dismiss(toastId);
  if (outcome.ok) {
    sonnerToast.success(outcome.title, {
      description: outcome.description,
      duration: VOUCHER_SONNER_SUCCESS_MS,
      position: VOUCHER_BACKGROUND_TOAST_POSITION,
      classNames: {
        toast: "text-sm py-2 px-3 min-h-0 w-auto max-w-[min(92vw,20rem)]",
      },
    });
  } else {
    sonnerToast.error(outcome.title, {
      description: outcome.description,
      duration: 5000,
      position: VOUCHER_BACKGROUND_TOAST_POSITION,
      classNames: {
        toast: "text-sm py-2 px-3 min-h-0 w-auto max-w-[min(92vw,20rem)]",
      },
    });
  }
}

/** Save loading toast — staff offline / Host unreachable par turant error, loading mat dikhao. */
export async function beginVoucherSaveLoadingOrBlock(
  companyId: string,
  loadingMessage: string
): Promise<string | number | null> {
  const cid = String(companyId || "").trim();
  if (cid) {
    const { getPlServerStaffSaveBlockedMessage } = await import("@/lib/plServerStaffOfflinePolicy");
    const blocked = await getPlServerStaffSaveBlockedMessage(cid);
    if (blocked) {
      sonnerToast.error("Cannot save", { description: blocked });
      return null;
    }
  }
  return sonnerToast.loading(loadingMessage);
}

/** Authoritative / staff write errors — generic "Failed to save" ki jagah seedha message. */
export function voucherSaveErrorToast(
  toastId: string | number,
  error: unknown,
  fallback = "Failed to save voucher."
): void {
  if ((error as { plAuthoritativeWriteFailed?: boolean })?.plAuthoritativeWriteFailed) {
    sonnerToast.error("Cannot save", {
      id: toastId,
      description: error instanceof Error ? error.message : "Cannot save to Host.",
    });
    return;
  }
  sonnerToast.error("Error", {
    id: toastId,
    description: error instanceof Error && error.message ? error.message : fallback,
  });
}

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

"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NESTED_VOUCHER_ALERT_SHELL } from "@/lib/dialogShellChrome";
import { getActiveVoucherConvertSourceId, shouldMoveVoucherConvertSourceToBin } from "@/lib/voucherEditConvert";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bannerText: string;
  onConfirm: () => void;
};

export function VoucherEditConvertConfirmDialog({
  open,
  onOpenChange,
  bannerText,
  onConfirm,
}: Props) {
  // Read the banner checkbox choice each time the dialog renders (it re-renders when `open` flips).
  const activeSourceId = getActiveVoucherConvertSourceId();
  const moveToBin = activeSourceId ? shouldMoveVoucherConvertSourceToBin(activeSourceId) : true;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent {...NESTED_VOUCHER_ALERT_SHELL}>
        <AlertDialogHeader>
          <AlertDialogTitle>Convert voucher?</AlertDialogTitle>
          <AlertDialogDescription>{bannerText}</AlertDialogDescription>
          <AlertDialogDescription className="pt-1">
            The original voucher will{" "}
            {moveToBin ? (
              <span className="rounded bg-yellow-100 px-1 text-base font-bold text-emerald-800 dark:bg-yellow-900/40 dark:text-emerald-300">
                move to Recycle Bin
              </span>
            ) : (
              <span className="rounded bg-yellow-100 px-1 text-base font-bold text-amber-700 dark:bg-yellow-900/40 dark:text-amber-300">
                be kept
              </span>
            )}{" "}
            {moveToBin ? "(Converted)" : "(stays active)"}. A new voucher will be saved with your current details.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Convert</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

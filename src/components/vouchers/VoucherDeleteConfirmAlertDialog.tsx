"use client";

import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import {
  MasterDeleteConfirmAlertDialogContent,
  type MasterDeleteConfirmAlertDialogProps,
} from "@/components/common/MasterDeleteConfirmAlertDialog";
import {
  NESTED_VOUCHER_ALERT_CONTENT_CN,
  NESTED_VOUCHER_ALERT_OVERLAY_CN,
} from "@/lib/dialogShellChrome";
import { cn } from "@/lib/utils";

type Props = Omit<
  MasterDeleteConfirmAlertDialogProps,
  "overlayClassName" | "contentClassName"
> & {
  contentClassName?: string;
};

/** Voucher add/edit nested delete confirm — recycle bin + admin-only permanent delete. */
export function VoucherDeleteConfirmAlertDialog({
  open,
  onOpenChange,
  contentClassName,
  entityKind = "voucher",
  ...contentProps
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        overlayClassName={NESTED_VOUCHER_ALERT_OVERLAY_CN}
        className={cn(NESTED_VOUCHER_ALERT_CONTENT_CN, contentClassName)}
      >
        <MasterDeleteConfirmAlertDialogContent entityKind={entityKind} {...contentProps} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

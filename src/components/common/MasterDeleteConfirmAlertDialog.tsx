"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import usePermissions from "@/hooks/usePermissions";
import { MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS } from "@/lib/masterDialogFooterStyles";
import { cn } from "@/lib/utils";

export type MasterDeleteConfirmAlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: ReactNode;
  /** e.g. account, party, voucher, note */
  entityKind?: string;
  description?: ReactNode;
  onMoveToBin: () => void | Promise<void>;
  onDeletePermanently?: () => void | Promise<void>;
  busy?: boolean;
  moveToBinDisabled?: boolean;
  permanentDeleteDisabled?: boolean;
  contentClassName?: string;
  overlayClassName?: string;
  title?: string;
};

export function useCanPermanentDeleteFromForm(): boolean {
  const { can, role } = usePermissions();
  return role === "owner" || can("permanently_delete_records");
}

export function MasterDeleteConfirmAlertDialogContent({
  entityName,
  entityKind = "record",
  description,
  onMoveToBin,
  onDeletePermanently,
  busy = false,
  moveToBinDisabled = false,
  permanentDeleteDisabled = false,
  title = "Are you absolutely sure?",
}: Omit<
  MasterDeleteConfirmAlertDialogProps,
  "open" | "onOpenChange" | "contentClassName" | "overlayClassName"
>) {
  const showPermanentDelete = useCanPermanentDeleteFromForm() && !!onDeletePermanently;

  const run = (fn: () => void | Promise<void>) => {
    void fn();
  };

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {description ?? (
            <>
              This action will move the {entityKind}{" "}
              <span className="font-semibold text-foreground">{entityName}</span> to the recycle
              bin.
              {showPermanentDelete ? (
                <> Admins can also delete permanently — this cannot be undone.</>
              ) : null}
            </>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter
        className={cn(
          "gap-2",
          showPermanentDelete ? "flex-col sm:flex-row sm:flex-wrap sm:justify-end" : undefined
        )}
      >
        <AlertDialogCancel
          className={cn(MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS, showPermanentDelete && "sm:mr-auto")}
          disabled={busy}
        >
          Cancel
        </AlertDialogCancel>
        {showPermanentDelete ? (
          <Button
            type="button"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10"
            disabled={busy || permanentDeleteDisabled}
            onClick={() => run(onDeletePermanently!)}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Delete permanently
          </Button>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          disabled={busy || moveToBinDisabled}
          onClick={() => run(onMoveToBin)}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Move to Bin
        </Button>
      </AlertDialogFooter>
    </>
  );
}

export function MasterDeleteConfirmAlertDialog({
  open,
  onOpenChange,
  contentClassName,
  overlayClassName,
  ...contentProps
}: MasterDeleteConfirmAlertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent overlayClassName={overlayClassName} className={contentClassName}>
        <MasterDeleteConfirmAlertDialogContent {...contentProps} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

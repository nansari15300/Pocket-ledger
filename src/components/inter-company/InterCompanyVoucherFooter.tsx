"use client";

/**
 * Inter Company voucher footer — create par save/approve; edit par Cancel | Delete | History (left).
 */
import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import usePermissions from "@/hooks/usePermissions";
import {
  VOUCHER_BUTTONS_CLASS,
  BTN_HISTORY_CLASS,
  BTN_PRINT_CLASS,
  BTN_CANCEL_CLASS,
  BTN_SAVE_CLASS,
  BTN_APPROVE_CLASS,
} from "@/components/vouchers/voucherButtonStyles";

export type InterCompanyVoucherFooterProps = {
  inDialog?: boolean;
  voucher?: { id?: string; isApproved?: boolean } | null;
  editingDisabled?: boolean;
  /** Saved voucher edit — sirf History + Cancel; admin ko Delete */
  isEditViewOnly?: boolean;
  /** Company owner / CompanyAdmin — edit view par delete allow */
  isCompanyAdmin?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showHistoryButton?: boolean;
  showApproveButton?: boolean;
  onOpenHistory?: () => void;
  onApprove?: () => void;
  isApproving?: boolean;
  isLoading?: boolean;
  isFormDirty?: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  onPrint: () => void;
};

export function InterCompanyVoucherFooter({
  inDialog = false,
  voucher,
  editingDisabled = false,
  isEditViewOnly = false,
  isCompanyAdmin = false,
  deleteDisabledWhenLinked = false,
  showHistoryButton = false,
  showApproveButton = false,
  onOpenHistory,
  onApprove,
  isApproving = false,
  isLoading = false,
  isFormDirty = true,
  onCancel,
  onDelete,
  onPrint,
}: InterCompanyVoucherFooterProps) {
  const isMobile = useIsMobile();
  const { canDeleteVoucher } = usePermissions();

  const deleteDisabled =
    !voucher?.id ||
    deleteDisabledWhenLinked ||
    (!!voucher && !canDeleteVoucher(voucher)) ||
    (isEditViewOnly && !isCompanyAdmin);

  const historyDisabled = !voucher?.id || !showHistoryButton || !onOpenHistory;
  const approveDisabled =
    isEditViewOnly ||
    editingDisabled ||
    !showApproveButton ||
    !onApprove ||
    isApproving ||
    (!!voucher?.isApproved && !isFormDirty);

  const saveDisabled = isEditViewOnly || isLoading || editingDisabled || (!!voucher?.id && !isFormDirty);
  const printDisabled = isEditViewOnly || isLoading || editingDisabled;
  const showDelete = !isEditViewOnly || isCompanyAdmin;

  const deleteDialog = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          className={cn("shrink-0 rounded-full", isMobile && !isEditViewOnly && "w-full")}
          disabled={deleteDisabled}
        >
          {!isMobile || isEditViewOnly ? <Trash2 className="mr-2 h-4 w-4" /> : null}
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This Inter Company voucher (and its linked company copy) will go to the recycle bin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onDelete?.()} className="bg-destructive hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isEditViewOnly) {
    return (
      <div
        className={cn(
          "border-t min-w-0 max-w-full overflow-x-hidden pt-4 flex flex-wrap items-center justify-center gap-2 md:justify-start",
          inDialog ? "mt-[3px] pb-[3px]" : "",
          VOUCHER_BUTTONS_CLASS
        )}
      >
        <Button type="button" onClick={onCancel} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
          Cancel
        </Button>
        {showDelete ? deleteDialog : null}
        <Button
          type="button"
          onClick={onOpenHistory ?? (() => {})}
          disabled={historyDisabled}
          className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}
        >
          <History className="mr-2 h-4 w-4" /> History
        </Button>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div
        className={cn(
          "border-t min-w-0 max-w-full overflow-x-hidden",
          inDialog ? "mt-[3px] pt-[3px] pb-[3px]" : "pt-4",
          VOUCHER_BUTTONS_CLASS
        )}
      >
        <div className="grid w-full min-w-0 grid-cols-3 gap-2">
          {showDelete ? deleteDialog : null}
          <Button
            type="button"
            onClick={onOpenHistory ?? (() => {})}
            disabled={historyDisabled}
            className={cn("w-full", BTN_HISTORY_CLASS)}
          >
            History
          </Button>
          <Button type="button" onClick={onPrint} disabled={printDisabled} className={cn("w-full", BTN_PRINT_CLASS)}>
            Save & Print
          </Button>
          <Button type="button" onClick={onCancel} className={cn("w-full", BTN_CANCEL_CLASS)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveDisabled} className={cn("w-full", BTN_SAVE_CLASS)}>
            {isLoading ? "..." : "Save"}
          </Button>
          <Button
            type="button"
            onClick={() => onApprove?.()}
            disabled={approveDisabled}
            className={cn("w-full", BTN_APPROVE_CLASS)}
          >
            {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-t min-w-0 max-w-full overflow-x-hidden pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4",
        VOUCHER_BUTTONS_CLASS
      )}
    >
      <div className="flex flex-wrap justify-center gap-2 md:justify-start">
        <Button
          type="button"
          onClick={onOpenHistory ?? (() => {})}
          disabled={historyDisabled}
          className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}
        >
          <History className="mr-2 h-4 w-4" /> History
        </Button>
        {showDelete ? deleteDialog : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2 md:justify-end">
        <Button type="button" onClick={onPrint} disabled={printDisabled} className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}>
          Save & Print
        </Button>
        <Button type="button" onClick={onCancel} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
          Cancel
        </Button>
        <Button type="submit" disabled={saveDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
          {isLoading ? "..." : "Save"}
        </Button>
        <Button
          type="button"
          onClick={() => onApprove?.()}
          disabled={approveDisabled}
          className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}
        >
          {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
        </Button>
      </div>
    </div>
  );
}

"use client";

/**
 * Inter Company voucher footer — create par save/approve; edit par Cancel | Delete | History.
 * Delete = is company ki copy only (role/permission); revert/delete-request hata diya.
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
  /** Saved voucher — fields view-only after lock; delete still role-gated */
  isEditViewOnly?: boolean;
  isCompanyAdmin?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showHistoryButton?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onOpenHistory?: () => void;
  onApprove?: () => void;
  approveExtraDisabled?: boolean;
  approveBlockedHint?: string | null;
  isApproving?: boolean;
  isLoading?: boolean;
  isFormDirty?: boolean;
  onCancel: () => void;
  /** Is company ki IC copy recycle bin — peer untouched */
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
  showSaveAndApproveOnCreate = false,
  onOpenHistory,
  onApprove,
  approveExtraDisabled = false,
  approveBlockedHint = null,
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
    !onDelete ||
    (!!voucher && !canDeleteVoucher(voucher));

  const historyDisabled = !voucher?.id || !showHistoryButton || !onOpenHistory;
  const isCreateApproveFlow = showSaveAndApproveOnCreate && !voucher?.id;
  const approveDisabled = isCreateApproveFlow
    ? isEditViewOnly || isLoading || isApproving || editingDisabled || !onApprove
    : isEditViewOnly ||
      editingDisabled ||
      !showApproveButton ||
      !onApprove ||
      isApproving ||
      approveExtraDisabled ||
      (!!voucher?.isApproved && !isFormDirty);
  const approveLabel = isCreateApproveFlow
    ? "Save & Approve"
    : isApproving
      ? "..."
      : isFormDirty
        ? "Save & Approve"
        : "Approve";

  const saveDisabled = isEditViewOnly || isLoading || editingDisabled || (!!voucher?.id && !isFormDirty);
  const printDisabled = isEditViewOnly || isLoading || editingDisabled;

  const deleteButton = onDelete ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          className={cn("shrink-0 rounded-full", isMobile && !isEditViewOnly && "w-full")}
          disabled={deleteDisabled || isLoading}
        >
          {!isMobile || isEditViewOnly ? <Trash2 className="mr-2 h-4 w-4" /> : null}
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this company&apos;s copy?</AlertDialogTitle>
          <AlertDialogDescription>
            Only this company&apos;s Inter Company voucher goes to the recycle bin. The other company keeps
            their copy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onDelete?.()} className="bg-destructive hover:bg-destructive/90">
            Delete my copy
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  void isCompanyAdmin;

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
        {deleteButton}
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
        <div className="flex w-full min-w-0 flex-col gap-2">
          {deleteButton}
          <Button type="button" onClick={onCancel} className={cn("w-full rounded-full", BTN_CANCEL_CLASS)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveDisabled} className={cn("w-full rounded-full", BTN_SAVE_CLASS)}>
            {isLoading ? "..." : "Save"}
          </Button>
          {onApprove ? (
            <Button
              type="button"
              disabled={approveDisabled}
              title={approveBlockedHint || undefined}
              onClick={() => onApprove()}
              className={cn("w-full rounded-full", BTN_APPROVE_CLASS)}
            >
              {approveLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={printDisabled}
            onClick={onPrint}
            className={cn("w-full rounded-full", BTN_PRINT_CLASS)}
          >
            Save & Print
          </Button>
          {showHistoryButton ? (
            <Button
              type="button"
              onClick={onOpenHistory ?? (() => {})}
              disabled={historyDisabled}
              className={cn("w-full rounded-full", BTN_HISTORY_CLASS)}
            >
              <History className="mr-2 h-4 w-4" /> History
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-t min-w-0 max-w-full overflow-x-hidden pt-4 flex flex-wrap items-center justify-between gap-2",
        inDialog ? "mt-[3px] pb-[3px]" : "",
        VOUCHER_BUTTONS_CLASS
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {showHistoryButton ? (
          <Button
            type="button"
            onClick={onOpenHistory ?? (() => {})}
            disabled={historyDisabled}
            className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}
          >
            <History className="mr-2 h-4 w-4" /> History
          </Button>
        ) : null}
        {deleteButton}
        <Button type="button" onClick={onCancel} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
          Cancel
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={printDisabled}
          onClick={onPrint}
          className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}
        >
          Save & Print
        </Button>
        <Button type="submit" disabled={saveDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
          {isLoading ? "..." : "Save"}
        </Button>
        {onApprove ? (
          <Button
            type="button"
            disabled={approveDisabled}
            title={approveBlockedHint || undefined}
            onClick={() => onApprove()}
            className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}
          >
            {approveLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

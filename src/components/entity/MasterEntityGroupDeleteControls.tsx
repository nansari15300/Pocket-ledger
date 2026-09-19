"use client";

import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { MasterDeleteConfirmAlertDialogContent } from "@/components/common/MasterDeleteConfirmAlertDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function MasterEntityGroupDeleteIconButton({
  disabled,
  isLoading,
  onClick,
}: {
  disabled?: boolean;
  isLoading?: boolean;
  onClick: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onClick}
            disabled={disabled || isLoading}
            aria-label="Delete group"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Delete empty group</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function MasterEntityGroupDeleteAlert({
  open,
  onOpenChange,
  groupName,
  isLoading,
  disabled,
  onMoveToBin,
  onPermanentDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  isLoading?: boolean;
  disabled?: boolean;
  onMoveToBin: () => void | Promise<void>;
  onPermanentDelete: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <MasterDeleteConfirmAlertDialogContent
          title="Delete group?"
          entityKind="group"
          entityName={groupName}
          description={
            <>
              Choose how to remove{" "}
              <span className="font-semibold text-foreground">{groupName}</span>. This group has no
              accounts.
            </>
          }
          onMoveToBin={onMoveToBin}
          onDeletePermanently={onPermanentDelete}
          busy={isLoading}
          moveToBinDisabled={disabled}
          permanentDeleteDisabled={disabled}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

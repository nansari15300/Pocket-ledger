"use client";

import { Loader2, Trash2 } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS } from "@/lib/masterDialogFooterStyles";
import { cn } from "@/lib/utils";

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
        <AlertDialogHeader>
          <AlertDialogTitle>Delete group?</AlertDialogTitle>
          <AlertDialogDescription>
            Choose how to remove{" "}
            <span className="font-semibold text-foreground">{groupName}</span>. This group has no
            accounts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-row flex-nowrap items-center gap-2 sm:flex-row sm:justify-stretch sm:space-x-0">
          <AlertDialogCancel
            className={cn(MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS, "min-w-0 flex-1")}
            disabled={isLoading}
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            className="min-w-0 flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => void onMoveToBin()}
            disabled={isLoading || disabled}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Move to Bin
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-w-0 flex-1"
            onClick={() => void onPermanentDelete()}
            disabled={isLoading || disabled}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

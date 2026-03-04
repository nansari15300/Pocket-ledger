
"use client";

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateStaffForm } from "./CreateStaffForm";
import type { StaffGroup } from "./types";

export function CreateStaffDialog({
  onStaffCreated,
  children,
  isOpen: parentIsOpen,
  onOpenChange: parentOnOpenChange,
  groups,
  defaultName,
}: {
  onStaffCreated: (newId: string) => void;
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  groups: StaffGroup[];
  defaultName?: string;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isNestedOpen, setIsNestedOpen] = useState(false);
  const openedAtRef = useRef<number>(0);

  const isOpen =
    parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen =
    parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      openedAtRef.current = Date.now();
      setOpen(true);
      return;
    }
    // Ignore immediate close right after opening from combobox selection.
    if (Date.now() - openedAtRef.current < 250) return;
    setOpen(false);
  }, [setOpen]);

  const handleStaffCreated = (isSaveAndNew: boolean, newId: string) => {
    onStaffCreated(newId);
    if (!isSaveAndNew) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
      <DialogContent
        className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 z-50 sm:max-h-none sm:w-full sm:max-w-3xl sm:grid sm:flex-none sm:px-6"

        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          if (isNestedOpen) { e.preventDefault(); return; }
          const target = e.target as HTMLElement;
          const isInsideNested =
            target.closest('[data-radix-popper-content-wrapper]') ||
            target.closest('[cmdk-root]') ||
            target.closest('[data-radix-dialog-content]');
          if (isInsideNested) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isNestedOpen) { e.preventDefault(); return; }
          const target = e.target as HTMLElement;
          const isInsideNested =
            target.closest('[data-radix-popper-content-wrapper]') ||
            target.closest('[cmdk-root]') ||
            target.closest('[data-radix-dialog-content]');
          if (isInsideNested) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create a New Staff Member</DialogTitle>
          <DialogDescription>
            Add a new employee to your records. You can also upload a related file.
          </DialogDescription>
        </DialogHeader>
        {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
        <div className="py-4 overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">

          <CreateStaffForm onStaffCreated={handleStaffCreated} groups={groups} onNestedDialogOpenChange={setIsNestedOpen} defaultName={defaultName} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

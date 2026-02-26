
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
      <DialogContent
        className="sm:max-w-3xl z-50"
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
        <div className="py-4">
          <CreateStaffForm onStaffCreated={handleStaffCreated} groups={groups} onNestedDialogOpenChange={setIsNestedOpen} defaultName={defaultName} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

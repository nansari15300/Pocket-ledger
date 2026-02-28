
"use client";

import { useState } from "react";
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

  const isOpen =
    parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen =
    parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;

  const handleStaffCreated = (isSaveAndNew: boolean, newId: string) => {
    onStaffCreated(newId);
    if (!isSaveAndNew) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen} modal={false}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      {isOpen && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />}
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

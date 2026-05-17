
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
import { CreatePartyForm } from "./CreatePartyForm";

export function CreatePartyDialog({
  onPartyCreated,
  children,
  isOpen: parentIsOpen,
  onOpenChange: parentOnOpenChange,
}: {
  onPartyCreated: (id: string) => void;
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isNestedOpen, setIsNestedOpen] = useState(false);

  const isOpen =
    parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen =
    parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;
  /** Parent `isOpen` pass = controlled — trigger bahar; DialogTrigger asChild ref loop avoid */
  const isDialogControlled = parentIsOpen !== undefined;

  const handlePartyCreated = (isSaveAndNew: boolean, newId: string) => {
    onPartyCreated(newId);
    if (!isSaveAndNew) {
      setOpen(false);
    }
  };

  return (
    <>
      {isDialogControlled && children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
      {!isDialogControlled && children && (
        <DialogTrigger asChild>{children}</DialogTrigger>
      )}
      {/* MOBILE: max-h 85vh; PC (sm+): max-h 90vh taaki lamba form scroll ho — inner div overflow-y-auto. */}
      <DialogContent
    className="z-50 max-h-[85vh] w-[98vw] max-w-[98vw] flex min-h-0 flex-col rounded-xl px-0.5 sm:max-h-[90vh] sm:w-full sm:max-w-3xl sm:px-6"
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
        <DialogHeader className="shrink-0">
          <DialogTitle>Create a New Party</DialogTitle>
          <DialogDescription>
            Add a new customer or vendor to your records. You can also upload a related file.
          </DialogDescription>
        </DialogHeader>
        {/* Edit Party jaisa: flex column, form ke andar body scroll + sticky footer (create buttons). */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
          <CreatePartyForm
            onPartyCreated={handlePartyCreated}
            onNestedDialogOpenChange={setIsNestedOpen}
            onCloseDialogRequest={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

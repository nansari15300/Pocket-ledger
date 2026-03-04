
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

  const handlePartyCreated = (isSaveAndNew: boolean, newId: string) => {
    onPartyCreated(newId);
    if (!isSaveAndNew) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
  {children && <DialogTrigger asChild>{children}</DialogTrigger>}
<<<<<<< HEAD
  <DialogContent
    className="sm:max-w-3xl"
=======
  {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded corners. Keep same as CreateBankAccountDialog. */}
  <DialogContent
    className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 sm:max-h-none sm:w-full sm:max-w-3xl sm:grid sm:flex-none sm:px-6"
>>>>>>> 6a1ec26 (Animation Fixed)
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
          <DialogTitle>Create a New Party</DialogTitle>
          <DialogDescription>
            Add a new customer or vendor to your records. You can also upload a related file.
          </DialogDescription>
        </DialogHeader>
<<<<<<< HEAD
        <div className="py-4">
=======
        {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
        <div className="py-4 overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">
>>>>>>> 6a1ec26 (Animation Fixed)
          <CreatePartyForm onPartyCreated={handlePartyCreated} onNestedDialogOpenChange={setIsNestedOpen} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

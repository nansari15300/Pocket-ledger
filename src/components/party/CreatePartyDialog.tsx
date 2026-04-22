
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
  {/* MOBILE: max-h 85vh; PC (sm+): max-h 90vh taaki lamba form scroll ho — inner div overflow-y-auto. */}
  <DialogContent
    className="max-h-[85vh] w-[98vw] max-w-[98vw] flex min-h-0 flex-col rounded-xl px-0.5 sm:max-h-[90vh] sm:w-full sm:max-w-3xl sm:grid sm:flex-none sm:px-6"
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
        {/* Scrollable form area: mobile + desktop dono me dialog height ke andar scroll (sm: 90vh cap). */}
        <div className="py-4 overflow-y-auto min-h-0 flex-1 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
          <CreatePartyForm onPartyCreated={handlePartyCreated} onNestedDialogOpenChange={setIsNestedOpen} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

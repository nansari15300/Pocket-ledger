
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
import { useIsMobile } from "@/hooks/use-mobile";
import {
  cnMasterEntityDialogContent,
  masterEntityDialogFormWrapperClassName,
  masterEntityDialogHeaderClassName,
} from "@/lib/masterEntityDialogClasses";
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
  const isMobile = useIsMobile();

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
    className={cnMasterEntityDialogContent(isMobile)}
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
        <DialogHeader className={masterEntityDialogHeaderClassName}>
          <DialogTitle>Create a New Party</DialogTitle>
          <DialogDescription>
            Add a new customer or vendor to your records. You can also upload a related file.
          </DialogDescription>
        </DialogHeader>
        {/* Bank/Staff jaisa — portal par Pro theme fields (gray + black border) */}
        <div className={masterEntityDialogFormWrapperClassName}>
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

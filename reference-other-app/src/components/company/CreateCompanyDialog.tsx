
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreateCompanyForm } from "./CreateCompanyForm";
import { Button } from "../ui/button";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner"; 
import { ScrollArea } from "../ui/scroll-area";

export function CreateCompanyDialog({ 
    onCompanyCreated, 
    children, 
    isOpen, 
    onOpenChange,
    isDismissable = true,
    redirectTo
}: { 
    onCompanyCreated: (companyId: string) => void, 
    children?: React.ReactNode, 
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void,
    isDismissable?: boolean,
    /** If set, navigate here after create so the page actually changes without refresh. */
    redirectTo?: string | null
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const router = useRouter();

  const open = isOpen !== undefined ? isOpen : internalIsOpen;
  const setOpen = onOpenChange !== undefined ? onOpenChange : setInternalIsOpen;

  
  const handleCompanyCreated = async (companyId: string) => {
    // Company form already creates company + default data.
    onCompanyCreated(companyId);
    setOpen(false);
    toast.success("Company created successfully.");
    if (redirectTo) {
      router.replace(redirectTo);
    }
  };

  const dialogProps = isDismissable ? {} : {
      onEscapeKeyDown: (e: Event) => e.preventDefault(),
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent 
        // Mobile keeps current full-height style; desktop uses requested 80% width and 70% height.
        className="w-[98%] h-[90vh] max-h-[90vh] md:w-[80vw] md:max-w-[80vw] md:h-[70vh] md:max-h-[70vh] flex flex-col rounded-xl"
        {...dialogProps}
        hideCloseButton={!isDismissable}
        onPointerDownOutside={isDismissable ? undefined : (e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create a New Company</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new company profile.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full pr-6 -mr-6">
              <CreateCompanyForm onCompanyCreated={handleCompanyCreated} />
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

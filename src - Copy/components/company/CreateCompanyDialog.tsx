
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreateCompanyForm } from "./CreateCompanyForm";
import { Button } from "../ui/button";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth"; 
import { initializeCompanyData } from "@/lib/actions"; 
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
  const { user } = useAuth(); 
  const router = useRouter();

  const open = isOpen !== undefined ? isOpen : internalIsOpen;
  const setOpen = onOpenChange !== undefined ? onOpenChange : setInternalIsOpen;

  
  const handleCompanyCreated = async (companyId: string) => {
    if (!user) {
        toast.error("User not authenticated");
        return;
    }

    // Don't block UI: company is already created. Run default accounts setup in background.
    onCompanyCreated(companyId);
    setOpen(false);
    toast.success("Company created! Setting up default accounts in background...");
    if (redirectTo) {
      router.replace(redirectTo);
    }

    initializeCompanyData(companyId, user.uid)
      .then(() => {
        toast.success("Default accounts ready.");
      })
      .catch((error) => {
        const isPermissionDenied =
          (error?.code === "permission-denied") ||
          (typeof error?.message === "string" && (
            error.message.includes("PERMISSION_DENIED") ||
            error.message.includes("Missing or insufficient permissions")
          ));
        if (!isPermissionDenied) {
          console.error("Initialization error:", error);
        }
        toast.error("Default accounts setup failed. You can retry from Settings or use the company normally.");
        try {
          const pending = JSON.parse(localStorage.getItem("pendingCompanyInit") || "[]");
          if (!pending.includes(companyId)) pending.push(companyId);
          localStorage.setItem("pendingCompanyInit", JSON.stringify(pending));
        } catch {}
      });
  };

  const dialogProps = isDismissable ? {} : {
      onEscapeKeyDown: (e: Event) => e.preventDefault(),
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent 
        className="w-[98%] h-[90vh] max-h-[90vh] flex flex-col rounded-xl"
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


"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import type { TaxGroup } from "./types";
import { toast as sonnerToast } from "sonner";
import { isSystemGroupName } from "@/lib/system-group-names";

const formSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  parentId: z.string().min(1, "Parent group is required."),
});


export function CreateTaxGroupDialog({ onGroupCreated, children, isOpen, onOpenChange, groups = [] }: { 
    onGroupCreated: (groupId: string) => void, 
    children?: React.ReactNode, 
    groups: TaxGroup[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void 
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useCompany();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      parentId: "duties_taxes",
    },
  });

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-tax-group-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-tax-group-name', handlePrefill);
    };
  }, [form]);

  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    
    // Close dialog immediately for better UX
    if (!options.saveAndNew && onOpenChange) {
      onOpenChange(false);
    }
    
    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }

    const toastId = sonnerToast.loading("Creating group...");
    setIsLoading(true);
    
    try {
      const nameTrimmed = values.name.trim();
      
      // Check if it's a system group name
      if (isSystemGroupName("tax", nameTrimmed)) {
        sonnerToast.error("System Group Name", { id: toastId, description: "This is a system group name. Please use another name." });
        setIsLoading(false);
        return;
      }
      
      const nameLower = nameTrimmed.toLowerCase();
      const isDuplicate = (groups || []).some(
        (g) => !(g as any).isDeleted && (g.name?.trim().toLowerCase() ?? "") === nameLower
      );
      if (isDuplicate) {
        sonnerToast.error("Duplicate Group Name", { id: toastId, description: "A group with this name already exists." });
        setIsLoading(false);
        return;
      }

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/tax_groups`), {
        name: values.name.trim(),
        ownerId: user.uid,
        companyId: companyId,
        parentId: values.parentId,
        isDeleted: false,
        createdAt: serverTimestamp(),
      });

      sonnerToast.success("Group Created!", { id: toastId, description: `"${values.name}" has been successfully created.` });
      
      onGroupCreated(docRef.id);
      if (saveAndNew) {
        form.reset({ name: "", parentId: "duties_taxes" });
      }
    } catch (error) {
      console.error("Error creating group:", error);
      sonnerToast.error("Error Creating Group", { id: toastId, description: "Group details could not be saved. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  const { systemGroups, userGroups } = useMemo(() => {
      const system = groups.filter(g => (g as any).isSystemReserved);
      const userDefined = groups.filter(g => !(g as any).isSystemReserved);
      return { systemGroups: system, userGroups: userDefined };
  }, [groups]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogPortal>
        <DialogOverlay />
        {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
        <DialogContent 
          className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 z-[60] sm:max-h-none sm:w-full sm:max-w-md sm:grid sm:flex-none sm:px-6"

          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a New Tax Group</DialogTitle>
            <DialogDescription>Add a new group to categorize your tax types.</DialogDescription>
          </DialogHeader>
          </div>

        </DialogContent>
        </DialogPortal>
    </Dialog>
  );
}


"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import type { TaxGroup } from "@/components/tax/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { firestore, storage } from "@/lib/firebase";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Trash2, FileText, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateTaxGroupDialog } from "./CreateTaxGroupDialog";
import { Combobox } from "../ui/combobox";
import Image from "next/image";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressFile } from "@/lib/compression";
import { toast as sonnerToast } from "sonner";
import { FilePreview } from "../vouchers/FilePreview";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CreateTaxForm } from "./CreateTaxForm";


const fileSchema = z.object({
  file: z.instanceof(File),
  preview: z.string(),
});

const formSchema = z.object({
  name: z.string().min(2, { message: "Tax name must be at least 2 characters." }),
  rate: z.coerce.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot be over 100."),
  openingBalance: z.coerce.number().optional().default(0),
  openingBalanceDate: z.date().optional(),
  groupId: z.string().min(1, "A group is required."),
});

const MAX_FILE_SIZE_MB = 0.5;


export function CreateTaxDialog({ onTaxCreated, children, groups: parentGroups = [], isOpen: parentIsOpen, onOpenChange: parentOnOpenChange, prefillTaxName }: { 
    onTaxCreated: (newId: string, newTax?: { id: string; name: string; rate: number; balance?: number; companyId: string; groupId?: string }) => void, 
    children?: React.ReactNode, 
    groups?: TaxGroup[],
    isOpen?: boolean,
    onOpenChange?: (open: boolean) => void,
    prefillTaxName?: string
}) {
  const [internalIsOpen, setIsOpen] = useState(false);
  const [isNestedOpen, setIsNestedOpen] = useState(false);
  const router = useRouter();
  const [groups, setGroups] = useState<TaxGroup[]>(parentGroups);
  const { companyId } = useCompany();
  const { toast } = useToast();
  
  const isOpen = parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : setIsOpen;


  useEffect(() => {
    if (!isOpen || !companyId) return;

    const q = query(collection(firestore, `companies/${companyId}/tax_groups`), where("isDeleted", "==", false));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        setGroups(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaxGroup)));
    }, (error) => {
        console.error("Error fetching tax groups:", error);
        toast({ variant: "destructive", title: "Could not load groups" });
    });
    
    return () => unsubscribe();
  }, [isOpen, companyId, toast]);

  const handleTaxCreated = (isSaveAndNew: boolean, newId: string, newTax?: { id: string; name: string; rate: number; balance?: number; companyId: string; groupId?: string }) => {
    onTaxCreated(newId, newTax);
    if(!isSaveAndNew) setOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogPortal>
        <DialogOverlay />
<<<<<<< HEAD
        <DialogContent
            className="sm:max-w-lg z-50"
=======
        {/* MOBILE DIALOG SPEC (do not change when fixing other errors): height 85%, width 98%, left/right 2px gap (px-0.5), rounded. Match CreatePartyDialog / CreateBankAccountDialog. */}
        <DialogContent
            className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 z-50 sm:max-h-none sm:w-full sm:max-w-lg sm:grid sm:flex-none sm:px-6"
>>>>>>> 6a1ec26 (Animation Fixed)
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
                if (isNestedOpen) { e.preventDefault(); return; }
                const target = e.target as HTMLElement;
                const isInsideNested = target.closest('[data-radix-popper-content-wrapper]') || target.closest('[cmdk-root]');
                if (isInsideNested) e.preventDefault();
            }}
             onInteractOutside={(e) => {
                if (isNestedOpen) { e.preventDefault(); return; }
                const target = e.target as HTMLElement;
                const isInsideNested = target.closest('[data-radix-popper-content-wrapper]') || target.closest('[cmdk-root]');
                if (isInsideNested) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a New Tax Type</DialogTitle>
              <DialogDescription>
                Fill in the details for the new tax.
              </DialogDescription>
            </DialogHeader>
<<<<<<< HEAD
            <div className="py-4">
=======
            {/* Scrollable form area: fills 85vh dialog; do not remove overflow-y-auto / min-h-0 / flex-1. */}
            <div className="py-4 overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible">
>>>>>>> 6a1ec26 (Animation Fixed)
              <CreateTaxForm onTaxCreated={handleTaxCreated} groups={groups} onNestedDialogOpenChange={setIsNestedOpen} prefillName={prefillTaxName} />
            </div>
          </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

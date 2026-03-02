
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import type { TaxGroup } from "@/components/tax/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
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
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { isSystemParentGroup } from "@/lib/system-groups";


const fileSchema = z.object({
  file: z.instanceof(File),
  preview: z.string(),
});

const formSchema = z.object({
  name: z.string().min(2, { message: "Tax name must be at least 2 characters." }),
  rate: z.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot be over 100."),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
  groupId: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

export function CreateTaxForm({ onTaxCreated, groups, onNestedDialogOpenChange, prefillName }: { onTaxCreated?: (isSaveAndNew: boolean, newId: string, newTax?: { id: string; name: string; rate: number; balance?: number; companyId: string; groupId?: string }) => void, groups: TaxGroup[], onNestedDialogOpenChange?: (open: boolean) => void, prefillName?: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, triggerSync } = useCompany();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  React.useEffect(() => { onNestedDialogOpenChange?.(isCreateGroupOpen); }, [isCreateGroupOpen, onNestedDialogOpenChange]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);
  const { dateSystem } = useDate();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: "",
      rate: 0,
      openingBalance: 0,
      groupId: "",
    },
  });

  React.useEffect(() => {
    if (prefillName && prefillName.trim()) {
      form.setValue("name", prefillName.trim());
    }
  }, [prefillName, form]);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const inputFile = e.target.files[0];

    if (inputFile.size > 5 * 1024 * 1024) { // 5MB pre-check
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Please select a file smaller than 5MB to compress.`,
      });
      return;
    }

    if (inputFile) {
      try {
        const compressedFile = await compressFile(inputFile);
         if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast({
              variant: "destructive",
              title: "File Too Large After Compression",
              description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
            });
            return;
        }
        const preview = URL.createObjectURL(compressedFile);
        setFileToUpload({ file: compressedFile, preview });
      } catch (err) {
        console.error("File compression error:", err);
        toast({
            variant: "destructive",
            title: "File Error",
            description: "Could not process the file.",
        });
      }
    }
  };
  
  const removeFile = () => {
    if (fileToUpload?.preview) {
        URL.revokeObjectURL(fileToUpload.preview);
    }
    setFileToUpload(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }


  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    
    // Close dialog immediately for better UX
    onTaxCreated?.(options.saveAndNew || false, '');

    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in and have a company selected." });
      return;
    }

    const toastId = sonnerToast.loading("Saving tax...");
    setIsLoading(true);
    
    try {
       const q = query(
        collection(firestore, `companies/${companyId}/taxes`),
        where("name", "==", values.name.trim())
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        sonnerToast.error("Duplicate Tax Name", {
          id: toastId,
          description: "A tax with this name already exists.",
        });
        setIsLoading(false);
        return;
      }
      
      let fileUrl: string | null = null;
      if (fileToUpload) {
          const storageRef = ref(storage, `tax-files/${companyId}/${Date.now()}_${fileToUpload.file.name}`);
          const snapshot = await uploadBytes(storageRef, fileToUpload.file);
          fileUrl = await getDownloadURL(snapshot.ref);
      }
      
      const docRef = await addDoc(collection(firestore, `companies/${companyId}/taxes`), {
        name: values.name.trim(),
        rate: values.rate,
        openingBalance: values.openingBalance || 0,
        openingBalanceDate: values.openingBalanceDate || null,
        groupId: values.groupId || null,
        ownerId: user.uid,
        companyId,
        balance: values.openingBalance || 0,
        createdAt: serverTimestamp(),
        fileUrl: fileUrl,
        isDeleted: false,
      });

      // Automatically balance opening balance with Capital Account
      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, "taxes", docRef.id, 0, values.openingBalance);
      }

      sonnerToast.success("Tax Created!", {
        id: toastId,
        description: `"${values.name}" has been added.`,
      });
      
      triggerSync();

      if (saveAndNew) {
        form.reset();
        removeFile();
      }
      
      // If a new "real" ID is created, we can call the callback again if needed
      // but the initial optimistic close is what the user sees.
      const newTax = { id: docRef.id, name: values.name.trim(), rate: values.rate, balance: values.openingBalance || 0, companyId, groupId: values.groupId || undefined };
      onTaxCreated?.(saveAndNew, docRef.id, newTax);

    } catch (error) {
      console.error("Error creating tax:", error);
      sonnerToast.error("Error", {
        id: toastId,
        description: "Failed to create tax.",
      });
    } finally {
        setIsLoading(false);
    }
  }

  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setIsCreateGroupOpen(false);
  };
  
  const groupOptions = React.useMemo(() => {
    const userGroups = (groups || []).filter(
      (g) => !(g as any).isSystemReserved && !isSystemParentGroup("tax_groups", g.id)
    );
    return userGroups.map((g) => ({ value: g.id, label: g.name }));
  }, [groups]);

  const filteredGroups = React.useMemo(() => {
    if (!groupSearchQuery) return groups;
    return groups.filter((group) =>
      group.name.toLowerCase().includes(groupSearchQuery.toLowerCase())
    );
  }, [groups, groupSearchQuery]);

  return (
    <>
    <Form {...form}>
      <form onSubmit={(e) => handleFormSubmit(e)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
            control={form.control}
            name="name"
            render={({ field }: any) => (
                <FormItem>
                <FormLabel>Tax Name</FormLabel>
                <FormControl>
                    <Input placeholder="e.g., VAT" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
              control={form.control}
              name="groupId"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Group</FormLabel>
                  <Combobox
                    options={groupOptions}
                    value={field.value}
                    onChange={(value, newName) => {
                      if (value === "add-new") {
                        setIsCreateGroupOpen(true);
                         setTimeout(() => {
                          document.dispatchEvent(new CustomEvent('prefill-create-tax-group-name', { detail: newName }));
                        }, 100);
                      } else {
                        field.onChange(value === "none" ? "" : value);
                      }
                    }}
                    placeholder="Select a group"
                    addNewLabel="+ Add New Group"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
            control={form.control}
            name="rate"
            render={({ field }: any) => (
                <FormItem>
                <FormLabel>Tax Rate (%)</FormLabel>
                <FormControl>
                    <Input 
                      type="number" 
                      value={field.value || ''} 
                      onChange={(e) => {
                        const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                        field.onChange(value);
                      }}
                      onBlur={field.onBlur}
                    />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
             <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
              control={form.control}
              name="openingBalance"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Opening Balance</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="0" 
                      value={field.value || ''} 
                      onChange={(e) => {
                        const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                        field.onChange(value);
                      }}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
              />
              <FormField
                  control={form.control}
                  name="openingBalanceDate"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>As on Date</FormLabel>
                       <div className={cn("grid", dateSystem === 'Both' && "grid-cols-1 sm:grid-cols-2 gap-2")}>
                            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                                <BsDatePicker valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} />
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                                <Popover modal={true} open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                      >
                                        {field.value ? format(field.value, "MMM-dd-yyyy") : <span>Pick a date</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={(date) => { field.onChange(date); setIsCalendarOpen(false); }} initialFocus />
                                  </PopoverContent>
                                </Popover>
                            )}
                        </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
             </div>
             <FormItem>
              <FormLabel>Icon/File (Optional)</FormLabel>
              <div className="flex items-center gap-4">
                {fileToUpload && (
                  <FilePreview
                    file={fileToUpload.file}
                    onRemove={removeFile}
                  />
                )}
                {!fileToUpload && (
                   <FormControl>
                    <div 
                      className="relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center text-muted-foreground hover:border-primary transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                       <Upload className="h-6 w-6" />
                       <span className="text-xs mt-1">Add File</span>
                      <Input 
                        type="file" 
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*,application/pdf"
                      />
                    </div>
                  </FormControl>
                )}
              </div>
            </FormItem>
        </div>
        
        <div className="flex justify-end gap-2">
           <Button type="button" variant="outline" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & New
            </Button>
            <Button type="submit" disabled={isLoading || !companyId}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Tax
            </Button>
        </div>
      </form>
    </Form>
     <CreateTaxGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}


"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon, Upload } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, query, collection } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore, storage } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import type { Tax, TaxGroup } from "@/components/tax/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { CreateTaxGroupDialog } from "./CreateTaxGroupDialog";
import { FilePreview } from "../vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { toast as sonnerToast } from "sonner";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { isSystemParentGroup } from "@/lib/system-groups";

const formSchema = z.object({
  name: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  rate: z.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot be over 100."),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
  groupId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const MAX_FILE_SIZE_MB = 0.5;

export function EditTaxDialog({ tax, allTaxes, onTaxUpdated, onTaxDeleted, children, hasTransactions }: {
  tax: Tax;
  allTaxes: Tax[];
  onTaxUpdated: () => void;
  onTaxDeleted: (id: string) => void;
  children: React.ReactNode;
  hasTransactions: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth(); // soft-delete par recycle bin "Deleted by" ke liye uid
  const { companyId, triggerSync } = useCompany();
  const { dateSystem } = useDate();
  const [groups, setGroups] = useState<TaxGroup[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | string | null>(tax.fileUrl || null);


  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: tax.name,
      rate: tax.rate,
      openingBalance: tax.openingBalance || 0,
      openingBalanceDate: (tax as any).openingBalanceDate?.toDate ? (tax as any).openingBalanceDate.toDate() : undefined,
      groupId: tax.groupId || "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      const dateValue = (tax as any).openingBalanceDate;
      let finalDate;
      if (dateValue?.toDate) {
          finalDate = dateValue.toDate();
      } else if (dateValue instanceof Date) {
          finalDate = dateValue;
      } else if (dateValue) {
          finalDate = new Date(dateValue);
      } else {
          finalDate = undefined;
      }
      form.reset({
        name: tax.name,
        rate: tax.rate,
        openingBalance: tax.openingBalance || 0,
        openingBalanceDate: finalDate,
        groupId: tax.groupId || "",
      });
      setFile(tax.fileUrl || null);
    }
  }, [isOpen, tax, form]);
  
  useEffect(() => {
    if (!isOpen || !companyId) return;
    
    const q = query(collection(firestore, `companies/${companyId}/tax_groups`));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const fetchedGroups = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaxGroup));
        setGroups(fetchedGroups);
    }, (error) => {
        console.error("Error fetching groups:", error);
        toast({ variant: "destructive", title: "Could not load groups" });
    });
    
    return () => unsubscribe();
  }, [isOpen, companyId, toast]);

  async function onSubmit(values: FormValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    
    setIsOpen(false);
    
    const toastId = sonnerToast.loading("Updating tax...");
    try {
      let fileUrl = typeof file === 'string' ? file : null;
      if (file instanceof File) {
        const storageRef = ref(storage, `tax-files/${companyId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(snapshot.ref);
      }
      
      const oldOpeningBalance = tax.openingBalance || 0;
      const newOpeningBalance = values.openingBalance || 0;
      
      const taxRef = doc(firestore, `companies/${companyId}/taxes`, tax.id);
      await updateDoc(taxRef, { 
        name: values.name,
        rate: values.rate,
        openingBalance: newOpeningBalance,
        openingBalanceDate: values.openingBalanceDate || null,
        groupId: values.groupId || null,
        fileUrl: fileUrl,
      });

      // Automatically balance opening balance change with Capital Account
      if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, 'taxes', tax.id, oldOpeningBalance, newOpeningBalance);
      }

      sonnerToast.success("Tax Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      onTaxUpdated();
      triggerSync();

    } catch (error) {
      console.error("Error updating tax:", error);
      sonnerToast.error("Error Updating Tax", { id: toastId, description: "An error occurred. Please try again." });
    }
  }

  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasTransactions) {
      sonnerToast.error("Cannot Delete", { description: "This tax ledger has transactions and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/taxes`, tax.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || "",
        });
        toast({ title: "Tax Moved to Recycle Bin", description: `"${tax.name}" has been moved to the recycle bin.`});
        onTaxDeleted(tax.id);
        setIsOpen(false);
        setIsDeleteDialogOpen(false);
    } catch (error) {
        console.error("Error deleting tax: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the tax.",
        });
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setIsCreateGroupOpen(false);
  };

  const groupOptions = useMemo(() => {
    const userGroups = (groups || []).filter(
      (g) => !(g as any).isSystemReserved && !isSystemParentGroup("tax_groups", g.id)
    );
    return userGroups.map((g) => ({ value: g.id, label: g.name }));
  }, [groups]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const inputFile = e.target.files[0];

    if (inputFile.size > MAX_IMAGE_BYTES_BEFORE_COMPRESS) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Please select a file smaller than ${MAX_IMAGE_MB_BEFORE_COMPRESS}MB to compress.`,
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
        setFile(compressedFile);
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
    setFile(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }


  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {isOpen && <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" />}
        <DialogContent
            className="sm:max-w-lg z-50"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Tax</DialogTitle>
            <DialogDescription>Update the details for {tax.name}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
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
              </div>
               <FormItem>
                    <FormLabel>Icon/File</FormLabel>
                    <div className="flex items-center gap-4">
                        {file && (
                        <FilePreview file={file} onRemove={removeFile} />
                        )}
                        {!file && (
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

              <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setIsDeleteDialogOpen(true)}
                          disabled={hasTransactions}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Move to Bin
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {hasTransactions && (
                      <TooltipContent>
                        <p>Cannot delete a tax ledger with existing transactions.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <Button type="submit" className="col-span-2 sm:col-span-1">
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action will move the tax ledger <span className="font-semibold text-foreground">{tax.name}</span> to the recycle bin.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                    Move to Bin
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreateTaxGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}


"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon, Upload, FileText } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, collection, query } from "firebase/firestore";
import { uploadFile } from "@/lib/storage";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import type { Party, Group } from "@/components/party/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Textarea } from "../ui/textarea";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { toast as sonnerToast } from "sonner";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import { FilePreview } from "../vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { balanceOpeningBalanceWithCapital } from "@/lib/voucherActionsClient";


const formSchema = z.object({
  name: z.string().min(2, { message: "Party name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email." }).optional().or(z.literal("")),
  phone: z.string().optional(),
  pan: z.string().optional(),
  address: z.string().optional(),
  groupId: z.string().optional(),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;


export function EditPartyDialog({ party, onPartyUpdated, onPartyDeleted, children, hasTransactions }: {
  party: Party;
  onPartyUpdated: (updatedParty: Partial<Party>) => void;
  onPartyDeleted: (deletedId: string) => void;
  children: React.ReactNode;
  hasTransactions: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, triggerSync, company } = useCompany();
  const { canAddAvatar } = usePermissions();
  const { dateSystem } = useDate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [file, setFile] = useState<File | string | null>(party.fileUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
        name: party.name,
        email: party.email || "",
        phone: party.phone || "",
        pan: party.pan || "",
        address: party.address || "",
        groupId: party.groupId || "",
        openingBalance: party.openingBalance || 0,
        openingBalanceDate: (party as any).openingBalanceDate?.toDate ? (party as any).openingBalanceDate.toDate() : undefined,
    },
  });
  
  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setTimeout(() => setIsCreateGroupOpen(false), 50);
  };

  useEffect(() => {
    if (!isOpen || !companyId) return;
    
    const q = query(collection(firestore, `companies/${companyId}/groups`));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const fetchedGroups = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
        setGroups(fetchedGroups);
    }, (error) => {
        console.error("Error fetching groups:", error);
        toast({ variant: "destructive", title: "Could not load groups" });
    });
    
    return () => unsubscribe();
  }, [isOpen, companyId, toast]);


  useEffect(() => {
    if (isOpen) {
      const dateValue = (party as any).openingBalanceDate;
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
        name: party.name,
        email: party.email || "",
        phone: party.phone || "",
        pan: party.pan || "",
        address: party.address || "",
        groupId: party.groupId || "",
        openingBalance: party.openingBalance || 0,
        openingBalanceDate: finalDate,
      });
      setFile(party.fileUrl || null);
    }
  }, [isOpen, party, form]);

  async function onSubmit(values: z.infer<typeof formSchema>): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    
    setIsOpen(false);
    
    const toastId = sonnerToast.loading("Updating party...");
    try {
      let fileUrl = typeof file === 'string' ? file : null;
      if (file instanceof File && companyId && canAddAvatar) {
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: file.size, storageBytes: file.size });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          return;
        }
        const res = await uploadFile(
          { name: file.name, type: file.type, arrayBuffer: await file.arrayBuffer() },
          companyId,
          company?.name,
          "avatar",
          undefined,
          undefined,
          undefined,
          new Date()
        );
        if (res.success && res.url) {
          fileUrl = res.url;
          await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
        }
      }
      
      const oldOpeningBalance = party.openingBalance || 0;
      const newOpeningBalance = values.openingBalance || 0;
      
      const partyRef = doc(firestore, `companies/${companyId}/parties`, party.id);
      await updateDoc(partyRef, { 
          ...values,
          openingBalance: newOpeningBalance,
          openingBalanceDate: values.openingBalanceDate || null,
          fileUrl, 
          groupId: values.groupId || null
      });

      // Automatically balance opening balance change with Capital Account
      if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
        await balanceOpeningBalanceWithCapital(companyId, 'parties', party.id, oldOpeningBalance, newOpeningBalance);
      }

      sonnerToast.success("Party Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      onPartyUpdated({ id: party.id, ...values, fileUrl: fileUrl || '' });
      triggerSync(); // Trigger UI refresh

    } catch (error) {
      console.error("Error updating party:", error);
      sonnerToast.error("Error Updating Party", { id: toastId, description: "An error occurred. Please try again." });
    }
  }

  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasTransactions) {
      sonnerToast.error("Cannot Delete", { description: "This party has transactions and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/parties`, party.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || "",
        });
        toast({ title: "Party Moved to Bin", description: `"${party.name}" has been moved to the recycle bin.`});
        onPartyDeleted(party.id);
        setIsOpen(false);
        setIsDeleteDialogOpen(false);
    } catch (error) {
        console.error("Error deleting party: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the party.",
        });
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding or changing avatar/file." });
      return;
    }
    const inputFile = e.target.files[0];

    if (inputFile.size > MAX_IMAGE_BYTES_BEFORE_COMPRESS) {
      toast({
        variant: "destructive",
        title: "File Too Large",
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

  const partyGroupOptions = React.useMemo(() => {
    // Only user-created groups; system parent groups (Sundry Debtors/Creditors) are hidden
    return groups
      .filter(group => !(group as any).isSystemReserved)
      .map(group => ({ value: group.id, label: group.name }));
  }, [groups]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {isOpen && <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" />}
        <DialogContent
            className="sm:max-w-3xl z-50"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Party</DialogTitle>
            <DialogDescription>Update the details for {party.name}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }: any) => (
                        <FormItem>
                        <FormLabel>Party Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Creative Solutions Ltd." {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }: any) => (
                    <FormItem className="flex flex-col space-y-1 w-full">
                      <FormLabel>Group</FormLabel>
                      <FormControl>
                        <div className="w-full">
                           <Combobox
                              options={partyGroupOptions}
                              value={field.value}
                              onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreateGroupOpen(true);
                                    setTimeout(() => {
                                      document.dispatchEvent(new CustomEvent('prefill-create-group-name', { detail: newName }));
                                    }, 100);
                                  } else {
                                    field.onChange(val === 'none' ? '' : val);
                                  }
                              }}
                              placeholder="Select a group"
                              addNewLabel="+ Add New Group"
                            />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="name@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Phone No.</FormLabel>
                      <FormControl>
                        <Input placeholder="+91 12345 67890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pan"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>PAN No.</FormLabel>
                      <FormControl>
                        <Input placeholder="ABCDE1234F" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="md:col-span-1 grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="openingBalance"
                    render={({ field }: any) => (
                      <FormItem>
                        <FormLabel>Opening Balance</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
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
                                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
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
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }: any) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="123 Main Street, Anytown..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
                 <FormItem>
                    <FormLabel>Avatar/File</FormLabel>
                    {!canAddAvatar ? (
                      <p className="text-xs text-muted-foreground">
                        Upgrade plan to add or change avatar/file.{" "}
                        <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Click here to upgrade</Link>
                      </p>
                    ) : (
                    <div className="flex items-center gap-4">
                        {file && (
                        <FilePreview file={file} onRemove={() => setFile(null)} />
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
                    )}
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
                        <p>Cannot delete a party with existing transactions.</p>
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
                    This action will move the party <span className="font-semibold text-foreground">{party.name}</span> to the recycle bin.
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
      <CreateGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

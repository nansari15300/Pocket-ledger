
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, Upload, Trash2, FileText, CalendarIcon, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { uploadFile } from "@/lib/storage";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "../ui/textarea";
import { Separator } from "../ui/separator";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Calendar } from "@/components/ui/calendar";
import { compressFile } from "@/lib/compression";
import { FilePreview } from "../vouchers/FilePreview";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { Combobox } from "../ui/combobox";
import { toast as sonnerToast } from "sonner";
import { saveVoucher, balanceOpeningBalanceWithCapital } from "@/lib/voucherActionsClient";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import type { Party, Group } from "./types";
import { format } from "date-fns";


const formSchema = z
  .object({
    name: z.string().min(2, "Party name is required."),
    groupId: z.string().optional(),
    openingBalance: z.coerce.number(),
    openingBalanceDate: z.date().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z
      .union([z.string().email({ message: "Please enter a valid email." }), z.literal("")])
      .optional(),
    pan: z.string().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.password || data.confirmPassword) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    { message: "Passwords do not match.", path: ["confirmPassword"] }
  );

type FormValues = z.infer<typeof formSchema>;


const MAX_FILE_SIZE_MB = 0.5;


export function CreatePartyForm({
  onPartyCreated,
  onNestedDialogOpenChange,
}: {
  onPartyCreated?: (isSaveAndNew: boolean, newId: string) => void;
  onNestedDialogOpenChange?: (open: boolean) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionResult, setCompressionResult] = useState<{originalSize: number, compressedSize: number} | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  React.useEffect(() => { onNestedDialogOpenChange?.(isCreateGroupOpen); }, [isCreateGroupOpen, onNestedDialogOpenChange]);


  const { toast } = useToast();
  const { user } = useAuth();
  const { setCompanyId, companyId, triggerSync, company } = useCompany();
  const { canAddAvatar } = usePermissions();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const { processedGroups } = useVouchers();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      pan: "",
      password: "",
      confirmPassword: "",
      openingBalance: 0,
      groupId: "",
    },
    mode: "onChange",
  });


  const displayDate = (date?: Date) => {
    if (!date || isNaN(date.getTime())) return "Pick a date";
    switch (dateSystem) {
      case "AD":
        return formatDate(date);
      case "BS":
        return formatDateBS(date);
      case "Both":
        return `${formatDate(date)} / ${formatDateBS(date)}`;
      default:
        return formatDate(date);
    }
  };
  
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow adding avatar/file." });
      return;
    }
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
      setIsCompressing(true);
      try {
        const compressedFile = await compressFile(inputFile);
        setCompressionResult({ originalSize: inputFile.size, compressedSize: compressedFile.size });

        if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast({
              variant: "destructive",
              title: "File Too Large After Compression",
              description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
            });
            setFileToUpload(null);
            return;
        }
        
        const preview = URL.createObjectURL(compressedFile);
        setFileToUpload({ file: compressedFile, preview });
      } catch (err) {
        console.error("File compression error:", err);
        toast({ variant: "destructive", title: "File Error", description: "Could not process the file." });
      } finally {
        setIsCompressing(false);
      }
    }
  };
  
  const removeFile = () => {
    if (fileToUpload?.preview) {
        URL.revokeObjectURL(fileToUpload.preview);
    }
    setFileToUpload(null);
    setCompressionResult(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }

  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setIsCreateGroupOpen(false);
  };
  
  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(firestore, `companies/${companyId}/groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)).filter(g => !g.isDeleted));
    });
    return () => unsubscribe();
  }, [companyId]);

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('name', event.detail || '');
    };
    document.addEventListener('prefill-create-party-name', handlePrefill as any);
    return () => document.removeEventListener('prefill-create-party-name', handlePrefill as any);
  }, [form]);


  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    
    onPartyCreated?.(options.saveAndNew || false, '');

    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: FormValues, saveAndNew: boolean = false) {
    if (!user || !user.email) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in to create a company.",
      });
      return;
    }
    
    const toastId = sonnerToast.loading("Saving party...");
    setIsLoading(true);

    try {
      const q = query(
        collection(firestore, `companies/${companyId}/parties`),
        where("name", "==", values.name.trim())
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        sonnerToast.error("Duplicate Party Name", {
          id: toastId,
          description: "A party with this name already exists.",
        });
        setIsLoading(false);
        return;
      }

      let fileUrl: string | null = null;
      if (fileToUpload && canAddAvatar) {
        const limitCheck = await checkStorageLimit(companyId!, company?.planId, { attachmentsBytes: fileToUpload.file.size, storageBytes: fileToUpload.file.size });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        const res = await uploadFile(
          { name: fileToUpload.file.name, type: fileToUpload.file.type, arrayBuffer: await fileToUpload.file.arrayBuffer() },
          companyId!,
          company?.name,
          "avatar",
          undefined,
          undefined,
          undefined,
          new Date()
        );
        if (res.success && res.url) {
          fileUrl = res.url;
          await incrementCompanyStorage(companyId!, { attachmentsBytes: fileToUpload.file.size, storageBytes: fileToUpload.file.size });
        }
      }

      const docRef = await addDoc(collection(firestore, `companies/${companyId}/parties`), {
        name: values.name,
        address: values.address,
        phone: values.phone,
        email: values.email,
        pan: values.pan,
        openingBalance: values.openingBalance,
        openingBalanceDate: values.openingBalanceDate || null,
        ownerId: user.uid,
        companyId,
        groupId: values.groupId || null,
        balance: values.openingBalance,
        isDeleted: false,
        createdAt: serverTimestamp(),
        fileUrl,
      });

      // Automatically balance opening balance with Capital Account
      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        await balanceOpeningBalanceWithCapital(companyId!, 'parties', docRef.id, 0, values.openingBalance);
      }

      sonnerToast.success("Party Created!", {
        id: toastId,
        description: `"${values.name}" has been successfully created.`,
      });
      
      triggerSync();

      if (saveAndNew) {
        form.reset();
        removeFile();
      }

      onPartyCreated?.(saveAndNew, docRef.id);

    } catch (error) {
      console.error("Error creating party:", error);
      sonnerToast.error("Error", {
        id: toastId,
        description: "Failed to create party. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const partyGroupOptions = React.useMemo(() => {
    // Only user-defined party groups; system parent groups are hidden from selection
    return processedGroups
      .filter(group => !(group as any).isSystemReserved)
      .map(group => ({ value: group.id, label: group.name }));
  }, [processedGroups]);

  return (
    <>
    <Form {...form}>
      <form onSubmit={(e) => handleFormSubmit(e)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Party Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., John Doe" {...field} />
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
                    options={partyGroupOptions}
                    value={field.value}
                    onChange={(val, newName) => {
                        if (val === 'add-new') {
                            setIsCreateGroupOpen(true);
                            setTimeout(() => {
                                document.dispatchEvent(new CustomEvent('prefill-create-group-name', { detail: newName }));
                            }, 100);
                        } else {
                            field.onChange(val === "none" ? "" : val);
                        }
                    }}
                    placeholder="Select a group"
                    addNewLabel="+ Add New Group"
                    />
                <FormMessage />
                </FormItem>
            )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel>Phone No.</FormLabel>
                <FormControl>
                  <Input placeholder="Party phone number" {...field} />
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
                  <Input placeholder="Party email address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Party's full address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
            control={form.control}
            name="pan"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel>PAN/VAT No.</FormLabel>
                <FormControl>
                  <Input placeholder="Party's PAN/VAT" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
                  <FormItem className="flex flex-col pt-2">
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

        <Separator />
        
        <FormItem>
          <FormLabel>Avatar/File (Optional)</FormLabel>
          {!canAddAvatar ? (
            <p className="text-xs text-muted-foreground">
              Upgrade plan to add avatar/file.{" "}
              <Link href="/billing" className="text-primary underline font-medium hover:no-underline">Click here to upgrade</Link>
            </p>
          ) : (
            <RestrictedFileUploader>
              <div className="flex items-center gap-4">
                {fileToUpload && (
                  <FilePreview
                    file={fileToUpload.file}
                    onRemove={removeFile}
                    isCompressing={isCompressing}
                    compressionResult={compressionResult}
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
            </RestrictedFileUploader>
          )}
        </FormItem>

        <div className="flex justify-end gap-4 pt-4">
          {onPartyCreated && (
            <Button type="button" variant="outline" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & New
            </Button>
          )}
          <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Party
          </Button>
        </div>
      </form>
    </Form>
     <CreateGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

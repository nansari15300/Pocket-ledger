
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle, CalendarIcon, Upload, Trash2, FileText, Crown } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, serverTimestamp, query, onSnapshot, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore, storage } from "@/lib/firebase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountGroup } from "@/components/bank-cash/types";
import { CreateAccountGroupDialog } from "./CreateAccountGroupDialog";
import { Switch } from "@/components/ui/switch";
import usePermissions from "@/hooks/usePermissions";
import { Combobox } from "../ui/combobox";
import { useDate } from "@/hooks/useDate";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import Image from 'next/image';
import { compressFile } from "@/lib/compression";
import { FilePreview } from "../vouchers/FilePreview";
import { toast as sonnerToast } from "sonner";
import { ScrollArea } from "../ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { SpecialAccountAccessControl } from "./SpecialAccountAccessControl";

const MAX_FILE_SIZE_MB = 0.5;

const formSchema = z.object({
  accountName: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  accountType: z.enum(["Bank", "Cash"]),
  openingBalance: z.number().min(0),
  openingBalanceDate: z.date().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  groupId: z.string().optional(), // Group optional so accounts can start as Ungrouped
  isSpecial: z.boolean(),
  useFor: z.object({
    in: z.array(z.string()),
    out: z.array(z.string()),
  }).optional(),
});

export function CreateBankAccountDialog({
  onAccountCreated,
  children,
  isOpen: parentIsOpen,
  onOpenChange: parentOnOpenChange,
}: {
  onAccountCreated: (id: string) => void;
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const { can } = usePermissions();
  const { dateSystem } = useDate();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileToUpload, setFileToUpload] = useState<{ file: File; preview: string } | null>(null);
  const [compressionResult, setCompressionResult] = useState<{originalSize: number, compressedSize: number} | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  
  const isOpen = parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setIsOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountName: "",
      accountType: "Bank",
      openingBalance: 0,
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      groupId: "",
      isSpecial: false,
      useFor: { 
          in: company?.ownerEmail ? [company.ownerEmail] : [], 
          out: company?.ownerEmail ? [company.ownerEmail] : [] 
      }
    },
  });

  const accountType = form.watch("accountType");
  const isSpecial = form.watch("isSpecial");
  
  const usersForAccessControl = useMemo(() => {
    if (!company) return [];

    const ownerUser = {
        id: company.ownerEmail, 
        email: company.ownerEmail,
        name: "Owner",
        photoURL: null,
        role: 'owner' as const
    };

    const sharedUsers = (company.sharedWith || []).map(u => ({
        id: u.email, 
        email: u.email,
        name: u.name || "Unknown",
        photoURL: u.photoURL || null,
        role: u.role
    }));
    
    const uniqueUsersMap = new Map<string, any>();
    
    if(ownerUser.id) {
      uniqueUsersMap.set(ownerUser.id, ownerUser);
    }

    sharedUsers.forEach(u => {
        if (u.id && !uniqueUsersMap.has(u.id)) {
            uniqueUsersMap.set(u.id, u);
        }
    });

    return Array.from(uniqueUsersMap.values());
  }, [company]);

  useEffect(() => {
    if (!companyId || !isOpen) return;
    const q = query(collection(firestore, `companies/${companyId}/account_groups`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountGroup));
      setGroups(fetchedGroups);
    });
    return () => unsubscribe();
  }, [companyId, isOpen]);

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      form.setValue('accountName', event.detail || '');
    };
    // @ts-ignore
    document.addEventListener('prefill-create-bank-account-name', handlePrefill);
    return () => {
      // @ts-ignore
      document.removeEventListener('prefill-create-bank-account-name', handlePrefill);
    };
  }, [form]);
  
  useEffect(() => {
    // Do not auto-assign system parent groups; let accounts start Ungrouped unless user picks a custom group
    if (!isOpen) return;
    const anyCurrent = form.getValues("groupId");
    if (!anyCurrent && groups.some(g => !(g as any).isSystemReserved)) {
      const firstCustom = groups.find(g => !(g as any).isSystemReserved);
      if (firstCustom) form.setValue("groupId", firstCustom.id);
    }
  }, [isOpen, groups, form]);


  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setTimeout(() => setIsCreateGroupOpen(false), 50);
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const inputFile = e.target.files[0];
    if (!inputFile) return;

    if (inputFile.size > 5 * 1024 * 1024) { // Pre-check size
        toast({ variant: "destructive", title: "File too large", description: `Please select a file smaller than 5MB to compress.` });
        return;
    }

    try {
        setIsCompressing(true);
        const compressedFile = await compressFile(inputFile);
        setCompressionResult({ originalSize: inputFile.size, compressedSize: compressedFile.size });

        if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast({ variant: "destructive", title: "File Too Large After Compression", description: `Please select a smaller file. Max size is ${MAX_FILE_SIZE_MB}MB.` });
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


  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    if (!options.saveAndNew) {
      setIsOpen(false);
    }
    processAndSave(form.getValues(), options.saveAndNew);
  }

  async function processAndSave(values: z.infer<typeof formSchema>, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in and have a company selected." });
      return;
    }

    const toastId = sonnerToast.loading("Creating account...");
    setIsLoading(true);

    try {
      const q = query(
        collection(firestore, `companies/${companyId}/bank_accounts`),
        where("accountName", "==", values.accountName.trim())
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docs = querySnapshot.docs;
        const hasActive = docs.some((d) => (d.data() as any)?.isDeleted !== true);
        const hasOnlyDeleted = !hasActive && docs.length > 0;

        if (hasActive) {
          // Same name exists in active accounts
          sonnerToast.error("Duplicate Account Name", {
            id: toastId,
            description: "An account with this name already exists. Please choose a different name.",
          });
          setIsLoading(false);
          return;
        }

        if (hasOnlyDeleted) {
          // Same name exists only in recycle bin
          sonnerToast.error("Account Exists in Recycle Bin", {
            id: toastId,
            description: "An account with this name is already in the recycle bin. Please go to Recycle Bin and restore it instead of creating a new one.",
          });
          setIsLoading(false);
          return;
        }
      }
      
      let fileUrl: string | null = null;
      if (fileToUpload) {
          const storageRef = ref(storage, `account-files/${companyId}/${Date.now()}_${fileToUpload.file.name}`);
          const snapshot = await uploadBytes(storageRef, fileToUpload.file);
          fileUrl = await getDownloadURL(snapshot.ref);
      }
      
      const docRef = await addDoc(collection(firestore, `companies/${companyId}/bank_accounts`), {
        ...values,
        groupId: values.groupId || null,
        openingBalanceDate: values.openingBalanceDate || null,
        fileUrl,
        ownerId: user.uid,
        companyId,
        createdAt: serverTimestamp(),
        isDeleted: false,
      });

      // Automatically balance opening balance with Capital Account
      if (values.openingBalance && Math.abs(values.openingBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, 'bank_accounts', docRef.id, 0, values.openingBalance);
      }

      sonnerToast.success("Account Created!", { id: toastId, description: `"${values.accountName}" has been successfully created.` });
      
      onAccountCreated(docRef.id);

      if (saveAndNew) {
        form.reset();
        removeFile();
      } else {
        setIsOpen(false);
      }
    } catch (error) {
      console.error("Error creating account:", error);
      sonnerToast.error("Error Creating Account", { id: toastId, description: "Account could not be saved. Please try again." });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={true}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogContent 
            className="sm:max-w-2xl"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
              if (isCreateGroupOpen) { e.preventDefault(); return; }
              const target = e.target as HTMLElement;
              if (
                target.closest('[data-radix-popper-content-wrapper]') ||
                target.closest('[cmdk-root]')
              ) {
                e.preventDefault();
              }
            }}
            onInteractOutside={(e) => {
               if (isCreateGroupOpen) { e.preventDefault(); return; }
               const target = e.target as HTMLElement;
               if (target.closest('[data-radix-dialog-content]')) {
                  e.preventDefault();
               }
            }}
        >
          <DialogHeader>
            <DialogTitle>Create a New Bank/Cash Account</DialogTitle>
            <DialogDescription>Add a new bank or cash account to manage your transactions.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={(e) => handleFormSubmit(e)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Cash in Hand" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountType"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex space-x-4 pt-2"
                      >
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl><RadioGroupItem value="Bank" /></FormControl>
                          <FormLabel className="font-normal">Bank Account</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl><RadioGroupItem value="Cash" /></FormControl>
                          <FormLabel className="font-normal">Cash in Hand</FormLabel>
                        </FormItem>
                      </RadioGroup>
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
                        <FormControl>
                            <div className="flex items-center gap-2">
                            <div className="flex-1">
                            <Combobox
                                options={[
                                    ...groups
                                      .filter((group) => !(group as any).isSystemReserved)
                                      .map((group) => ({
                                        value: group.id,
                                        label: group.name,
                                      })),
                                ]}
                                value={field.value}
                                onChange={(val, newName) => {
                                    if (val === "add-new") {
                                    setIsCreateGroupOpen(true);
                                    setTimeout(() => {
                                        document.dispatchEvent(new CustomEvent('prefill-create-account-group-name', { detail: newName }));
                                    }, 100);
                                    } else {
                                    field.onChange(val === "none" ? "" : val);
                                    }
                                }}
                                placeholder="Select or search a group"
                                addNewLabel="Create New Group"
                                disabled={isLoading}
                                />
                            </div>
                            </div>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="openingBalance"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Opening Balance</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
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
                      <div className={cn("grid", dateSystem === 'Both' && "grid-cols-2 gap-2")}>
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

                {accountType === "Bank" && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>Bank Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Himalayan Bank" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="accountNumber"
                          render={({ field }: any) => (
                            <FormItem>
                              <FormLabel>Account Number</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., 123456789" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="ifscCode"
                          render={({ field }: any) => (
                            <FormItem>
                              <FormLabel>IFSC/SWIFT Code</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., HBLNPKA..." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                    </div>
                  </div>
                )}
                
                {can('manage_special_bank_accounts') && (
                 <FormField
                  control={form.control}
                  name="isSpecial"
                  render={({ field }: any) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Mark as Special Account</FormLabel>
                        <FormDescription>Special accounts have restricted visibility.</FormDescription>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )}
                />
                )}
                
                {isSpecial && can('manage_special_bank_accounts') && (
                      <Card className="p-4">
                        <CardHeader className="p-0 pb-4"><CardTitle className="text-base">Special Account Usage Control</CardTitle></CardHeader>
                        <CardContent className="p-0">
                           <SpecialAccountAccessControl
                                users={usersForAccessControl}
                                useFor={{
                                  in: form.watch('useFor')?.in ?? [],
                                  out: form.watch('useFor')?.out ?? [],
                                }}
                                onUseForChange={(newUseFor) => form.setValue('useFor', newUseFor)}
                            />
                        </CardContent>
                      </Card>
                )}
                <FormItem>
                    <FormLabel>Avatar/File (Optional)</FormLabel>
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
                </FormItem>

                <DialogFooter className="mt-4">
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                    <Button type="button" variant="outline" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                  </Button>
                  <Button type="submit" disabled={isLoading || !companyId}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <CreateAccountGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

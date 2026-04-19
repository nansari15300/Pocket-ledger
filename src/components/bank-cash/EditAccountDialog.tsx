
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon, Upload } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, collection, query, getDoc } from "firebase/firestore";
import { stageEntityAvatarAndDocuments, isProfileAvatarImageFile, isProfileDocumentFile } from "@/lib/entityProfileLocalFiles";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import Link from "next/link";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { isLocalOnlyMode } from "@/lib/localMode";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { CreateAccountGroupDialog } from "./CreateAccountGroupDialog";
import { Switch } from "../ui/switch";
import usePermissions from "@/hooks/usePermissions";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { cnStaticMobileFullscreenDialog, IS_STATIC_APK } from "@/lib/staticMobileFullscreenDialog";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { useAuth } from "@/hooks/useAuth";
import { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { FilePreview } from "../vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { toast as sonnerToast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { SpecialAccountAccessControl } from "./SpecialAccountAccessControl";
import { getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { EntityOpeningBalanceNarrationField } from "@/components/common/EntityProfileDocumentsNarrationFields";

/** CreateBankAccountDialog jaisa: combobox value `ungrouped_account` jab account Ungrouped bucket mein ho (null / empty legacy). */
function normalizeBankAccountEditGroupId(groupId: string | null | undefined): string {
  const u = getUngroupedGroupId("bank");
  if (!groupId || groupId === u) return u;
  return groupId;
}

const MAX_FILE_SIZE_MB = 0.5;

const formSchema = z.object({
  accountName: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  accountType: z.enum(["Bank", "Cash"]),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.any().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  groupId: z.string().optional(),
  openingBalanceNarration: z.string().optional(),
  isSpecial: z.boolean(),
  useFor: z.object({
    in: z.array(z.string()),
    out: z.array(z.string()),
  }).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function EditAccountDialog({ account, allAccounts, onAccountUpdated, onAccountDeleted, children, hasTransactions, isOpen: controlledIsOpen, onOpenChange }: {
  account: Account;
  allAccounts?: Account[];
  onAccountUpdated: (updatedAccount: Partial<Account>) => void;
  onAccountDeleted: (deletedId: string) => void;
  children: React.ReactNode;
  hasTransactions: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { processedAccountGroups } = useVouchers();
  const processedAccountGroupsRef = useRef(processedAccountGroups);
  processedAccountGroupsRef.current = processedAccountGroups;
  const { dateSystem } = useDate();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = useCallback((open: boolean) => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(open);
    }
    onOpenChange?.(open);
  }, [controlledIsOpen, onOpenChange]);

  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  /** Profile — image / saved URL / local: */
  const [file, setFile] = useState<File | string | null>(account.fileUrl || null);
  const [docSlots, setDocSlots] = useState<Array<File | string>>(() => account.documentFileUrls || []);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);
  const { can, canAddAvatar, canAddFileImagePdf } = usePermissions();
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const isMobile = useIsMobile();
  const staticMobileFullscreen = IS_STATIC_APK && isMobile;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
        accountName: account.accountName,
        accountType: account.accountType,
        openingBalance: account.openingBalance,
        openingBalanceDate: (account as any).openingBalanceDate?.toDate ? (account as any).openingBalanceDate.toDate() : undefined,
        bankName: account.bankName || "",
        accountNumber: account.accountNumber || "",
        ifscCode: account.ifscCode || "",
        groupId: normalizeBankAccountEditGroupId(account.groupId),
        isSpecial: account.isSpecial || false,
        useFor: account.useFor || { 
            in: company?.ownerEmail ? [company.ownerEmail] : [], 
            out: company?.ownerEmail ? [company.ownerEmail] : [] 
        },
        openingBalanceNarration: account.openingBalanceNarration ?? "",
    },
  });
  
  const accountType = form.watch("accountType");
  const isSpecial = form.watch("isSpecial");

  // ✅ FIX: Use Email as ID (Matches Create Dialog Logic)
  const usersForAccessControl = useMemo(() => {
    if (!company) return [];

    const ownerUser = {
        id: company.ownerEmail, // Use Email as ID
        email: company.ownerEmail,
        name: "Owner",
        photoURL: null,
        role: 'owner' as const
    };

    const sharedUsers = (company.sharedWith || []).map(u => ({
        id: u.email, // Use Email as ID
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

  const handleGroupCreated = (newGroupId: string) => {
    form.setValue('groupId', newGroupId);
    setTimeout(() => setIsCreateGroupOpen(false), 50);
  };

  useEffect(() => {
    if (!isOpen || !companyId) return;
    // Static/local: voucher hook cache — Firestore listener se pehle (CreateBankAccountDialog jaisa offline-safe)
    if (isLocalOnlyMode()) {
      setGroups((processedAccountGroups as AccountGroup[]) || []);
      return;
    }
    const q = query(collection(firestore, `companies/${companyId}/account_groups`));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const fetchedGroups = querySnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as AccountGroup)
        );
        setGroups(fetchedGroups);
      },
      (error) => {
        console.error("Error fetching groups:", error);
        const fb = (processedAccountGroupsRef.current || []) as AccountGroup[];
        if (fb.length > 0) setGroups(fb);
      }
    );
    return () => unsubscribe();
  }, [isOpen, companyId, processedAccountGroups]);

  useEffect(() => {
    if (isOpen) {
      const dateValue = (account as any).openingBalanceDate;
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
        accountName: account.accountName,
        accountType: account.accountType,
        openingBalance: account.openingBalance,
        openingBalanceDate: finalDate,
        bankName: account.bankName || "",
        accountNumber: account.accountNumber || "",
        ifscCode: account.ifscCode || "",
        groupId: normalizeBankAccountEditGroupId(account.groupId),
        isSpecial: account.isSpecial || false,
        useFor: account.useFor || { 
            in: company?.ownerEmail ? [company.ownerEmail] : [], 
            out: company?.ownerEmail ? [company.ownerEmail] : [] 
        },
        openingBalanceNarration: account.openingBalanceNarration ?? "",
      });
      setFile(account.fileUrl || null);
      setDocSlots(account.documentFileUrls || []);
    }
  }, [isOpen, account, form, company]); // added company dep

  async function onSubmit(values: FormValues): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }

    const toastId = sonnerToast.loading("Updating account...");
    const isLocalGuestUser = user?.uid === "local_guest_user";
    const backupSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1";
    try {
      let fileUrl: string | null = typeof file === "string" ? file : null;
      const newDocFiles = docSlots.filter((x): x is File => x instanceof File);
      const keptDocUrls = docSlots.filter((x): x is string => typeof x === "string");
      const totalBytes =
        (file instanceof File ? file.size : 0) + newDocFiles.reduce((s, f) => s + f.size, 0);
      if (totalBytes > 0 && companyId) {
        const limitCheck = await checkStorageLimit(
          companyId,
          company?.planId,
          { attachmentsBytes: totalBytes, storageBytes: totalBytes },
          company?.storageOption
        );
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          return;
        }
      }

      if (file instanceof File && companyId && canAddAvatar) {
        const st = await stageEntityAvatarAndDocuments({
          companyId,
          collectionSeg: "bank_accounts",
          entityId: account.id,
          avatarFile: file,
          documentFiles: [],
        });
        if (st.fileUrl) fileUrl = st.fileUrl;
      }

      let documentFileUrls = [...keptDocUrls];
      if (newDocFiles.length > 0 && companyId && canAttachDocuments) {
        const st2 = await stageEntityAvatarAndDocuments({
          companyId,
          collectionSeg: "bank_accounts",
          entityId: account.id,
          avatarFile: null,
          documentFiles: newDocFiles,
        });
        documentFileUrls = [...documentFileUrls, ...st2.documentFileUrls];
      }

      const oldOpeningBalance = account.openingBalance || 0;
      const newOpeningBalance = values.openingBalance || 0;
      const narrationClean = values.openingBalanceNarration?.trim() || null;

      /** Firestore `undefined` field skip / local mirror — explicit payload (EditExpenseAccountDialog jaisa) */
      const updatePayload: Record<string, unknown> = {
        accountName: values.accountName,
        accountType: values.accountType,
        bankName: values.bankName ?? "",
        accountNumber: values.accountNumber ?? "",
        ifscCode: values.ifscCode ?? "",
        openingBalance: newOpeningBalance,
        openingBalanceDate: values.openingBalanceDate ?? null,
        openingBalanceNarration: narrationClean,
        groupId: values.groupId || null,
        isSpecial: values.isSpecial,
        useFor: values.useFor ?? { in: [], out: [] },
        fileUrl,
        documentFileUrls: documentFileUrls.length ? documentFileUrls : [],
      };

      // Static / local company: IndexedDB + outbox — `updateDoc` network par fail hota tha
      if (isLocalOnlyMode()) {
        const fromDb = await getCompanyDocFromBrowserDb(companyId, "bank_accounts", account.id);
        const base: Record<string, unknown> = fromDb ?? {
          id: account.id,
          companyId,
          balance: account.balance,
          debit: account.debit,
          credit: account.credit,
          isDeleted: false,
          ownerId: account.ownerId,
        };
        const payload: Record<string, unknown> = { ...base, ...updatePayload, id: account.id, companyId };
        await upsertCompanyDocInBrowserDb(companyId, "bank_accounts", account.id, payload);
        await enqueueCompanyDocOutbox(companyId, "bank_accounts", "update", account.id, payload);
        const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
        sonnerToast.success(showSyncHint ? "Updated. Will sync when online." : "Account Updated!", {
          id: toastId,
          description: showSyncHint ? `"${values.accountName}" saved locally.` : `"${values.accountName}" has been successfully updated.`,
        });
        setIsOpen(false);
        onAccountUpdated({
          id: account.id,
          ...values,
          fileUrl: fileUrl || "",
          documentFileUrls,
          openingBalanceNarration: values.openingBalanceNarration?.trim() || "",
          useFor: {
            in: values.useFor?.in || [],
            out: values.useFor?.out || [],
          } as { in: string[]; out: string[] },
        });
        return;
      }

      if (totalBytes > 0 && companyId) {
        await incrementCompanyStorage(companyId, {
          attachmentsBytes: totalBytes,
          storageBytes: totalBytes,
        });
      }

      const accountRef = doc(firestore, `companies/${companyId}/bank_accounts`, account.id);
      await updateDoc(accountRef, updatePayload);

      // Automatically balance opening balance change with Capital Account
      if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, "bank_accounts", account.id, oldOpeningBalance, newOpeningBalance);
      }

      sonnerToast.success("Account Updated!", { id: toastId, description: `"${values.accountName}" has been successfully updated.` });
      setIsOpen(false);
      onAccountUpdated({
        id: account.id,
        ...values,
        fileUrl: fileUrl || "",
        documentFileUrls,
        openingBalanceNarration: values.openingBalanceNarration?.trim() || "",
        useFor: {
          in: values.useFor?.in || [],
          out: values.useFor?.out || [],
        } as { in: string[]; out: string[] },
      });
    } catch (error) {
      console.error("Error updating account:", error);
      sonnerToast.error("Error Updating Account", {
        id: toastId,
        description: error instanceof Error ? error.message : "An error occurred. Please try again.",
      });
    }
  }

  const handleDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasTransactions) {
      sonnerToast.error("Cannot Delete", { description: "This account has transactions and cannot be deleted." });
      setIsDeleteDialogOpen(false);
      return;
    }
    
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/bank_accounts`, account.id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
        });
        toast({ title: "Account Moved to Bin", description: `"${account.accountName}" has been moved to the recycle bin.`});
        onAccountDeleted(account.id);
        setIsOpen(false);
        setIsDeleteDialogOpen(false);
    } catch (error) {
        console.error("Error deleting account: ", error);
        toast({
            variant: "destructive",
            title: "Delete Failed",
            description: "An error occurred while deleting the account.",
        });
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow changing profile photo." });
      return;
    }
    const inputFile = e.target.files[0];
    if (!isProfileAvatarImageFile(inputFile)) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Image only", description: "Profile photo: JPG, PNG, WebP, etc." });
      return;
    }

    if (inputFile.size > MAX_IMAGE_BYTES_BEFORE_COMPRESS) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Please select a file smaller than ${MAX_IMAGE_MB_BEFORE_COMPRESS}MB to compress.`,
      });
      e.target.value = "";
      return;
    }

    try {
      const compressedFile = await compressFile(inputFile);
      if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File Too Large After Compression",
          description: `Even after compression, the file is larger than ${MAX_FILE_SIZE_MB}MB.`,
        });
        e.target.value = "";
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
    e.target.value = "";
  };

  const handleDocsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!canAttachDocuments) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow documents." });
      return;
    }
    const incoming = Array.from(e.target.files).filter(isProfileDocumentFile);
    setDocSlots((prev) => [...prev, ...incoming].slice(0, 5));
    e.target.value = "";
  };

  const removeAvatar = () => {
    setFile(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const removeDocAt = (idx: number) => {
    setDocSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  // Create dialog ke saath: synthetic Ungrouped row; `ungrouped_account` doc list se isAutoUngrouped filter se nahi aata
  const accountGroupOptions = useMemo(
    () => [
      { value: getUngroupedGroupId("bank"), label: "Ungrouped" },
      ...groups
        .filter(
          (g) =>
            !(g as any).isSystemReserved && (g as any).isAutoUngrouped !== true
        )
        .map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups]
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {isOpen && <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" />}
        <DialogContent
            className={cnStaticMobileFullscreenDialog(isMobile, "sm:max-w-2xl z-50", staticMobileFullscreen && "flex flex-col")}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>Update the details for {account.accountName}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className={cn(
                "space-y-4 py-4 overflow-y-auto pr-2",
                staticMobileFullscreen ? "min-h-0 flex-1 max-h-none" : "max-h-[70vh]"
              )}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                    control={form.control}
                    name="accountName"
                    render={({ field }: any) => (
                        <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Primary Savings" {...field} />
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
                            defaultValue={field.value}
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
                    <FormItem className="flex flex-col space-y-1 w-full">
                      <FormLabel>Group (Optional)</FormLabel>
                      <FormControl>
                        <div className="w-full">
                           <Combobox
                              options={accountGroupOptions}
                              value={field.value}
                              onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreateGroupOpen(true);
                                    setTimeout(() => {
                                      document.dispatchEvent(new CustomEvent('prefill-create-account-group-name', { detail: newName }));
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
              </div>
               <div className="grid grid-cols-2 gap-4">
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
                                      <Input placeholder="e.g., State Bank of India" {...field} />
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
                                useFor={(form.watch('useFor') as { in: string[]; out: string[] }) || { in: [], out: [] }}
                                onUseForChange={(newUseFor) => form.setValue('useFor', newUseFor)}
                            />
                        </CardContent>
                      </Card>
                )}
                
                <FormItem>
                  <FormLabel>Profile photo</FormLabel>
                  {!canAddAvatar ? (
                    <p className="text-xs text-muted-foreground">
                      Upgrade plan to change profile photo.{" "}
                      <Link href="/billing" className="text-primary underline font-medium hover:no-underline">
                        Upgrade
                      </Link>
                    </p>
                  ) : (
                    <div className="flex items-center gap-4 flex-wrap">
                      {file ? <FilePreview file={file} onRemove={removeAvatar} /> : null}
                      {!file ? (
                        <FormControl>
                          <div
                            className="relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center text-muted-foreground hover:border-primary transition-colors cursor-pointer"
                            onClick={() => avatarInputRef.current?.click()}
                          >
                            <Upload className="h-6 w-6" />
                            <span className="text-xs mt-1 text-center px-1">Add photo</span>
                            <Input
                              type="file"
                              className="hidden"
                              ref={avatarInputRef}
                              onChange={handleAvatarChange}
                              accept="image/*"
                            />
                          </div>
                        </FormControl>
                      ) : null}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">Images only — shown on profile / avatar.</p>
                </FormItem>

                <FormItem>
                  <FormLabel>Documents</FormLabel>
                  <p className="mb-1 text-xs leading-snug text-muted-foreground">
                    Optional supporting files (PDF or images). Up to 5 files; stored with this account and shown on the statement opening row (File column).
                  </p>
                  {!canAttachDocuments ? (
                    <p className="text-xs text-muted-foreground">
                      Upgrade for PDF/image attachments.{" "}
                      <Link href="/billing" className="text-primary underline font-medium hover:no-underline">
                        Upgrade
                      </Link>
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-start gap-2">{/* add slot inline with FilePreviews */}
                      {docSlots.map((slot, idx) => (
                        <FilePreview
                          key={typeof slot === "string" ? `${slot}-${idx}` : `${slot.name}-${idx}-${slot.size}`}
                          file={slot}
                          onRemove={() => removeDocAt(idx)}
                          size={96}
                        />
                      ))}
                      {docSlots.length < 5 ? (
                        <FormControl>
                          <div
                            className="relative h-24 w-24 shrink-0 border-2 border-dashed rounded-lg flex flex-col justify-center items-center text-muted-foreground hover:border-primary transition-colors cursor-pointer"
                            onClick={() => docsInputRef.current?.click()}
                          >
                            <Upload className="h-6 w-6" />
                            <span className="text-xs mt-1 text-center px-1">PDF / image</span>
                            <Input
                              type="file"
                              className="hidden"
                              ref={docsInputRef}
                              onChange={handleDocsChange}
                              accept="image/*,application/pdf"
                              multiple
                            />
                          </div>
                        </FormControl>
                      ) : null}
                    </div>
                  )}
                </FormItem>

                <EntityOpeningBalanceNarrationField
                  control={form.control}
                  name="openingBalanceNarration"
                  detailLabel="bank/cash account"
                />

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
                        <p>Cannot delete an account with existing transactions.</p>
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
                    This action will move the account <span className="font-semibold text-foreground">{account.accountName}</span> to the recycle bin.
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
      <CreateAccountGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

    

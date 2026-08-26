
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  uploadEntityAvatarAndDocumentsRemote,
  syncEntityAttachmentsAfterSave,
  isProfileAvatarImageFile,
  isProfileDocumentFile,
} from "@/lib/entityProfileLocalFiles";
import {
  captureEntityFormAttachmentBaseline,
  finalizeFormAttachmentEditAfterSave,
} from "@/lib/formAttachmentEditHelper";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb, listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { attachmentLockFieldsForFinalUrls, readLockedPdfFileUrlsFromRow } from "@/lib/attachmentPdfOptions";
import {
  EntityProfilePhotoBlock,
  EntityDocumentsBlock,
  EntityOpeningBalanceNarrationField,
} from "@/components/common/EntityProfileDocumentsNarrationFields";
import { compressFile } from "@/lib/compression";
import { compressImageForCompany, attachmentImageStillTooLargeToastFields, useImageCompressionProcessing } from "@/lib/attachmentCompressionUi";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, query, collection } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  MasterFormNameAcNoRow,
  MasterFormTwoColGrid,
  MasterMobileNoField,
} from "@/components/inter-company/MasterFormLayout";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import {
  MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS,
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { useCompany } from "@/hooks/useCompany";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import { CreateExpenseGroupDialog } from "./CreateExpenseGroupDialog";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  cnMasterEntityDialogContent,
  masterEntityDialogHeaderClassName,
  masterEntityDialogFormWrapperClassName,
} from "@/lib/masterEntityDialogClasses";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { toast as sonnerToast } from "sonner";
import { getUngroupedGroupId } from "@/lib/ungrouped-groups";
import {
  apkCloudEntityMasterReadFromSqliteMirror,
  apkCloudCompanyOfflineViewOnly,
  apkEntityWriteUsesLocalSqliteMirror,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { useVouchers } from "@/hooks/useVouchers";
import { useLiveEntityDocAttachments } from "@/hooks/useLiveEntityDocAttachments";

/** CreateExpenseAccountDialog jaisa: Ungrouped bucket → form value `ungrouped_expense`. */
function normalizeExpenseAccountEditGroupId(groupId: string | null | undefined): string {
  const u = getUngroupedGroupId("expense");
  if (!groupId || groupId === u) return u;
  return groupId;
}

const formSchema = z.object({
  name: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  phone: z.string().optional(),
  groupId: z.string().optional(),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
  openingBalanceNarration: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

export function EditExpenseAccountDialog({ account, onAccountUpdated, onAccountDeleted, children, hasTransactions }: {
  account: ExpenseAccount;
  onAccountUpdated: (updated?: Partial<ExpenseAccount>) => void;
  onAccountDeleted: (id: string) => void;
  children: React.ReactNode;
  hasTransactions: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const isCompressing = useImageCompressionProcessing();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const { companyId, company } = useCompany();
  const { user } = useAuth();
  const { canAddAvatar, canAddFileImagePdf, can } = usePermissions();
  const isMobile = useIsMobile();
  const canAttachDocuments = canAddFileImagePdf || canAddAvatar;
  const { processedExpenseGroups } = useVouchers();
  const processedExpenseGroupsRef = useRef(processedExpenseGroups);
  processedExpenseGroupsRef.current = processedExpenseGroups;
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { dateSystem } = useDate();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | string | null>(account.fileUrl || null);
  const [docSlots, setDocSlots] = useState<Array<File | string>>(() => account.documentFileUrls || []);
  const initialFileRef = useRef<string | null>(account.fileUrl || null);
  const initialDocUrlsRef = useRef<string[]>(account.documentFileUrls || []);


  /** Pure-local=outbox lane; APK cloud lists SQLite mirror (`apkCloudEntityMasterReadFromSqliteMirror`). */
  const localSqlMirror = useMemo(() => apkEntityWriteUsesLocalSqliteMirror(company), [company]);
  const sqliteListsOnlyNoSnapshot = useMemo(
    () => localSqlMirror || apkCloudEntityMasterReadFromSqliteMirror(company),
    [localSqlMirror, company]
  );

  const navigatorOnline = useNavigatorOnline();
  /** APK + Firestore company offline: voucher jaisa Save / Move-to-Bin disable (pure-local exempt). */
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );
  const attachmentsDirty =
    file instanceof File ||
    docSlots.some((x) => x instanceof File) ||
    (typeof file === "string" ? file : null) !== initialFileRef.current ||
    JSON.stringify(docSlots.filter((x): x is string => typeof x === "string")) !==
      JSON.stringify(initialDocUrlsRef.current);
  const onLiveAttachmentFields = useCallback(
    (fields: { fileUrl?: string | null; documentFileUrls?: string[] }) => {
      if (fields.fileUrl !== undefined) {
        const nextFile = fields.fileUrl || null;
        setFile(nextFile);
        initialFileRef.current = nextFile;
      }
      if (fields.documentFileUrls) {
        setDocSlots(fields.documentFileUrls);
        initialDocUrlsRef.current = fields.documentFileUrls;
      }
    },
    []
  );
  useLiveEntityDocAttachments({
    enabled: isOpen,
    companyId,
    collection: "expense_accounts",
    entityId: account.id,
    attachmentsDirty,
    preferSqliteMirror: sqliteListsOnlyNoSnapshot,
    onFields: onLiveAttachmentFields,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: account.name,
      phone: account.phone ?? "",
      groupId: normalizeExpenseAccountEditGroupId(account.groupId),
      openingBalance: account.openingBalance || 0,
      openingBalanceDate: (account as any).openingBalanceDate?.toDate ? (account as any).openingBalanceDate.toDate() : undefined,
      openingBalanceNarration: account.openingBalanceNarration ?? "",
    },
  });

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
        name: account.name,
        phone: account.phone ?? "",
        groupId: normalizeExpenseAccountEditGroupId(account.groupId),
        openingBalance: account.openingBalance || 0,
        openingBalanceDate: finalDate,
        openingBalanceNarration: account.openingBalanceNarration ?? "",
      });
      setFile(account.fileUrl || null);
      setDocSlots(account.documentFileUrls || []);
      initialFileRef.current = account.fileUrl || null;
      initialDocUrlsRef.current = account.documentFileUrls || [];
    }
  }, [isOpen, account, form]);
  
  useEffect(() => {
    if (!companyId || !isOpen) return;
    let cancelled = false;

    const seedFb = () => {
      const fb = (processedExpenseGroupsRef.current || []) as ExpenseGroup[];
      if (fb.length) setGroups(fb);
    };

    if (sqliteListsOnlyNoSnapshot) {
      seedFb();
      void (async () => {
        try {
          const rows = await listCompanyDocsFromBrowserDb(companyId, "expense_groups");
          if (cancelled) return;
          const mapped = rows.map(
            (r: Record<string, unknown> & { id: string }) => ({ ...r, id: r.id } as ExpenseGroup)
          );
          if (mapped.length) setGroups(mapped);
        } catch (e) {
          console.warn("[EditExpenseAccountDialog] expense_groups mirror failed", e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const q = query(collection(firestore, `companies/${companyId}/expense_groups`));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setGroups(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ExpenseGroup)));
      },
      (error) => {
        console.error("Error fetching expense groups:", error);
        const fb = (processedExpenseGroupsRef.current || []) as ExpenseGroup[];
        if (fb.length > 0) setGroups(fb);
      }
    );
    return () => unsubscribe();
  }, [companyId, isOpen, sqliteListsOnlyNoSnapshot]);

  function onSubmit(values: z.infer<typeof formSchema>): void {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      return;
    }

    const fileSnap = file;
    const docSlotsSnap = docSlots;
    const accountRefSnap = account;
    const attachmentBaselineSnap = captureEntityFormAttachmentBaseline({
      fileUrl: initialFileRef.current,
      documentFileUrls: initialDocUrlsRef.current,
    });

    setIsOpen(false); // Master edit: backdrop hat turant; save async

    void (async () => {
      const toastId = sonnerToast.loading("Updating expense account...");
      const isLocalGuestUser = user?.uid === "local_guest_user";
      const backupSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1";
      setIsLoading(true);
      try {
        const { prepareMasterEditAttachmentsForSave } = await import(
          "@/lib/attachmentRecompressOnSave"
        );
        const prepared = await prepareMasterEditAttachmentsForSave({
          companyId,
          avatar: fileSnap,
          documents: docSlotsSnap,
        });
        let fileUrl: string | null = typeof prepared.avatar === "string" ? prepared.avatar : null;
        const newDocFiles = prepared.newDocFiles;
        const keptDocUrls = prepared.keptDocUrls;
        const totalBytes =
          (prepared.avatar instanceof File ? prepared.avatar.size : 0) +
          newDocFiles.reduce((s, f) => s + f.size, 0);
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

        const needAvatarUpload = prepared.avatar instanceof File && canAddAvatar;
        const needNewDocsUpload = newDocFiles.length > 0 && canAttachDocuments;
        let documentFileUrls = [...keptDocUrls];
        if (companyId && (needAvatarUpload || needNewDocsUpload)) {
          const st = await uploadEntityAvatarAndDocumentsRemote({
            companyId,
            collectionSeg: "expense_accounts",
            entityId: accountRefSnap.id,
            avatarFile: needAvatarUpload ? (prepared.avatar as File) : null,
            documentFiles: needNewDocsUpload ? newDocFiles : [],
          });
          if (st.fileUrl) fileUrl = st.fileUrl;
          documentFileUrls = [...keptDocUrls, ...st.documentFileUrls];
        }

        const oldOpeningBalance = accountRefSnap.openingBalance || 0;
        const newOpeningBalance = values.openingBalance || 0;
        const narrationClean = values.openingBalanceNarration?.trim() || null;
        const updatePayload = {
          name: values.name,
          phone: values.phone?.trim() || null,
          groupId: values.groupId || null,
          openingBalance: newOpeningBalance,
          openingBalanceDate: values.openingBalanceDate || null,
          openingBalanceNarration: narrationClean,
          fileUrl,
          documentFileUrls: documentFileUrls.length ? documentFileUrls : [],
          ...attachmentLockFieldsForFinalUrls(documentFileUrls, {
            existingLockedPdfFileUrls: readLockedPdfFileUrlsFromRow(
              account as unknown as Record<string, unknown>
            ),
            canUnlockLockedPdf: can("unlock_locked_pdf"),
          }),
        };

        if (localSqlMirror) {
          const fromDb = await getCompanyDocFromBrowserDb(companyId, "expense_accounts", accountRefSnap.id);
          const base: Record<string, unknown> = fromDb ?? {
            id: accountRefSnap.id,
            companyId,
            balance: accountRefSnap.balance,
            debit: accountRefSnap.debit,
            credit: accountRefSnap.credit,
            isDeleted: false,
            type: accountRefSnap.type,
          };
          const payload: Record<string, unknown> = { ...base, ...updatePayload, id: accountRefSnap.id, companyId };
          await upsertCompanyDocInBrowserDb(companyId, "expense_accounts", accountRefSnap.id, payload);
          await enqueueCompanyDocOutbox(companyId, "expense_accounts", "update", accountRefSnap.id, payload);
          await syncEntityAttachmentsAfterSave(companyId);
          const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
          setFile(fileUrl || null);
          setDocSlots(documentFileUrls);
          initialFileRef.current = fileUrl || null;
          initialDocUrlsRef.current = documentFileUrls;
          finalizeFormAttachmentEditAfterSave({
            companyId,
            baselineUrls: attachmentBaselineSnap,
            finalUrls: captureEntityFormAttachmentBaseline({ fileUrl, documentFileUrls }),
            oldDocRemoteUrls: attachmentBaselineSnap.filter((u) => /^https?:\/\//i.test(u)),
          });
          onAccountUpdated({
            id: accountRefSnap.id,
            ...values,
            fileUrl: fileUrl || "",
          });
          sonnerToast.success(showSyncHint ? "Updated. Will sync when online." : "Account Updated!", {
            id: toastId,
            description: showSyncHint ? `"${values.name}" saved locally.` : `"${values.name}" has been successfully updated.`,
          });
          return;
        }

        if (totalBytes > 0 && companyId) {
          await incrementCompanyStorage(companyId, {
            attachmentsBytes: totalBytes,
            storageBytes: totalBytes,
          });
        }

        const accountRef = doc(firestore, `companies/${companyId}/expense_accounts`, accountRefSnap.id);
        await updateDoc(accountRef, updatePayload);

        if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
          const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
          await balanceOpeningBalanceWithCapital(companyId, "expense_accounts", accountRefSnap.id, oldOpeningBalance, newOpeningBalance);
        }

        await syncEntityAttachmentsAfterSave(companyId);
        setFile(fileUrl || null);
        setDocSlots(documentFileUrls);
        initialFileRef.current = fileUrl || null;
        initialDocUrlsRef.current = documentFileUrls;
        finalizeFormAttachmentEditAfterSave({
          companyId,
          baselineUrls: attachmentBaselineSnap,
          finalUrls: captureEntityFormAttachmentBaseline({ fileUrl, documentFileUrls }),
          oldDocRemoteUrls: attachmentBaselineSnap.filter((u) => /^https?:\/\//i.test(u)),
        });
        onAccountUpdated({
          id: accountRefSnap.id,
          ...values,
          fileUrl: fileUrl || "",
        });
        sonnerToast.success("Account Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      } catch (error) {
        console.error("Error updating account:", error);
        sonnerToast.error("Error Updating Account", {
          id: toastId,
          description: error instanceof Error ? error.message : "An error occurred. Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
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
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/expense_accounts`, account.id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
        });
        toast({ title: "Account Moved to Bin", description: `"${account.name}" has been moved to the recycle bin.`});
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
  
  const handleGroupCreated = (newGroupId: string) => {
    form.setValue("groupId", newGroupId);
    setIsCreateGroupOpen(false);
  };

  // CreateExpenseAccountDialog ke saath: Ungrouped synthetic row + isAutoUngrouped hatao + parent labels
  const allGroupOptions = useMemo(() => {
    const getParentLabel = (parentId?: string) => {
      if (parentId === "income" || parentId === "direct_income" || parentId === "indirect_income") return "Income";
      if (parentId === "expenses" || parentId === "direct_expense" || parentId === "indirect_expense") return "Expenses";
      return "";
    };
    return [
      { value: getUngroupedGroupId("expense"), label: "Ungrouped" },
      ...groups
        .filter((g) => (g as any).isReportOnly !== true)
        .filter((g) => (g as any).isAutoUngrouped !== true)
        .map((g: any) => {
          const parent = getParentLabel(g.parentId);
          return { value: g.id, label: parent ? `${parent} / ${g.name}` : g.name };
        }),
    ];
  }, [groups]);

  const removeAvatar = () => {
    setFile(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
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

  const removeDocAt = (idx: number) => setDocSlots((p) => p.filter((_, i) => i !== idx));

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    if (!canAddAvatar) {
      e.target.value = "";
      toast({ variant: "destructive", title: "Not allowed", description: "Your plan does not allow a profile photo." });
      return;
    }
    const inputFile = e.target.files[0];
    if (!inputFile || !isProfileAvatarImageFile(inputFile)) {
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
      const { file: compressedFile, maxBytes, maxKb } = await compressImageForCompany(inputFile, companyId);
      
      setFile(compressedFile);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "File Error", description: "Could not process the file." });
    }
    e.target.value = "";
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        {isOpen && <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" />}
        <DialogContent 
            className={cn(cnMasterEntityDialogContent(isMobile), "sm:max-w-2xl")}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader className={masterEntityDialogHeaderClassName}>
            <DialogTitle>Edit Expense Account</DialogTitle>
            <DialogDescription>Update the details for {account.name}.</DialogDescription>
          </DialogHeader>
          <div className={masterEntityDialogFormWrapperClassName}>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                e.stopPropagation();
                void form.handleSubmit(onSubmit)(e);
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
            <div className="pl-master-form-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 sm:pr-2">
              <MasterFormNameAcNoRow
                entityKind="expense"
                entityId={account.id}
                mode="edit"
                nameField={
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }: any) => (
                      <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Office Rent" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                }
              />
              <MasterFormTwoColGrid>
                <MasterMobileNoField control={form.control} />
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Group (Optional)</FormLabel>
                      <Combobox
                        options={allGroupOptions}
                        value={field.value}
                        onChange={(value, newName) => {
                          if (value === "add-new") {
                            setIsCreateGroupOpen(true);
                            setTimeout(() => {
                              document.dispatchEvent(
                                new CustomEvent("prefill-create-expense-group-name", { detail: newName })
                              );
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
              </MasterFormTwoColGrid>
              <MasterFormTwoColGrid>
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
                              <BsDatePicker isRange={false} valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} />
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
              </MasterFormTwoColGrid>

              <EntityProfilePhotoBlock
                file={file}
                onPickClick={() => avatarInputRef.current?.click()}
                fileInputRef={avatarInputRef}
                onAvatarChange={handleAvatarChange}
                onRemoveAvatar={removeAvatar}
                canAddAvatar={canAddAvatar}
                inputId="edit-expense-avatar"
                attachmentCompanyId={companyId ?? undefined}
                attachmentReusePlaceKey={account.id ? `expense_accounts/${account.id}` : null}
              />
              <EntityDocumentsBlock
                attachmentReusePlaceKey={account.id ? `expense_accounts/${account.id}` : null}
                docSlots={docSlots}
                setDocSlots={setDocSlots}
                onRemoveDoc={removeDocAt}
                onAddClick={() => docsInputRef.current?.click()}
                docsInputRef={docsInputRef}
                onDocsChange={handleDocsChange}
                canAttachDocuments={canAttachDocuments}
                attachmentCompanyId={companyId ?? undefined}
                entityStatementLabel="income/expense account"
                inputId="edit-expense-docs"
                existingLockedPdfFileUrls={readLockedPdfFileUrlsFromRow(
                  account as unknown as Record<string, unknown>
                )}
              />
              <EntityOpeningBalanceNarrationField
                control={form.control}
                name="openingBalanceNarration"
                detailLabel="income/expense account"
              />
            </div>
              <DialogFooter className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}>
                    Cancel
                  </Button>
                </DialogClose>
                <div className="flex min-w-0 flex-1 justify-center px-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex max-w-full min-w-0 shrink" tabIndex={0}>
                          <Button
                            type="button"
                            variant="destructive"
                            className="shrink-0 px-3 sm:px-4"
                            onClick={() => setIsDeleteDialogOpen(true)}
                            disabled={hasTransactions || apkOfflineViewOnly}
                          >
                            <Trash2 className="mr-2 h-4 w-4 shrink-0" /> Move to Bin
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!hasTransactions && apkOfflineViewOnly && (
                        <TooltipContent>
                          <p>Offline — view only.</p>
                        </TooltipContent>
                      )}
                      {hasTransactions && (
                        <TooltipContent>
                          <p>Cannot delete an account with existing transactions.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button type="submit" disabled={isLoading || isCompressing || apkOfflineViewOnly} className="shrink-0">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
          </div>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action will move the account <span className="font-semibold text-foreground">{account.name}</span> to the recycle bin.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel className={MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={apkOfflineViewOnly} className="bg-destructive hover:bg-destructive/90">
                    Move to Bin
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreateExpenseGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups}/>
    </>
  );
}

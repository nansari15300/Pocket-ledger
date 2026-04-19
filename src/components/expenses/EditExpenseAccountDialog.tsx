
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, CalendarIcon } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { stageEntityAvatarAndDocuments, isProfileAvatarImageFile, isProfileDocumentFile } from "@/lib/entityProfileLocalFiles";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import {
  EntityProfilePhotoBlock,
  EntityDocumentsBlock,
  EntityOpeningBalanceNarrationField,
} from "@/components/common/EntityProfileDocumentsNarrationFields";
import { compressFile } from "@/lib/compression";
import { MAX_IMAGE_BYTES_BEFORE_COMPRESS, MAX_IMAGE_MB_BEFORE_COMPRESS } from "@/lib/fileUploadLimits";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { doc, updateDoc, serverTimestamp, onSnapshot, query, collection } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import { CreateExpenseGroupDialog } from "./CreateExpenseGroupDialog";
import { Combobox } from "../ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useDate } from "@/hooks/useDate";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { toast as sonnerToast } from "sonner";
import { getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { isLocalOnlyMode } from "@/lib/localMode";
import { useVouchers } from "@/hooks/useVouchers";

/** CreateExpenseAccountDialog jaisa: Ungrouped bucket → form value `ungrouped_expense`. */
function normalizeExpenseAccountEditGroupId(groupId: string | null | undefined): string {
  const u = getUngroupedGroupId("expense");
  if (!groupId || groupId === u) return u;
  return groupId;
}

const formSchema = z.object({
  name: z.string().min(2, { message: "Account name must be at least 2 characters." }),
  groupId: z.string().optional(),
  openingBalance: z.coerce.number(),
  openingBalanceDate: z.date().optional(),
  openingBalanceNarration: z.string().optional(),
});

const MAX_FILE_SIZE_MB = 0.5;

export function EditExpenseAccountDialog({ account, onAccountUpdated, onAccountDeleted, children, hasTransactions }: {
  account: ExpenseAccount;
  onAccountUpdated: () => void;
  onAccountDeleted: (id: string) => void;
  children: React.ReactNode;
  hasTransactions: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const { companyId, company } = useCompany();
  const { user } = useAuth();
  const { canAddAvatar, canAddFileImagePdf } = usePermissions();
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


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: {
      name: account.name,
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
        groupId: normalizeExpenseAccountEditGroupId(account.groupId),
        openingBalance: account.openingBalance || 0,
        openingBalanceDate: finalDate,
        openingBalanceNarration: account.openingBalanceNarration ?? "",
      });
      setFile(account.fileUrl || null);
      setDocSlots(account.documentFileUrls || []);
    }
  }, [isOpen, account, form]);
  
  useEffect(() => {
    if (!companyId || !isOpen) return;
    if (isLocalOnlyMode()) {
      setGroups((processedExpenseGroups as ExpenseGroup[]) || []);
      return;
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
  }, [companyId, isOpen, processedExpenseGroups]);

  async function onSubmit(values: z.infer<typeof formSchema>): Promise<void> {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }

    const toastId = sonnerToast.loading("Updating expense account...");
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
          collectionSeg: "expense_accounts",
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
          collectionSeg: "expense_accounts",
          entityId: account.id,
          avatarFile: null,
          documentFiles: newDocFiles,
        });
        documentFileUrls = [...documentFileUrls, ...st2.documentFileUrls];
      }

      const oldOpeningBalance = account.openingBalance || 0;
      const newOpeningBalance = values.openingBalance || 0;
      const narrationClean = values.openingBalanceNarration?.trim() || null;
      const updatePayload = {
        name: values.name,
        groupId: values.groupId || null,
        openingBalance: newOpeningBalance,
        openingBalanceDate: values.openingBalanceDate || null,
        openingBalanceNarration: narrationClean,
        fileUrl,
        documentFileUrls: documentFileUrls.length ? documentFileUrls : [],
      };

      if (isLocalOnlyMode()) {
        const fromDb = await getCompanyDocFromBrowserDb(companyId, "expense_accounts", account.id);
        const base: Record<string, unknown> = fromDb ?? {
          id: account.id,
          companyId,
          balance: account.balance,
          debit: account.debit,
          credit: account.credit,
          isDeleted: false,
          type: account.type,
        };
        const payload: Record<string, unknown> = { ...base, ...updatePayload, id: account.id, companyId };
        await upsertCompanyDocInBrowserDb(companyId, "expense_accounts", account.id, payload);
        await enqueueCompanyDocOutbox(companyId, "expense_accounts", "update", account.id, payload);
        const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
        sonnerToast.success(showSyncHint ? "Updated. Will sync when online." : "Account Updated!", {
          id: toastId,
          description: showSyncHint ? `"${values.name}" saved locally.` : `"${values.name}" has been successfully updated.`,
        });
        setIsOpen(false);
        onAccountUpdated();
        return;
      }

      if (totalBytes > 0 && companyId) {
        await incrementCompanyStorage(companyId, {
          attachmentsBytes: totalBytes,
          storageBytes: totalBytes,
        });
      }

      const accountRef = doc(firestore, `companies/${companyId}/expense_accounts`, account.id);
      await updateDoc(accountRef, updatePayload);

      if (Math.abs(newOpeningBalance - oldOpeningBalance) > 0.01) {
        const { balanceOpeningBalanceWithCapital } = await import("@/lib/voucherActionsClient");
        await balanceOpeningBalanceWithCapital(companyId, "expense_accounts", account.id, oldOpeningBalance, newOpeningBalance);
      }

      sonnerToast.success("Account Updated!", { id: toastId, description: `"${values.name}" has been successfully updated.` });
      setIsOpen(false);
      onAccountUpdated();
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
            className="sm:max-w-lg z-50"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
            onInteractOutside={(e) => { if (isCreateGroupOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Edit Expense Account</DialogTitle>
            <DialogDescription>Update the details for {account.name}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
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
                              document.dispatchEvent(new CustomEvent('prefill-create-expense-group-name', { detail: newName }));
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
              </div>

              <EntityProfilePhotoBlock
                file={file}
                onPickClick={() => avatarInputRef.current?.click()}
                fileInputRef={avatarInputRef}
                onAvatarChange={handleAvatarChange}
                onRemoveAvatar={removeAvatar}
                canAddAvatar={canAddAvatar}
                inputId="edit-expense-avatar"
              />
              <EntityDocumentsBlock
                docSlots={docSlots}
                onRemoveDoc={removeDocAt}
                onAddClick={() => docsInputRef.current?.click()}
                docsInputRef={docsInputRef}
                onDocsChange={handleDocsChange}
                canAttachDocuments={canAttachDocuments}
                entityStatementLabel="income/expense account"
                inputId="edit-expense-docs"
              />
              <EntityOpeningBalanceNarrationField
                control={form.control}
                name="openingBalanceNarration"
                detailLabel="income/expense account"
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
                <Button type="submit" disabled={isLoading} className="col-span-2 sm:col-span-1">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                    This action will move the account <span className="font-semibold text-foreground">{account.name}</span> to the recycle bin.
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
      <CreateExpenseGroupDialog onGroupCreated={handleGroupCreated} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups}/>
    </>
  );
}

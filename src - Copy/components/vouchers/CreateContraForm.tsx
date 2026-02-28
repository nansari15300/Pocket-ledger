
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Trash2, PlusCircle, Upload, FileText, Crown, History, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore, storage } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { format, startOfDay } from "date-fns";
import { ScrollArea } from "../ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { Account } from "@/components/bank-cash/types";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";
import { useDate } from "@/hooks/useDate";
import usePermissions from "@/hooks/usePermissions";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { toast as sonnerToast } from "sonner";
import BsDatePicker from "../ui/BsDatePicker";
import { Combobox } from "@/components/ui/combobox";
import { FilePreview } from "../vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { useVouchers } from "@/hooks/useVouchers";
import { saveVoucher, isVoucherLimitError } from "@/lib/voucherActionsClient";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { useAccountBalance } from "@/hooks/useAccountBalance";
import { useIsMobile } from "@/hooks/use-mobile";
import { hasPaymentLinks } from "@/lib/payment-allocation-utils";

const fileSchema = z.object({
  file: z.custom<File | null>().optional(),
});

const formSchema = z.object({
  fromAccountId: z.string().min(1, "Please select the source account."),
  toAccountId: z.string().min(1, "Please select the destination account."),
  date: z.date({ message: "A date is required." }),
  voucherNumber: z.string().min(1, "Voucher number is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  narration: z.string().optional(),
  files: z.array(fileSchema).optional(),
});

type ContraFormValues = z.infer<typeof formSchema>;

const getVoucherPrefix = (prefixes?: Record<string, string[]>) => (prefixes?.contra && prefixes.contra[0]) || "CNTR-";
const MAX_FILE_SIZE_MB = 0.5;


export function CreateContraForm({
  voucher,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  editingDisabled = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  onApprove,
  isApproving = false,
}: {
  voucher?: any;
  onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string) => void;
  onOpenHistory?: () => void;
  showHistoryButton?: boolean;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
}) {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { formatCurrency, formatCurrencyForPrint } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedAccounts: allProcessedAccounts } = useVouchers();
  const { company, companyId, triggerSync } = useCompany();
  const { dateSystem } = useDate();
  const { can, canPerformBackdatedAction, canEditRecord, fileAttachmentLimits, allowAttachments } = usePermissions();
  const isMobile = useIsMobile();

  const [isLoading, setIsLoading] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [targetFieldForNewAccount, setTargetFieldForNewAccount] = useState<'fromAccountId' | 'toAccountId' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<(File|string)[]>([]);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const transactionDates = useMemo(() => {
    if (!allVouchers?.length) return [];
    return allVouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [allVouchers]);

  const isEditing = !!voucher;
  const isEditingAndConverting = voucher && voucher.type !== 'contra';
  
  const form = useForm<ContraFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: voucher
      ? { ...voucher, files:[], date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date) }
      : {
          fromAccountId: "",
          toAccountId: "",
          date: startOfDay(new Date()),
          voucherNumber: "",
          amount: 0,
          narration: "",
          files: [],
        },
  });
  
  const fromAccountId = form.watch("fromAccountId");
  const toAccountId = form.watch("toAccountId");

  const { displayBalance: fromAccountBalance } = useAccountBalance(fromAccountId);
  const { displayBalance: toAccountBalance } = useAccountBalance(toAccountId);

  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.contra ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.contra ?? false;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.contra ?? false;

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const prefixes = company?.voucherPrefixes?.contra || [getVoucherPrefix(company.voucherPrefixes as Record<string, string[]> | undefined)];
    const VOUCHER_PREFIX = selectedPrefix || prefixes[0];
    
    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "contra"));
      const querySnapshot = await getDocs(q);
      const voucherNumbers = querySnapshot.docs.map(doc => doc.data().voucherNumber as string);
      
      let maxNum = 0;
      voucherNumbers.forEach(numStr => {
        if (numStr && numStr.startsWith(VOUCHER_PREFIX)) {
          const num = parseInt(numStr.replace(VOUCHER_PREFIX, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      
      const nextVoucherNumber = maxNum + 1;
      form.setValue("voucherNumber", `${VOUCHER_PREFIX}${nextVoucherNumber}`);
    } catch (error) {
      console.error("Error fetching voucher count: ", error);
    }
  }, [companyId, company, form, isAutoVoucherEnabled]);

  useEffect(() => {
    if (voucher) {
      const initialValues = { ...voucher, files:[], date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date) };
      if (isEditingAndConverting) {
          initialValues.voucherNumber = "";
      }
      form.reset(initialValues);
      setSavedVoucherId(voucher.id);
      setFiles(voucher.fileUrls || []);
    }
}, [voucher, form, isEditingAndConverting]);

  
  useEffect(() => {
    if (!savedVoucherId || isEditingAndConverting) {
      fetchVoucherNumber();
    }
  }, [savedVoucherId, fetchVoucherNumber, isEditingAndConverting, company]);

  const handleAccountCreated = (newAccountId: string) => {
    if (targetFieldForNewAccount) {
      form.setValue(targetFieldForNewAccount, newAccountId);
    }
    setTimeout(() => setIsCreateAccountOpen(false), 50);
  };
  
  const openCreateAccountDialog = (field: 'fromAccountId' | 'toAccountId', newName?: string) => {
    setTargetFieldForNewAccount(field);
    setIsCreateAccountOpen(true);
    if (newName) {
       setTimeout(() => {
        document.dispatchEvent(new CustomEvent('prefill-create-bank-account-name', { detail: newName }));
      }, 100);
    }
  };

  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
  
    onVoucherAction?.('saved', options.saveAndNew);
    
    processAndSave(form.getValues(), options.saveAndNew);
  }
  
  async function processAndSave(data: ContraFormValues, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      sonnerToast.error("Error", { description: "Login and company selection required." });
      return;
    }
    
    try {
      // Permission check: create or edit
      const isEdit = !!voucher?.id || !!savedVoucherId;
      const voucherDate = data.date instanceof Date ? data.date : new Date(data.date);
      
      if (isEdit) {
        // Check edit permission - determine ownership
        const fetchVoucher = async (cid: string, vid: string) => {
          const voucherDoc = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
          return voucherDoc.exists() ? voucherDoc.data() : null;
        };
        const isOwnRecord = await determineVoucherOwnership(voucher, savedVoucherId, allVouchers, user.uid, companyId, fetchVoucher);
        assertCanEdit(canEditRecord, isOwnRecord);
        
        // Check backdate limit for edit - use ORIGINAL voucher date, not form date
        let originalVoucherDate = voucherDate;
        if (voucher?.date) {
          originalVoucherDate = voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date);
        } else if (savedVoucherId) {
          const existingVoucher = allVouchers.find(v => v.id === savedVoucherId);
          if (existingVoucher?.date) {
            originalVoucherDate = existingVoucher.date?.toDate ? existingVoucher.date.toDate() : new Date(existingVoucher.date);
          } else if (companyId) {
            const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId));
            if (voucherDoc.exists()) {
              const voucherData = voucherDoc.data();
              originalVoucherDate = voucherData.date?.toDate ? voucherData.date.toDate() : new Date(voucherData.date);
            }
          }
        }
        assertCanPerformBackdated(canPerformBackdatedAction, "edit", originalVoucherDate);
      } else {
        // Check create permission
        assertCan(can, "create_records");
        
        // Check backdate limit for create
        assertCanPerformBackdated(canPerformBackdatedAction, "create", voucherDate);
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { description: error.message });
      } else {
        sonnerToast.error("Error", { description: "Failed to check permissions." });
      }
      return;
    }
    
    if (data.fromAccountId === data.toAccountId) {
      sonnerToast.error("Invalid Entry", { description: "Source and destination accounts cannot be the same."});
      form.setError("toAccountId", { message: "Cannot be same as source." });
      return;
    }
    
    const toastId = sonnerToast.loading("Saving contra entry...");
    setIsLoading(true);

    try {
      if (!savedVoucherId || data.voucherNumber !== voucher?.voucherNumber) {
        const q = query(
          collection(firestore, `companies/${companyId}/vouchers`),
          where("voucherNumber", "==", data.voucherNumber),
          where("type", "==", "contra")
        );
        const existingVoucherSnap = await getDocs(q);
        if (!existingVoucherSnap.empty && existingVoucherSnap.docs[0].id !== savedVoucherId) {
          sonnerToast.error("Duplicate Voucher Number", { id: toastId, description: "This voucher number is already in use." });
          setIsLoading(false);
          return;
        }
      }
      
       const {
        files: formFiles,
        date,
        // Exclude internal fields
        updatedAt,
        createdAt,
        history,
        lastEditedBy,
        changedAt,
        changedBy,
        ...restOfData
      } = data as any;

      const submissionData: any = {
        ...restOfData,
        date: date.toISOString(),
        amount: Number(restOfData.amount || 0),
        total: Number(restOfData.amount || 0),
        fileUrls: files.filter(f => typeof f === 'string') as string[],
        type: 'contra'
      };
      
      const newFilesToUpload = files.filter(f => typeof f !== 'string') as File[];
      if (newFilesToUpload.length > 0) {
        const totalNewBytes = newFilesToUpload.reduce((sum, f) => sum + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        for (const file of newFilesToUpload) {
          if (submissionData.fileUrls.length >= 3) break;
          const storageRef = ref(storage, `voucher-files/${companyId}/contra/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          submissionData.fileUrls.push(url);
          await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
        }
      }

      let originalVoucherIdToDelete: string | null = null;
      if (isEditingAndConverting && voucher.id) {
          originalVoucherIdToDelete = voucher.id;
      }
      
      const savedDoc = await saveVoucher(
        companyId,
        user.uid,
        submissionData,
        originalVoucherIdToDelete ? null : savedVoucherId
      );

      if (savedDoc && savedDoc.id) {
          setSavedVoucherId(savedDoc.id);
          if (originalVoucherIdToDelete) {
               await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, originalVoucherIdToDelete), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                convertedToType: 'contra',
                convertedToVoucherNumber: submissionData.voucherNumber,
            });
          }
      } else {
          throw new Error("Failed to save voucher and get ID.");
      }

        sonnerToast.success("Contra entry created!", { id: toastId });
      
        triggerSync();

        if (companyId && company) {
          const isEdit = !!voucher?.id;
          const amount = Number(submissionData.amount) || 0;
          const vid = savedVoucherId || voucher?.id;
          if (isEdit) {
            const oldV = voucher as any;
            const changes = getChangedFieldLabels(
              { amount: oldV?.amount, narration: oldV?.narration, date: oldV?.date, voucherNumber: oldV?.voucherNumber, fromAccountId: oldV?.fromAccountId, toAccountId: oldV?.toAccountId },
              { amount: submissionData.amount, narration: submissionData.narration, date: submissionData.date, voucherNumber: submissionData.voucherNumber, fromAccountId: submissionData.fromAccountId, toAccountId: submissionData.toAccountId },
              [
                { key: "amount", label: "Amount" },
                { key: "narration", label: "Narration" },
                { key: "date", label: "Date" },
                { key: "voucherNumber", label: "Voucher number" },
                { key: "fromAccountId", label: "From account" },
                { key: "toAccountId", label: "To account" },
              ]
            );
            await sendTransactionAlert(companyId, company, {
              kind: "edited",
              voucherId: vid,
              voucherNumber: submissionData.voucherNumber,
              voucherType: "contra",
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
              changes: changes.length > 0 ? changes : undefined,
            });
          } else if (isAmountOverOneLakh(amount)) {
            await sendTransactionAlert(companyId, company, {
              kind: "large_amount",
              voucherId: vid,
              voucherNumber: submissionData.voucherNumber,
              voucherType: "contra",
              amount,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
            });
          }
        }

        if (saveAndNew) {
            form.reset({ fromAccountId: "", toAccountId: "", date: startOfDay(new Date()), voucherNumber: "", amount: 0, narration: "" });
            setFiles([]);
            setSavedVoucherId(null);
            await fetchVoucherNumber();
        }
  
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
      } else if (isVoucherLimitError(error)) {
        sonnerToast.error("Voucher limit reached", { id: toastId, description: error.message, action: { label: "Upgrade", onClick: () => window.location.assign("/billing") } });
      } else {
        console.error("Error saving contra voucher:", error);
        sonnerToast.error("Error saving voucher.", { id: toastId });
      }
    } finally {
        setIsLoading(false);
    }
  }

  const handleDelete = async () => {
    if (!savedVoucherId || !companyId) return;
    
    try {
      // Permission check: delete
      assertCan(can, "delete_records");
      
      // Get voucher date for backdate limit check
      const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId));
      const voucherData = voucherDoc.exists() ? voucherDoc.data() : null;
      if (voucherData && hasPaymentLinks(voucherData)) {
        toast({ variant: "destructive", title: "Cannot Delete", description: "First unlink linked transactions." });
        return;
      }
      if (voucherDoc.exists() && voucherData) {
        const voucherDate = voucherData.date?.toDate ? voucherData.date.toDate() : new Date(voucherData.date);
        assertCanPerformBackdated(canPerformBackdatedAction, "delete", voucherDate);
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: error.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to check permissions.",
        });
      }
      return;
    }
    
    setIsLoading(true);
    try {
        await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || '',
        });
        toast({ title: "Voucher Moved to Bin" });
        onVoucherAction?.('cancelled', false, savedVoucherId);
        triggerSync();
    } catch (error) {
        console.error("Error deleting voucher:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to delete voucher." });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !allowAttachments) return;
    
    const maxFiles = fileAttachmentLimits.maxFileCount || 0;
    if (maxFiles === 0) {
      toast({
        variant: "destructive",
        title: "File Attachments Disabled",
        description: "File attachments are not allowed for your role.",
      });
      return;
    }

    const newFiles = Array.from(e.target.files);
    const remainingSlots = maxFiles - files.length;
    
    if (remainingSlots <= 0) {
      toast({
        variant: "destructive",
        title: "Limit Reached",
        description: `You can only upload up to ${maxFiles} file${maxFiles > 1 ? 's' : ''}.`,
      });
      return;
    }

    const filesToProcess = newFiles.slice(0, remainingSlots);
  
    for (const file of filesToProcess) {
      // Check file type
      const isImage = file.type.startsWith("image/");
      const isPDF = file.type === "application/pdf";
      
      if (!fileAttachmentLimits.allowImage && isImage) {
        toast({
          variant: "destructive",
          title: "File Type Not Allowed",
          description: "Image files are not allowed for your role.",
        });
        continue;
      }
      
      if (!fileAttachmentLimits.allowPDF && isPDF) {
        toast({
          variant: "destructive",
          title: "File Type Not Allowed",
          description: "PDF files are not allowed for your role.",
        });
        continue;
      }

      if (!isImage && !isPDF) {
        toast({
          variant: "destructive",
          title: "File Type Not Allowed",
          description: "Only image and PDF files are allowed.",
        });
        continue;
      }

      try {
        const compressedFile = await compressFile(file);
        if (compressedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast({
            variant: "destructive",
            title: "File Still Too Large",
            description: `कम्प्रेस गर्दा पनि फाइल ${MAX_FILE_SIZE_MB}MB भन्दा ठुलो भयो।`,
          });
          continue;
        }
  
        if (files.length < maxFiles) {
          setFiles(prev => [...prev, compressedFile]);
        } else {
          toast({
            variant: "destructive",
            title: "Limit Reached",
            description: `You can only upload up to ${maxFiles} file${maxFiles > 1 ? 's' : ''}.`,
          });
          break;
        }
      } catch (error) {
        console.error("Compression error:", error);
      }
    }
  };
  
  const isOwner = user?.uid === company?.ownerId;

  const availableFromAccounts = allProcessedAccounts.filter(acc => {
    if (!acc.isSpecial) return true;
    if (isOwner || can('manage_special_bank_accounts') || can('view_special_bank_accounts')) {
      return acc.useFor?.out.includes(user?.email || "") ?? true;
    }
    return false;
  });

  const availableToAccounts = allProcessedAccounts.filter(acc => {
    if (!acc.isSpecial) return true;
    if (isOwner || can('manage_special_bank_accounts') || can('view_special_bank_accounts')) {
        return acc.useFor?.in.includes(user?.email || "") ?? true;
    }
    return false;
  });

  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.contra || [getVoucherPrefix()], [company]);
  

  return (
    <>
      <Form {...form}>
        <form onSubmit={(e) => handleFormSubmit(e)} className="h-full flex flex-col">
          <ScrollArea className="flex-1 pr-6 -mr-6">
            <div className={cn(
              "space-y-6",
              isMobile ? "w-[calc(100%-4px)] mx-auto px-[2px]" : "px-[2px]"
            )}>
              {/* PC View: All 4 Fields in Same Row with Responsive Wrapping */}
              {isMobile ? (
                <>
                  {/* Mobile: Voucher No. and Date - 2 columns */}
                  <div className="flex gap-[2px] w-full">
                    <FormField
                      control={form.control}
                      name="voucherNumber"
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col flex-1 min-w-0">
                          <FormLabel className="text-xs">Voucher No.</FormLabel>
                          <div className="flex gap-1 h-9">
                            {isPrefixSelectionEnabled && voucherPrefixes.length > 0 ? (
                              <Select
                                onValueChange={(prefix) => {
                                  fetchVoucherNumber(prefix);
                                }}
                                value={voucherPrefixes.find(p => field.value?.startsWith(p)) || voucherPrefixes[0]}
                              >
                                <SelectTrigger className="h-9 w-16 text-xs px-1">
                                  <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                  {voucherPrefixes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : null}
                            <FormControl>
                              <Input placeholder="e.g. CNTR-001" {...field} className="h-9 text-xs px-2" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col flex-1 min-w-0">
                          <FormLabel className="text-xs">Date</FormLabel>
                          <div className={cn("flex gap-1 h-9 w-full", dateSystem === 'Both' && "gap-1")}>
                            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                              <div className="flex-1 min-w-0">
                                <BsDatePicker valueAD={field.value} onChangeAD={(d) => { 
                                  if (d) d.setHours(12, 0, 0, 0);
                                  field.onChange(d as Date); 
                                  setIsCalendarOpen(false); 
                                }} isRange={false} transactionDates={transactionDates} className="h-9 text-xs w-full" />
                              </div>
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <div className="flex-1 min-w-0">
                                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button variant={"outline"} className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full", !field.value && "text-muted-foreground")}>
                                        {field.value ? format(field.value, "PP") : <span className="text-xs">Pick date</span>}
                                        <CalendarIcon className="ml-auto h-3 w-3 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={(date) => {
                                      if (date) {
                                        date.setHours(12, 0, 0, 0);
                                      }
                                      field.onChange(date);
                                      setIsCalendarOpen(false);
                                    }} initialFocus modifiers={{ hasTransactions: transactionDates }} modifiersClassNames={{ hasTransactions: "has-transactions" }} />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* Mobile: From Account and To Account - 2 columns */}
                  <div className="flex gap-[2px] w-full">
                    <FormField 
                      control={form.control} 
                      name="fromAccountId" 
                      render={({ field }: any) => (
                        <FormItem className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <FormLabel className="text-xs">From Account</FormLabel>
                            {fromAccountBalance !== null && <FormLabel className="text-[10px] text-muted-foreground">Bal: {formatCurrencyForPrint(fromAccountBalance, { noSuffix: true, noAnimation: true })}</FormLabel>}
                          </div>
                          <div className="flex gap-1">
                            <Combobox 
                              options={availableFromAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})`, isSpecial: a.isSpecial }))} 
                              value={field.value} 
                              onChange={(value, newName) => { 
                                if (value === "add-new") openCreateAccountDialog('fromAccountId', newName); 
                                else field.onChange(value); 
                              }} 
                              placeholder="Select account" 
                              addNewLabel="+ Add New Account" 
                              disabled={deleteDisabledWhenLinked}
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField 
                      control={form.control} 
                      name="toAccountId" 
                      render={({ field }: any) => (
                        <FormItem className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <FormLabel className="text-xs">To Account</FormLabel>
                            {toAccountBalance !== null && <FormLabel className="text-[10px] text-muted-foreground">Bal: {formatCurrencyForPrint(toAccountBalance, { noSuffix: true, noAnimation: true })}</FormLabel>}
                          </div>
                          <div className="flex gap-1">
                            <Combobox 
                              options={availableToAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})`, isSpecial: a.isSpecial }))} 
                              value={field.value} 
                              onChange={(value, newName) => { 
                                if (value === "add-new") openCreateAccountDialog('toAccountId', newName); 
                                else field.onChange(value); 
                              }} 
                              placeholder="Select account" 
                              addNewLabel="+ Add New Account" 
                              disabled={deleteDisabledWhenLinked}
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* PC View: Voucher No. and Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:justify-end md:items-end">
                    {/* Voucher No. */}
                    <FormField
                      control={form.control}
                      name="voucherNumber"
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Voucher No.</FormLabel>
                          <div className="flex gap-2 h-10">
                            {isPrefixSelectionEnabled && voucherPrefixes.length > 0 ? (
                              <Select
                                onValueChange={(prefix) => {
                                  fetchVoucherNumber(prefix);
                                }}
                                value={voucherPrefixes.find(p => field.value?.startsWith(p)) || voucherPrefixes[0]}
                              >
                                <SelectTrigger className="w-32 h-10">
                                  <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                  {voucherPrefixes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : null}
                            <FormControl>
                              <Input placeholder="e.g. CNTR-001" {...field} className="h-10" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Date */}
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Date</FormLabel>
                          <div className={cn("flex gap-2 h-10", dateSystem === 'Both' && "gap-2")}>
                            {(dateSystem === 'BS' || dateSystem === 'Both') && (
                              <BsDatePicker valueAD={field.value} onChangeAD={(d) => { 
                                if (d) d.setHours(12, 0, 0, 0);
                                field.onChange(d as Date); 
                                setIsCalendarOpen(false); 
                              }} isRange={false} transactionDates={transactionDates} />
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn("h-10 pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                    >
                                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                  <Calendar mode="single" selected={field.value} onSelect={(date) => {
                                    if (date) {
                                      date.setHours(12, 0, 0, 0);
                                    }
                                    field.onChange(date);
                                    setIsCalendarOpen(false);
                                  }} initialFocus modifiers={{ hasTransactions: transactionDates }} modifiersClassNames={{ hasTransactions: "has-transactions" }} />
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* PC View: From Account and To Account */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="fromAccountId" render={({ field }: any) => (<FormItem>
                        <div className="flex justify-between items-baseline">
                            <FormLabel>From Account (Credit)</FormLabel>
                            {fromAccountBalance !== null && <FormLabel className={cn("text-xs font-semibold", fromAccountBalance >= 0 ? 'text-green-600' : 'text-red-600')}>{`Balance: ${formatCurrencyForPrint(fromAccountBalance, { showDrCr: true, noAnimation: true })}`}</FormLabel>}
                        </div>
                        <Combobox options={availableFromAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})`, isSpecial: a.isSpecial }))} value={field.value} onChange={(value, newName) => { if (value === "add-new") openCreateAccountDialog('fromAccountId', newName); else field.onChange(value); }} placeholder="Select source account" addNewLabel="+ Add New Account" disabled={deleteDisabledWhenLinked} /><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="toAccountId" render={({ field }: any) => (<FormItem>
                         <div className="flex justify-between items-baseline">
                            <FormLabel>To Account (Debit)</FormLabel>
                            {toAccountBalance !== null && <FormLabel className={cn("text-xs font-semibold", toAccountBalance >= 0 ? 'text-green-600' : 'text-red-600')}>{`Balance: ${formatCurrencyForPrint(toAccountBalance, { showDrCr: true, noAnimation: true })}`}</FormLabel>}
                        </div>
                        <Combobox options={availableToAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})`, isSpecial: a.isSpecial }))} value={field.value} onChange={(value, newName) => { if (value === "add-new") openCreateAccountDialog('toAccountId', newName); else field.onChange(value); }} placeholder="Select destination account" addNewLabel="+ Add New Account" disabled={deleteDisabledWhenLinked} /><FormMessage /></FormItem>)}/>
                  </div>
                </>
              )}
              <FormField control={form.control} name="amount" render={({ field }: any) => (<FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="number" placeholder="Enter amount" {...field} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="narration" render={({ field }: any) => (<FormItem><FormLabel>Narration</FormLabel><FormControl><Textarea placeholder="e.g., Cash deposited to bank" {...field} /></FormControl><FormMessage /></FormItem>)}/>
              <FormItem>
                <FormLabel>Attach Files (Optional)</FormLabel>
                <RestrictedFileUploader>
                  <div className="flex flex-wrap gap-4">
                  {files.map((file, index) => (
                    <FilePreview 
                      key={index} 
                      file={file} 
                      onRemove={allowAttachments && fileAttachmentLimits.maxFileCount > 0 ? () => setFiles(prev => prev.filter((_, i) => i !== index)) : undefined}
                      className={!allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : ""}
                    />
                  ))}
                  {allowAttachments && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                    <div 
                      className={cn(
                        "relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center transition-colors",
                        allowAttachments && fileAttachmentLimits.maxFileCount > 0
                          ? "text-muted-foreground hover:border-primary cursor-pointer"
                          : "text-muted-foreground/50 border-muted-foreground/25 cursor-not-allowed opacity-50"
                      )}
                      onClick={() => {
                        if (allowAttachments && fileAttachmentLimits.maxFileCount > 0) {
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                       <PlusCircle className="h-6 w-6" />
                      <span className="text-xs mt-1">Add File</span>
                      <Input 
                        type="file" 
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept={[
                          fileAttachmentLimits.allowImage ? "image/*" : "",
                          fileAttachmentLimits.allowPDF ? "application/pdf" : ""
                        ].filter(Boolean).join(",") || "image/*,application/pdf"}
                        multiple={fileAttachmentLimits.maxFileCount > 1}
                        disabled={!allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                      />
                    </div>
                  )}
                  </div>
                </RestrictedFileUploader>
              </FormItem>
            </div>
          </ScrollArea>

          <div className={cn(
            "border-t",
            isMobile ? "mt-[3px] pt-[3px] pb-[3px]" : "pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4"
          )}>
            {isMobile ? (
              <div className="grid grid-cols-3 gap-2 w-full [&_button]:h-10">
                <Button type="button" variant="outline" onClick={() => onVoucherAction?.('cancelled')} className="w-full">
                  Cancel
                </Button>
                {voucher ? (
                  <>
                    {showHistoryButton && onOpenHistory && (
                      <Button type="button" variant="outline" className="w-full" onClick={onOpenHistory}>
                        History
                      </Button>
                    )}
                    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                      <AlertDialogTrigger asChild disabled={editingDisabled || deleteDisabledWhenLinked}>
                        <Button type="button" variant="destructive" className="w-full" disabled={editingDisabled || deleteDisabledWhenLinked}>
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>This will move the voucher to the recycle bin.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading || editingDisabled} className="w-full">
                    {isLoading ? "..." : "Save & New"}
                  </Button>
                )}
                <Button type="submit" disabled={isLoading || editingDisabled} className="w-full">
                  {isLoading ? "..." : (voucher ? "Update" : "Save")} Contra
                </Button>
                {showApproveButton && onApprove && (
                  <Button type="button" variant="default" onClick={onApprove} disabled={isApproving} className="w-full">
                    {isApproving ? "..." : "Approve"}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex justify-center md:justify-start gap-2 [&_button]:h-10">
                  {voucher && showHistoryButton && onOpenHistory && (
                    <Button type="button" variant="outline" onClick={onOpenHistory}>
                      <History className="mr-2 h-4 w-4" /> History
                    </Button>
                  )}
                  {voucher && (
                    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                      <AlertDialogTrigger asChild disabled={editingDisabled || deleteDisabledWhenLinked}>
                        <Button type="button" variant="destructive" className="w-full md:w-auto" disabled={editingDisabled || deleteDisabledWhenLinked}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>This will move the voucher to the recycle bin.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            Move to Bin
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
                <div className={cn("grid gap-2 md:flex md:gap-4 [&_button]:h-10", voucher ? "grid-cols-2" : "grid-cols-3")}>
                  <Button type="button" variant="outline" onClick={() => onVoucherAction?.('cancelled')} className="w-full">
                    Cancel
                  </Button>
                  {!voucher && (
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading || editingDisabled} className="w-full">
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save & New
                    </Button>
                  )}
                  <Button type="submit" disabled={isLoading || editingDisabled} className="w-full">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {voucher ? "Update" : "Save"} Contra
                  </Button>
                  {showApproveButton && onApprove && (
                    <Button type="button" variant="default" onClick={onApprove} disabled={isApproving} className="w-full shrink-0">
                      {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                      Approve
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </form>
      </Form>
      <CreateBankAccountDialog onAccountCreated={handleAccountCreated} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen} />
    </>
  );
}


"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Resolver, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
  MutableRefObject,
} from "react";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Checkbox } from "../ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "../ui/alert-dialog";

import { CalendarIcon, Loader2, PlusCircle, Trash2, Printer, Upload, FileText, ArrowDownUp, Wand2, History, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay } from "date-fns";
import { toast as sonnerToast } from "sonner";

import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { useIsMobile } from "@/hooks/use-mobile";

import { firestore, storage } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import type { Party } from "@/components/party/types";
import type { Account } from "@/components/bank-cash/types";
import type { Tax } from "@/components/tax/types";
import type { ExpenseAccount } from "@/components/expenses/types";
import type { Staff } from "@/components/staff/types";

import BsDatePicker from "@/components/ui/BsDatePicker";
import { Combobox } from "../ui/combobox";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { compressFile } from "@/lib/compression";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { CreatePartyDialog } from "@/components/party/CreatePartyDialog";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { CreateExpenseAccountDialog } from "../expenses/CreateExpenseAccountDialog";
import { CreateTaxDialog } from "../tax/CreateTaxDialog";
import usePermissions from "@/hooks/usePermissions";
import { useDeviceLimitContext } from "@/contexts/DeviceLimitContext";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { hasPaymentLinks } from "@/lib/payment-allocation-utils";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS } from "@/components/vouchers/voucherButtonStyles";

const lineSchema = z.object({
  accountId: z.string().min(1, "Select an account"),
  type: z.enum(["debit", "credit"]),
  amount: z.coerce.number().min(0, "Amount must be positive."),
  isAutoLine: z.boolean().optional(),
});

const fileSchema = z.object({
  file: z.custom<File | null>().optional(),
});

const formSchema = z.object({
  voucherNumber: z.string().min(1, "Voucher number is required."),
  date: z.date({ message: "A date is required." }),
  narration: z.string().optional(),
  lines: z.array(lineSchema).min(2, "At least two lines are required for journal."),
  total: z.number().optional(),
  files: z.array(fileSchema).optional(),
  unassignedFile: z.any().optional(),
});

type JournalFormValues = z.infer<typeof formSchema>;

const getVoucherPrefix = (prefixes?: Record<string, string[]>) => (prefixes?.journal && prefixes.journal[0]) || "JRNL-";
const MAX_FILE_SIZE_MB = 0.5;

function getInitialFormValues(voucher?: any): JournalFormValues {
    if (!voucher) {
        return {
            voucherNumber: "",
            date: startOfDay(new Date()),
            narration: "",
            lines: [
                { accountId: "", type: "debit" as const, amount: 0, isAutoLine: false },
                { accountId: "", type: "credit" as const, amount: 0, isAutoLine: true },
            ],
            total: 0,
            files: [],
        };
    }

    const lines = (voucher.entries || []).map((entry: any, index: number) => ({
        accountId: entry.accountId,
        type: entry.debit > 0 ? "debit" : "credit",
        amount: entry.debit > 0 ? entry.debit : entry.credit,
        isAutoLine: index === (voucher.entries || []).length - 1,
    }));
    
    if (lines.length < 2) {
        lines.push({ accountId: "", type: "debit" as const, amount: 0, isAutoLine: false });
        lines.push({ accountId: "", type: "credit" as const, amount: 0, isAutoLine: true });
    }

    return {
        ...voucher,
        date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date),
        total: voucher.total || 0,
        files: [],
        lines: lines,
    };
}


export function CreateJournalForm({
  voucher,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  editingDisabled = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
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
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
}) {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { company, companyId, triggerSync } = useCompany();
  const { dateSystem, formatDate, formatCurrencyForPrint } = useDate();
  const { can, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const { deviceLimitReached } = useDeviceLimitContext();
  const { vouchers, processedPartiesForSelection, processedStaff, processedAccounts, expenseAccounts, processedTaxes } = useVouchers();
  const isMobile = useIsMobile();

  const [isLoading, setIsLoading] = useState(false);
  const [isCreatePartyOpen, setIsCreatePartyOpen] = React.useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = React.useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = React.useState(false);
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = React.useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<(File|string)[]>([]);
  const initialFilesRef = useRef<string[]>([]);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [activeInput, setActiveInput] = React.useState<{ index: number, field: string } | null>(null);

  const isEditing = !!voucher;
  const isEditingAndConverting = voucher && voucher.type !== 'journal';
  const isFormEditing = !voucher || isEditing;

  const form = useForm<JournalFormValues>({
    resolver: zodResolver(formSchema) as Resolver<JournalFormValues>,
    defaultValues: getInitialFormValues(voucher),
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "lines",
  });

const { isDirty: _isFormFieldsDirty } = form.formState;
  const _isFileDirty = (() => {
    const currentUrls = files.filter((f: any) => typeof f === 'string') as string[];
    const newFiles    = files.filter((f: any) => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u: any, i: number) => u !== init[i]);
  })();
  const isFormDirty = _isFormFieldsDirty || _isFileDirty;
  
  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.journal ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.journal ?? false;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.journal ?? false;
  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.journal || [getVoucherPrefix(company?.voucherPrefixes as Record<string, string[]> | undefined)], [company]);

  const transactionDates = useMemo(() => {
    if (!vouchers?.length) return [];
    return vouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [vouchers]);

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const prefixes = company?.voucherPrefixes?.journal || [getVoucherPrefix(company.voucherPrefixes as Record<string, string[]> | undefined)];
    const VOUCHER_PREFIX = selectedPrefix || prefixes[0];
    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "journal"));
      const querySnapshot = await getDocs(q);
      const voucherNumbers = querySnapshot.docs.map(doc => doc.data().voucherNumber as string);
      let maxNum = 0;
      voucherNumbers.forEach(numStr => {
        if(numStr) {
          const num = parseVoucherNumberPart(numStr, VOUCHER_PREFIX);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      
      const nextVoucherNumber = maxNum + 1;
      form.setValue("voucherNumber", formatVoucherNumber(VOUCHER_PREFIX, nextVoucherNumber));
    } catch (error) { console.error(error); }
  }, [companyId, company, form, isAutoVoucherEnabled]);

 useEffect(() => {
    if (voucher) {
        const initialValues = getInitialFormValues(voucher);
        if (isEditingAndConverting) {
            initialValues.voucherNumber = "";
        }
        form.reset(initialValues);
        setSavedVoucherId(voucher.id);
        if(voucher.fileUrls) { setFiles(voucher.fileUrls); initialFilesRef.current = voucher.fileUrls; }
        if(voucher.unassignedFile) {
          form.setValue('unassignedFile', voucher.unassignedFile);
        }
    }
}, [voucher, form, isEditingAndConverting]);

  
  useEffect(() => {
    if (!isEditing || isEditingAndConverting) {
      fetchVoucherNumber();
    }
  }, [isEditing, isEditingAndConverting, fetchVoucherNumber, company]);

  const allAccounts = useMemo(() => {
    if (!processedPartiesForSelection || !processedStaff) return [];
    return [
      ...processedPartiesForSelection.map(p => ({ value: p.id, label: `${p.name} (Party)`, balance: p.balance })),
      ...processedStaff.map(s => ({ value: s.id, label: `${s.name} (Staff)`, balance: s.balance })),
    ].sort((a,b) => a.label.localeCompare(b.label));
}, [processedPartiesForSelection, processedStaff]);


async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean; print?: boolean; approveAfterSave?: boolean } = {}) {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    
    onVoucherAction?.('saved', options.saveAndNew);
    
    processAndSave(form.getValues(), options.saveAndNew, options.approveAfterSave);
  }
  
  async function processAndSave(data: JournalFormValues, saveAndNew: boolean = false, approveAfterSave?: boolean) {
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
        const isOwnRecord = await determineVoucherOwnership(voucher, savedVoucherId, vouchers, user.uid, companyId, fetchVoucher);
        assertCanEdit(canEditRecord, isOwnRecord);
        
        // Check backdate limit for edit - use ORIGINAL voucher date, not form date
        let originalVoucherDate = voucherDate;
        if (voucher?.date) {
          originalVoucherDate = voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date);
        } else if (savedVoucherId) {
          const existingVoucher = vouchers.find(v => v.id === savedVoucherId);
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

    const totalDebit = data.lines.filter(l => l.type === 'debit').reduce((sum, l) => sum + l.amount, 0);
    const totalCredit = data.lines.filter(l => l.type === 'credit').reduce((sum, l) => sum + l.amount, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
        sonnerToast.error("Unbalanced Entry", { description: "Total debits must equal total credits." });
        setIsLoading(false);
        return;
    }

    if (deviceLimitReached) {
      sonnerToast.error("Device limit reached", {
        description: "Upgrade your plan to sync from more devices.",
        action: { label: "Upgrade", onClick: () => window.location.assign("/billing") },
      });
      return;
    }
    
    const toastId = sonnerToast.loading("Saving journal...");
    setIsLoading(true);

    try {
      if (!savedVoucherId || data.voucherNumber !== voucher?.voucherNumber) {
        const q = query(
          collection(firestore, `companies/${companyId}/vouchers`),
          where("voucherNumber", "==", data.voucherNumber),
          where("type", "==", "journal")
        );
        const existingVoucherSnap = await getDocs(q);
        if (!existingVoucherSnap.empty && existingVoucherSnap.docs[0].id !== savedVoucherId) {
          sonnerToast.error("Duplicate Voucher Number", { id: toastId, description: "This voucher number is already in use." });
          setIsLoading(false);
          return;
        }
      }
      
      const fileUrls: string[] = files.filter(f => typeof f === 'string') as string[];
      const newFilesToUpload = files.filter(f => typeof f !== 'string') as File[];

      if (newFilesToUpload.length > 0) {
        const totalNewBytes = newFilesToUpload.reduce((sum, f) => sum + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, {
          attachmentsBytes: totalNewBytes,
          storageBytes: totalNewBytes,
        });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        for (const file of newFilesToUpload) {
          if (fileUrls.length >= fileAttachmentLimits.maxFileCount) break;
          const storageRef = ref(storage, `voucher-files/${companyId}/journal/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          fileUrls.push(url);
          await incrementCompanyStorage(companyId, {
            attachmentsBytes: file.size,
            storageBytes: file.size,
          });
        }
      }
      
      const {
        files: formFiles,
        date,
        updatedAt,
        createdAt,
        history,
        lastEditedBy,
        changedAt,
        changedBy,
        ...restOfData
      } = data as any;

      const submissionData = {
        ...restOfData,
        type: "journal",
        date: date,
        total: totalDebit,
        entries: data.lines.map(line => ({
            accountId: line.accountId,
            debit: line.type === 'debit' ? line.amount : 0,
            credit: line.type === 'credit' ? line.amount : 0,
        })),
        fileUrls
      };
      
      delete (submissionData as any).lines;

      let originalVoucherIdToDelete: string | null = null;
      if (isEditingAndConverting && voucher.id) {
          originalVoucherIdToDelete = voucher.id;
      }
      const isEdit = !!voucher?.id && !originalVoucherIdToDelete;
      const approverName = customUser?.displayName || user?.displayName || user?.email || user?.uid;
      const savedDoc = await saveVoucher(
        companyId,
        user.uid,
        submissionData,
        originalVoucherIdToDelete ? null : savedVoucherId,
        approveAfterSave && isEdit ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined
      );

      if (savedDoc && savedDoc.id) {
          if (isMounted.current) setSavedVoucherId(savedDoc.id);
          if (originalVoucherIdToDelete) {
               await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, originalVoucherIdToDelete), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                convertedToType: 'journal',
                convertedToVoucherNumber: submissionData.voucherNumber,
            });
          }
      } else {
          throw new Error("Failed to save voucher and get ID.");
      }

        if (approveAfterSave && savedDoc?.id) {
          if (!isEdit) {
            await approveVoucherWithHistory(companyId, savedDoc.id, user.uid, approverName);
          }
          sonnerToast.success(isEdit ? "Journal updated and approved." : "Journal saved and approved.", { id: toastId });
        } else {
          sonnerToast.success(isEdit ? "Journal updated!" : "Journal voucher created!", { id: toastId });
        }
        triggerSync();

        if (companyId && company) {
          const isEdit = !!voucher?.id;
          const amount = Number(submissionData.total) || 0;
          const vid = savedVoucherId || voucher?.id;
          if (isEdit) {
            const oldV = voucher as any;
            const changes = getChangedFieldLabels(
              { total: oldV?.total, narration: oldV?.narration, date: oldV?.date, voucherNumber: oldV?.voucherNumber },
              { total: submissionData.total, narration: submissionData.narration, date: submissionData.date, voucherNumber: submissionData.voucherNumber },
              [
                { key: "total", label: "Amount" },
                { key: "narration", label: "Narration" },
                { key: "date", label: "Date" },
                { key: "voucherNumber", label: "Voucher number" },
              ]
            );
            await sendTransactionAlert(companyId, company, {
              kind: "edited",
              voucherId: vid,
              voucherNumber: submissionData.voucherNumber,
              voucherType: "journal",
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
              voucherType: "journal",
              amount,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
            });
          }
        }

        if (saveAndNew && isMounted.current) {
            form.reset(getInitialFormValues());
            setFiles([]);
            setSavedVoucherId(null);
            await fetchVoucherNumber();
        }

        if (approveAfterSave && voucher?.id) onApprove?.();
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
      } else if (isVoucherLimitError(error)) {
        sonnerToast.error("Voucher limit reached", {
          id: toastId,
          description: error.message,
          action: { label: "Upgrade", onClick: () => window.location.assign("/billing") },
        });
      } else {
        console.error("Error saving journal voucher:", error);
        sonnerToast.error("Error saving voucher.", { id: toastId });
      }
    } finally {
        if (isMounted.current) setIsLoading(false);
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
      if (voucherDoc.exists()) {
        const voucherDate = voucherData!.date?.toDate ? voucherData!.date.toDate() : new Date(voucherData!.date);
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
        onVoucherAction?.('cancelled');
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
      // Check file type first
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

  const handleCreateNew = (type: 'party' | 'account' | 'staff' | 'expense' | 'tax', newName?: string) => {
    if (type === 'party') setIsCreatePartyOpen(true);
    if (type === 'account') setIsCreateAccountOpen(true);
    if (type === 'staff') setIsCreateStaffOpen(true);
    if (type === 'expense') setIsCreateExpenseOpen(true);
    if (type === 'tax') setIsCreateTaxOpen(true);

    if (newName) {
       setTimeout(() => {
        const eventName = `prefill-create-${type}-name`;
        document.dispatchEvent(new CustomEvent(eventName, { detail: newName }));
      }, 100);
    }
  };
  
  const handleAmountChange = (index: number, value: number) => {
    const lines = form.getValues("lines");
    const lastIndex = lines.length - 1;

    // If the user edits the last line, add a new one.
    if (index === lastIndex && value > 0) {
        append({ accountId: "", type: "credit", amount: 0, isAutoLine: true });
    }

    // Now, re-calculate based on the new state
    const updatedLines = form.getValues("lines");
    let totalDebit = 0;
    let totalCredit = 0;

    updatedLines.forEach((line, i) => {
        if (i !== updatedLines.length - 1) { // Exclude the new last line for calculation
            if (line.type === 'debit') totalDebit += Number(line.amount) || 0;
            else totalCredit += Number(line.amount) || 0;
        }
    });
    
    const diff = totalDebit - totalCredit;
    const absDiff = Math.abs(diff);

    const newLastIndex = updatedLines.length - 1;
    form.setValue(`lines.${newLastIndex}.amount`, absDiff, { shouldValidate: true });
    form.setValue(`lines.${newLastIndex}.type`, diff > 0 ? 'credit' : 'debit', { shouldValidate: true });
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={(e) => handleFormSubmit(e)} className="h-full flex flex-col min-w-0 w-full max-w-full">
          <ScrollArea className={cn("flex-1 overflow-x-hidden min-w-0 w-full", !isMobile && "pr-6 -mr-6")}>
            <div className={cn(
              "space-y-6 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full",
              isMobile ? "" : "px-[2px]"
            )}>
              {/* PC View: All 4 Fields in Same Row with Responsive Wrapping */}
              {isMobile ? (
                <>
                  {/* Mobile: Prefix + Voucher No. + Date(s) in one row, 2/3/4 equal-sized boxes */}
                  {(() => {
                    const hasPrefix = isPrefixSelectionEnabled && voucherPrefixes.length > 0;
                    const hasDateBS = dateSystem === 'BS' || dateSystem === 'Both';
                    const hasDateAD = dateSystem === 'AD' || dateSystem === 'Both';
                    const colCount = (hasPrefix ? 1 : 0) + 1 + (hasDateBS ? 1 : 0) + (hasDateAD ? 1 : 0);
                    return (
                      <FormField
                        control={form.control}
                        name="voucherNumber"
                        render={({ field: voucherField }: any) => (
                          <>
                            <FormField
                              control={form.control}
                              name="date"
                              render={({ field: dateField }: any) => (
                                <>
                                  <div className="grid gap-[2px] w-full min-w-0 max-w-full" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                                    {hasPrefix && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Prefix</FormLabel>
                                        <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find(p => voucherField.value?.startsWith(normalizePrefix(p)) || voucherField.value?.startsWith(p)) || voucherPrefixes[0]}>
                                          <SelectTrigger className="h-9 w-full min-w-0 max-w-full text-xs px-1 [&>span]:truncate">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {voucherPrefixes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                    <FormItem className="min-w-0 w-full overflow-hidden">
                                      <FormLabel className="text-xs truncate">Voucher No.</FormLabel>
                                      <FormControl>
                                        <Input placeholder="e.g. JV-001" {...voucherField} className="h-9 text-xs px-2 min-w-0 max-w-full truncate w-full" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
                                      </FormControl>
                                    </FormItem>
                                    {hasDateBS && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Date (BS)</FormLabel>
                                        <div className="min-w-0 w-full overflow-hidden">
                                          <BsDatePicker valueAD={dateField.value} onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); dateField.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} className="h-9 text-xs w-full" />
                                        </div>
                                      </FormItem>
                                    )}
                                    {hasDateAD && (
                                      <FormItem className="min-w-0 w-full overflow-hidden">
                                        <FormLabel className="text-xs truncate">Date</FormLabel>
                                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                          <PopoverTrigger asChild>
                                            <FormControl>
                                              <Button disabled={!isFormEditing} variant="outline" className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")}>
                                                {dateField.value ? formatDate(dateField.value) : <span className="text-xs">Pick date</span>}
                                                <CalendarIcon className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                                              </Button>
                                            </FormControl>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0 z-[102]" align="start">
                                            <Calendar mode="single" selected={dateField.value} onSelect={(date) => { if (date) date.setHours(12, 0, 0, 0); dateField.onChange(date); setIsCalendarOpen(false); }} initialFocus modifiers={{ hasTransactions: transactionDates }} modifiersClassNames={{ hasTransactions: "has-transactions" }} />
                                          </PopoverContent>
                                        </Popover>
                                      </FormItem>
                                    )}
                                  </div>
                                  <FormMessage />
                                </>
                              )}
                            />
                            <FormMessage />
                          </>
                        )}
                      />
                    );
                  })()}
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
                            {isPrefixSelectionEnabled && voucherPrefixes.length > 0 && (
                              <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find(p => field.value?.startsWith(normalizePrefix(p)) || field.value?.startsWith(p)) || voucherPrefixes[0]}>
                                <SelectTrigger className="w-32 h-10">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {voucherPrefixes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                            <FormControl>
                              <Input placeholder="e.g. JV-001" {...field} className="h-10" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
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
                                    <Button disabled={!isFormEditing} variant={"outline"} className={cn("h-10 pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                      {field.value ? formatDate(field.value) : <span>Pick a date</span>}
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
                </>
              )}
                
              {isMobile ? (
                <>
                  {/* Mobile: Journal Lines */}
                  <div className="space-y-4 px-[2px]">
                    {fields.map((line, index) => {
                      const accountId = form.watch(`lines.${index}.accountId`);
                      const balance = allAccounts.find(a => a.value === accountId)?.balance;
                      const isLastRow = index === fields.length - 1;
                      const lineType = form.watch(`lines.${index}.type`);
                      
                      return (
                        <div key={line.id} className="flex gap-[2px] items-end border px-[2px] py-2 rounded-md">
                          {/* Account */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.accountId`}
                            render={({ field }: any) => (
                              <FormItem className="flex-1 min-w-0 overflow-hidden">
                                <div className="min-w-0 w-full overflow-hidden [&_button]:h-9 [&_button]:text-xs">
                                  <Combobox
                                    triggerClassName="w-full min-w-0"
                                    options={allAccounts.map(a => ({ value: a.value, label: a.label }))}
                                    value={field.value}
                                    onChange={(value, newName) => {
                                      if (value === "add-new-party") handleCreateNew("party", newName);
                                      else if (value === "add-new-staff") handleCreateNew("staff", newName);
                                      else field.onChange(value);
                                    }}
                                    placeholder="Select account"
                                    addNewLabels={[
                                      { value: "add-new-party", label: "+ Add Party" },
                                      { value: "add-new-staff", label: "+ Add Staff" },
                                    ]}
                                    disabled={!isFormEditing || deleteDisabledWhenLinked}
                                  />
                                </div>
                                {balance !== undefined && (
                                  <div className={cn("text-[10px] font-semibold mt-1", balance >= 0 ? "text-green-600" : "text-red-600")}>
                                    Bal: {formatCurrencyForPrint(balance, { noSuffix: true, noAnimation: true })}
                                  </div>
                                )}
                              </FormItem>
                            )}
                          />
                          {/* Dr/Cr - Only show text, clickable to toggle */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.type`}
                            render={({ field }: any) => (
                              <FormItem>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    "h-9 px-3 min-w-[40px]",
                                    field.value === "debit" ? "text-blue-600 border-blue-300" : "text-purple-600 border-purple-300"
                                  )}
                                  onClick={() => {
                                    if (!isFormEditing || deleteDisabledWhenLinked || (isLastRow && fields.length > 1)) return;
                                    field.onChange(field.value === "debit" ? "credit" : "debit");
                                  }}
                                  disabled={!isFormEditing || deleteDisabledWhenLinked || (isLastRow && fields.length > 1)}
                                >
                                  <span className="text-xs font-semibold">
                                    {field.value === "debit" ? "Dr" : "Cr"}
                                  </span>
                                </Button>
                              </FormItem>
                            )}
                          />
                          {/* Amount */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.amount`}
                            render={({ field }: any) => (
                              <FormItem className="flex-1 min-w-0">
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    className="h-9 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    {...field}
                                    disabled={!isFormEditing}
                                    onFocus={(e) => {
                                      if (!voucher && e.target.value === "0") e.target.select();
                                    }}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value) || 0;
                                      field.onChange(value);
                                      handleAmountChange(index, value);
                                    }}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          {/* Delete Button */}
                          {isFormEditing && fields.length > 2 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={!isFormEditing} className="h-9 w-9">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Mobile: Totals and Add Row - Bottom Left */}
                  <div className="flex flex-col gap-2 px-[2px]">
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ accountId: "", type: "debit", amount: 0, isAutoLine: false })} className="w-fit">
                      <PlusCircle className="mr-2 h-4 w-4"/> Add Row
                    </Button>
                    <div className="flex gap-2">
                      <div className="bg-green-100 px-3 py-2 rounded text-xs font-medium">
                        Total Debit: {form.watch("lines").filter(l => l.type === "debit").reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toFixed(2)}
                      </div>
                      <div className="bg-red-100 px-3 py-2 rounded text-xs font-medium">
                        Total Credit: {form.watch("lines").filter(l => l.type === "credit").reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Desktop: Journal Lines */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-[2fr_auto_auto_1fr_48px] gap-2 items-end">
                      <FormLabel>Account</FormLabel>
                      <div></div>
                      <div></div>
                      <FormLabel>Amount</FormLabel>
                      <div></div>
                    </div>

                    {fields.map((line, index) => {
                      const accountId = form.watch(`lines.${index}.accountId`);
                      const balance = allAccounts.find(a => a.value === accountId)?.balance;
                      const isLastRow = index === fields.length - 1;
                      
                      return (
                        <div key={line.id} className="grid grid-cols-[2fr_auto_auto_1fr_48px] gap-2 items-end border p-2 rounded-md">
                          {/* Account */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.accountId`}
                            render={({ field }: any) => (
                              <FormItem>
                                <Combobox
                                  options={allAccounts.map(a => ({ value: a.value, label: a.label }))}
                                  value={field.value}
                                  onChange={(value, newName) => {
                                    if (value === "add-new-party") handleCreateNew("party", newName);
                                    else if (value === "add-new-staff") handleCreateNew("staff", newName);
                                    else field.onChange(value);
                                  }}
                                  placeholder="Select account"
                                  addNewLabels={[
                                    { value: "add-new-party", label: "+ Add Party" },
                                    { value: "add-new-staff", label: "+ Add Staff" },
                                  ]}
                                  disabled={!isFormEditing || deleteDisabledWhenLinked}
                                />
                                {balance !== undefined && (
                                  <div className={cn("text-xs font-semibold mt-1", balance >= 0 ? "text-green-600" : "text-red-600")}>
                                    Bal: {formatCurrencyForPrint(balance, { showDrCr: true, noAnimation: true })}
                                  </div>
                                )}
                              </FormItem>
                            )}
                          />

                          {/* Debit / Credit Type (Select) */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.type`}
                            render={({ field }: any) => (
                              <FormItem>
                                <Select onValueChange={field.onChange} value={field.value} disabled={!isFormEditing || deleteDisabledWhenLinked || (isLastRow && fields.length > 1)}>
                                  <FormControl>
                                    <SelectTrigger className="w-24 justify-center">
                                      <SelectValue placeholder="Type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent align="center">
                                    <SelectItem value="debit">Debit</SelectItem>
                                    <SelectItem value="credit">Credit</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (fields.length === 2) {
                                const type1 = form.getValues('lines.0.type');
                                const type2 = form.getValues('lines.1.type');
                                form.setValue('lines.0.type', type2);
                                form.setValue('lines.1.type', type1);
                              }
                            }}
                            className="h-9 w-9"
                            disabled={fields.length !== 2 || !isFormEditing}
                          >
                            <ArrowDownUp className="h-5 w-5 stroke-2"/>
                          </Button>

                          {/* Amount */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.amount`}
                            render={({ field }: any) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    className="text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    {...field}
                                    disabled={!isFormEditing}
                                    onFocus={(e) => {
                                      if (!voucher && e.target.value === "0") e.target.select();
                                    }}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value) || 0;
                                      field.onChange(value);
                                      handleAmountChange(index, value);
                                    }}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          {/* Delete Button */}
                          <div className="flex items-center">
                            {isFormEditing && fields.length > 2 && (
                              <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={!isFormEditing}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: Totals and Add Row */}
                  <div className="flex justify-end items-center mt-3 gap-4">
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ accountId: "", type: "debit", amount: 0, isAutoLine: false })}>
                      <PlusCircle className="mr-2 h-4 w-4"/> Add Row
                    </Button>
                    <div className="bg-green-100 px-4 py-2 rounded text-sm font-medium">
                      Total Debit: {form.watch("lines").filter(l => l.type === "debit").reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toFixed(2)}
                    </div>
                    <div className="bg-red-100 px-4 py-2 rounded text-sm font-medium">
                      Total Credit: {form.watch("lines").filter(l => l.type === "credit").reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toFixed(2)}
                    </div>
                  </div>
                </>
              )}

              <FormField
                control={form.control}
                name="narration"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Overall Narration</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g. Salary expense for the month of Baisakh" {...field} disabled={!isFormEditing}/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormItem>
                <FormLabel>Attach Files (Optional)</FormLabel>
                <RestrictedFileUploader>
                  <div className="flex flex-wrap gap-4">
                    {files.map((file, index) => (
                      <FilePreview 
                        key={index} 
                        file={file} 
                        onRemove={allowAttachments && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((_, i) => i !== index)) : undefined}
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
                        <input 
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

          {isFormEditing && <div className={cn("border-t min-w-0 max-w-full overflow-x-hidden", isMobile ? "mt-[3px] pt-[3px] pb-[3px]" : "pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4")}>
            {isMobile ? (
              <div className={cn("grid grid-cols-3 gap-2 w-full", VOUCHER_BUTTONS_CLASS)}>
                {/* Row 0: Delete (left) | History (middle) | Save & Print (right) */}
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full" disabled={!voucher || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS)}>
                  History
                </Button>
                <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={isLoading || editingDisabled} className={cn("w-full", BTN_PRINT_CLASS)}>
                  Save & Print
                </Button>
                {/* Row 1: Cancel | Approve or Save & Approve (when can approve) | Save (always) - all 6 buttons */}
                <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("w-full", BTN_CANCEL_CLASS)}>
                  Cancel
                </Button>
                {voucher?.id ? (
                  <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={!showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                    {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                  </Button>
                ) : showSaveAndApproveOnCreate ? (
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })} disabled={isLoading || editingDisabled} className={cn("w-full", BTN_APPROVE_CLASS)}>
                    {isLoading ? "..." : "Save & Approve"}
                  </Button>
                ) : (
                  <Button type="button" disabled className="w-full bg-muted text-muted-foreground border-0 opacity-50">—</Button>
                )}
                <Button type="submit" disabled={isLoading || editingDisabled} className={cn("w-full", BTN_SAVE_CLASS)}>
                  {isLoading ? "..." : "Save"}
                </Button>
              </div>
            ) : (
              <>
                <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                    <History className="mr-2 h-4 w-4" /> History
                  </Button>
                  <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" className="w-full md:w-auto shrink-0 rounded-full" disabled={!voucher || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                </div>
                <div className={cn("flex gap-2 justify-end flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={!!voucher || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_NEW_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                  </Button>
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}>
                    <Printer className="mr-2 h-4 w-4" />
                    Save & Print
                  </Button>
                  <Button type="submit" disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                  {voucher?.id ? (
                    <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={!showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                      {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                      {isFormDirty ? "Save & Approve" : "Approve"}
                    </Button>
                  ) : (
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })} disabled={!showSaveAndApproveOnCreate || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save & Approve
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>}
        </form>
      </Form>
      <CreatePartyDialog onPartyCreated={(id) => { setIsCreatePartyOpen(false); append({ accountId: id, type: 'debit', amount: 0, isAutoLine: false }) }} isOpen={isCreatePartyOpen} onOpenChange={setIsCreatePartyOpen} />
      <CreateBankAccountDialog onAccountCreated={(id) => { setIsCreateAccountOpen(false); append({ accountId: id, type: 'debit', amount: 0, isAutoLine: false}); }} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen} />
      <CreateStaffDialog onStaffCreated={(id) => {setIsCreateStaffOpen(false); append({ accountId: id, type: 'debit', amount: 0, isAutoLine: false}); }} isOpen={isCreateStaffOpen} onOpenChange={setIsCreateStaffOpen} groups={[]} />
      <CreateExpenseAccountDialog onExpenseAccountCreated={(id) => { setIsCreateExpenseOpen(false); append({ accountId: id, type: 'debit', amount: 0, isAutoLine: false}); }} isOpen={isCreateExpenseOpen} onOpenChange={setIsCreateExpenseOpen} />
      <CreateTaxDialog onTaxCreated={(id) => { setIsCreateTaxOpen(false); append({ accountId: id, type: 'debit', amount: 0, isAutoLine: false}); }} isOpen={isCreateTaxOpen} onOpenChange={setIsCreateTaxOpen} />
    </>
  );
}


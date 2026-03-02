
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Trash2, Upload, FileText, PlusCircle, Crown, Printer, Link2, History, CheckCircle } from "lucide-react";
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
import type { Party } from "@/components/party/types";
import type { Account } from "@/components/bank-cash/types";
import type { Tax } from "@/components/tax/types";
import { CreatePartyDialog } from "@/components/party/CreatePartyDialog";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";
import { useDate } from "@/hooks/useDate";
import usePermissions from "@/hooks/usePermissions";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { toast as sonnerToast } from "sonner";
import BsDatePicker from "../ui/BsDatePicker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Staff } from "@/components/staff/types";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { compressFile } from "@/lib/compression";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateTaxDialog } from "@/components/tax/CreateTaxDialog";
import { Combobox } from "@/components/ui/combobox";
import { FilePreview } from "../vouchers/FilePreview";
import { useVouchers } from "@/hooks/useVouchers";
import { CreateExpenseAccountDialog } from "../expenses/CreateExpenseAccountDialog";
import type { ExpenseAccount } from "../expenses/types";
import { Checkbox } from "../ui/checkbox";
import type { DateRange } from "react-day-picker";
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { useSearchParams } from "next/navigation";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { useAccountBalance } from "@/hooks/useAccountBalance";
import { useIsMobile } from "@/hooks/use-mobile";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { LinkPaymentToTxnsDialog } from "@/components/vouchers/LinkPaymentToTxnsDialog";
import type { Allocation } from "@/lib/payment-allocation-utils";
import { getAllocationTotal, hasPaymentLinks, OPENING_BALANCE_VOUCHER_ID } from "@/lib/payment-allocation-utils";
import { usePaymentAllocations } from "@/hooks/usePaymentAllocations";
import { Zap } from "lucide-react";

const fileSchema = z.object({
  file: z.custom<File | null>().optional(),
});

const formSchema = z.object({
  payeeType: z.enum(["party", "staff", "tax", "income", "other"]),
  partyId: z.string().optional(),
  staffId: z.string().optional(),
  taxAccountId: z.string().optional(),
  incomeAccountId: z.string().optional(),
  payeeName: z.string().optional(),
  accountId: z.string().min(1, "Please select a bank/cash account."),
  date: z.date({ message: "A date is required." }),
  voucherNumber: z.string().min(1, "Voucher number is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  narration: z.string().optional(),
  files: z.array(fileSchema).optional(),
}).superRefine((data, ctx) => {
    if (data.payeeType === 'party' && !data.partyId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select a party.", path: ["partyId"] });
    }
    if (data.payeeType === 'staff' && !data.staffId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select a staff member.", path: ["staffId"] });
    }
     if (data.payeeType === 'tax' && !data.taxAccountId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select a tax account.", path: ["taxAccountId"] });
    }
    if (data.payeeType === 'income' && !data.incomeAccountId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select an income account.", path: ["incomeAccountId"] });
    }
    if (data.payeeType === 'other' && !data.payeeName) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please enter a payee name.", path: ["payeeName"] });
    }
});

type PaymentInFormValues = z.infer<typeof formSchema>;

const getVoucherPrefix = (prefixes?: Record<string, string[]>, type?: 'payment_in' | 'direct_income') => {
    if (type === 'direct_income') {
        return (prefixes?.direct_income && prefixes.direct_income[0]) || "DINC-";
    }
    return (prefixes?.payment_in && prefixes.payment_in[0]) || "RCPT-";
}
const MAX_FILE_SIZE_MB = 0.5;

const getPayeeTypeFromVoucher = (v: any) => {
  if (v?.staffId) return 'staff';
  if (v?.taxAccountId) return 'tax';
  if (v?.type === 'direct_income' || v.incomeAccountId) return 'income';
  if (v?.payeeName) return 'other';
  return 'party';
}

const getInitialFormValues = (voucher?: any): PaymentInFormValues => {
    if (voucher) {
        return {
            ...voucher,
            payeeType: getPayeeTypeFromVoucher(voucher),
            date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date),
            amount: typeof (voucher.total || voucher.amount) === 'string' 
              ? parseFloat(String(voucher.total || voucher.amount).replace(/,/g, '')) || 0
              : Number(voucher.total || voucher.amount || 0),
            partyId: voucher.partyId || "",
            staffId: voucher.staffId || "",
            payeeName: voucher.payeeName || "",
            incomeAccountId: voucher.incomeAccountId || "",
            taxAccountId: voucher.taxAccountId || "",
            voucherNumber: voucher.voucherNumber || "",
            accountId: voucher.accountId || "",
            narration: voucher.narration || "",
            files: voucher.files || [] 
        };
    }
    return {
        payeeType: "party",
        partyId: "",
        staffId: "",
        accountId: "",
        date: startOfDay(new Date()),
        voucherNumber: "",
        amount: 0,
        taxAccountId: "",
        narration: "",
        payeeName: "",
        incomeAccountId: ""
    };
};


export function CreatePaymentInForm({
  voucher,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  defaultTab,
  defaultVoucherData,
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
  defaultTab?: 'payment_in' | 'direct_income';
  defaultVoucherData?: any;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
}) {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS, dateSystem } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedParties, processedPartiesForSelection, processedStaff, processedTaxes, processedStaffGroups, processedAccounts, expenseAccounts } = useVouchers();
  const { company, companyId, triggerSync } = useCompany();
  const { can, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("party");
  const [showAllCompanyVouchers, setShowAllCompanyVouchers] = useState(false);
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isCreateExpenseAccountOpen, setIsCreateExpenseAccountOpen] = useState(false);
  const [files, setFiles] = useState<(File|string)[]>([]);
  const initialFilesRef = useRef<string[]>([]);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);


    useEffect(() => {
        setLoading(vouchersLoading);

    }, [vouchersLoading, companyId]);

  const isEditingAndConverting = voucher && (voucher.type !== 'payment_in' && voucher.type !== 'direct_income');
  
  const form = useForm<PaymentInFormValues>({
    resolver: zodResolver(formSchema) as Resolver<PaymentInFormValues>,
    defaultValues: getInitialFormValues(voucher || defaultVoucherData),
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
  const payeeType = form.watch('payeeType');
  const partyId = form.watch("partyId");
  const staffId = form.watch("staffId");
  const taxAccountId = form.watch("taxAccountId");
  const accountId = form.watch("accountId");
  const { displayBalance: accountBalance } = useAccountBalance(accountId);
  const incomeAccountId = form.watch("incomeAccountId");
  
  const voucherType = defaultTab === 'direct_income' ? 'direct_income' : 'payment_in';

  const payeeBalance = useMemo(() => {
    if (payeeType === 'party' && partyId) return processedParties.find(p => p.id === partyId)?.balance;
    if (payeeType === 'staff' && staffId) return processedStaff.find(s => s.id === staffId)?.balance;
    if (payeeType === 'tax' && taxAccountId) return processedTaxes.find(t => t.id === taxAccountId)?.balance;
    if (payeeType === 'income' && incomeAccountId) return expenseAccounts.find(e => e.id === incomeAccountId)?.balance;
    return null;
  }, [payeeType, partyId, staffId, taxAccountId, incomeAccountId, processedParties, processedStaff, processedTaxes, expenseAccounts]);

  const transactionDates = useMemo(() => {
    if (!allVouchers?.length) return [];
    return allVouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [allVouchers]);

  const linkedToRows = useMemo(() => {
    if (!allocations?.length) return [];
    return allocations.map((a) => {
      if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) {
        return {
          voucherId: a.voucherId,
          voucherNumber: "Opening Balance",
          amount: getAllocationTotal(a),
          date: null as Date | null,
        };
      }
      if (!allVouchers?.length) return { voucherId: a.voucherId, voucherNumber: "—", amount: getAllocationTotal(a), date: null as Date | null };
      const target = allVouchers.find((v: any) => v.id === a.voucherId);
      const rawDate = target?.date;
      const date = rawDate ? (typeof (rawDate as any)?.toDate === "function" ? (rawDate as any).toDate() : new Date(rawDate as string | number)) : null;
      return {
        voucherId: a.voucherId,
        voucherNumber: target?.voucherNumber ?? target?.voucher_number ?? "—",
        amount: getAllocationTotal(a),
        date: date && !isNaN(date.getTime()) ? date : null,
      };
    });
  }, [allocations, allVouchers]);

  const paymentInAlloc = usePaymentAllocations(partyId, allVouchers ?? [], voucher?.id ?? savedVoucherId ?? undefined);

  const totalLinked = useMemo(() => linkedToRows.reduce((s, r) => s + r.amount, 0), [linkedToRows]);
  const amountReceived = Number(form.watch("amount")) || 0;
  const remainingToLink = Math.max(0, amountReceived - totalLinked);

  const showLinkedSection = voucherType === "payment_in" && payeeType === "party" && partyId && company?.enableLinkPaymentToTxns !== false;
  
  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.[voucherType] ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.[voucherType] ?? false;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.[voucherType] ?? false;

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const prefixes = company?.voucherPrefixes?.[voucherType] || [getVoucherPrefix(company.voucherPrefixes, voucherType)];
    const VOUCHER_PREFIX = selectedPrefix || prefixes[0];
    
    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", voucherType));
      const querySnapshot = await getDocs(q);
      const voucherNumbers = querySnapshot.docs.map(doc => doc.data().voucherNumber as string);
      
      let maxNum = 0;
      voucherNumbers.forEach(numStr => {
        if (numStr && (numStr.startsWith(normalizePrefix(VOUCHER_PREFIX)) || numStr.startsWith(VOUCHER_PREFIX))) {
          const num = parseVoucherNumberPart(numStr, VOUCHER_PREFIX);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
      
      const nextVoucherNumber = maxNum + 1;
      form.setValue("voucherNumber", formatVoucherNumber(VOUCHER_PREFIX, nextVoucherNumber));
    } catch (error) {
      console.error("Error fetching voucher count: ", error);
    }
  }, [companyId, company, form, isAutoVoucherEnabled, voucherType]);

  // Same as Pay (CreatePaymentOutForm): only reset when editing (voucher.id). New voucher uses defaultValues + fetchVoucherNumber.
  useEffect(() => {
    if (voucher?.id) {
        const initialValues = getInitialFormValues(voucher);
        if (isEditingAndConverting) {
            initialValues.voucherNumber = "";
        }
        form.reset(initialValues);
        setSavedVoucherId(voucher.id);
        setFiles(voucher.fileUrls || []);
        setAllocations(Array.isArray(voucher.allocations) ? voucher.allocations : []);
    } else if (defaultVoucherData && !voucher?.id) {
        setFiles(defaultVoucherData.fileUrls || []);
        setAllocations(Array.isArray(defaultVoucherData.allocations) ? defaultVoucherData.allocations : []);
        form.setValue("partyId", defaultVoucherData.partyId ?? "");
    }
  }, [voucher, defaultVoucherData, form, isEditingAndConverting]);

  useEffect(() => {
    if ((!savedVoucherId || isEditingAndConverting) && isAutoVoucherEnabled) {
      fetchVoucherNumber();
    }
  }, [isAutoVoucherEnabled, savedVoucherId, fetchVoucherNumber, isEditingAndConverting]);

  useEffect(() => {
    if (voucherType === 'payment_in' && !['party', 'staff', 'tax'].includes(payeeType)) {
        form.setValue('payeeType', 'party');
    } else if (voucherType === 'direct_income' && payeeType !== 'income') {
        form.setValue('payeeType', 'income');
    }
  }, [payeeType, voucherType, form]);
  
  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean, print?: boolean, approveAfterSave?: boolean } = {}) {
    e?.preventDefault?.();
    const isValid = await form.trigger();
    if (!isValid) {
      const errors = form.formState.errors;
      const errorMessages: string[] = [];

      if (errors.payeeType) errorMessages.push(`Payee Type: ${errors.payeeType.message}`);
      if (errors.partyId) errorMessages.push(`Party: ${errors.partyId.message}`);
      if (errors.staffId) errorMessages.push(`Staff: ${errors.staffId.message}`);
      if (errors.taxAccountId) errorMessages.push(`Tax Account: ${errors.taxAccountId.message}`);
      if (errors.incomeAccountId) errorMessages.push(`Income Account: ${errors.incomeAccountId.message}`);
      if (errors.payeeName) errorMessages.push(`Payee Name: ${errors.payeeName.message}`);
      if (errors.accountId) errorMessages.push(`Bank/Cash Account: ${errors.accountId.message}`);
      if (errors.date) errorMessages.push(`Date: ${errors.date.message}`);
      if (errors.voucherNumber) errorMessages.push(`Voucher No.: ${errors.voucherNumber.message}`);
      if (errors.amount) errorMessages.push(`Amount: ${errors.amount.message}`);

      const errorText = errorMessages.length > 0
        ? errorMessages.join(", ")
        : "Please check the form and try again.";

      sonnerToast.error("Validation Failed", { description: errorText });
      return;
    }
    
    onVoucherAction?.('saved', options.saveAndNew);
    
    await processAndSave(form.getValues(), options.saveAndNew, options.print, options.approveAfterSave ? onApprove : undefined, options.approveAfterSave);
  }

  async function processAndSave(data: PaymentInFormValues, saveAndNew: boolean = false, print: boolean = false, onSuccess?: () => void, approveAfterSave?: boolean) {
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
        const currentVoucher = voucher ?? (savedVoucherId && allVouchers ? allVouchers.find((v: any) => v.id === savedVoucherId) : null);
        assertCanEdit(canEditRecord, isOwnRecord, currentVoucher);
        
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

    const toastId = sonnerToast.loading("Saving income...");
    setIsLoading(true);

    try {
      if (!savedVoucherId || data.voucherNumber !== voucher?.voucherNumber) {
        const q = query(
          collection(firestore, `companies/${companyId}/vouchers`),
          where("voucherNumber", "==", data.voucherNumber),
          where("type", "==", voucherType)
        );
        const existingVoucherSnap = await getDocs(q);
        if (!existingVoucherSnap.empty && existingVoucherSnap.docs[0].id !== savedVoucherId) {
          sonnerToast.error("Duplicate Voucher Number", { id: toastId, description: "This voucher number is already in use." });
          setIsLoading(false);
          return;
        }
      }
  
      let docId = savedVoucherId;
      const { 
        date, 
        files: formFiles, 
        updatedAt, 
        createdAt, 
        history, 
        lastEditedBy,
        unassignedFile,
        balance,
        credit,
        debit,
        ...restOfData 
      } = data as any;

      // Ensure amount is read directly from form and cleaned (remove any formatting)
      const formAmount = form.getValues('amount');
      const cleanAmount = typeof formAmount === 'string' 
        ? parseFloat(String(formAmount).replace(/,/g, '')) || 0
        : Number(formAmount || 0);
      
      const submissionData: any = {
        ...restOfData,
        date: date.toISOString(),
        amount: cleanAmount,
        total: cleanAmount,
        fileUrls: files.filter(f => typeof f === 'string') as string[],
        type: voucherType
      };
      if (voucherType === 'payment_in') {
        submissionData.allocations = allocations ?? [];
      }
  
      const sanitizedData = JSON.parse(JSON.stringify(submissionData));
  
      const newFilesToUpload = files.filter(f => typeof f !== 'string') as File[];
      if (newFilesToUpload.length > 0) {
        const totalNewBytes = newFilesToUpload.reduce((s, f) => s + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        for (const file of newFilesToUpload) {
          if (sanitizedData.fileUrls.length >= fileAttachmentLimits.maxFileCount) break;
          const storageRef = ref(storage, `voucher-files/${companyId}/${voucherType}/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          sanitizedData.fileUrls.push(url);
          await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
        }
      }
  
      let originalVoucherIdToDelete: string | null = null;
      if (isEditingAndConverting && voucher.id) {
        originalVoucherIdToDelete = voucher.id;
      }
      
      const isEdit = !!voucher?.id && !originalVoucherIdToDelete;
      const approverName = customUser?.displayName || user?.displayName || user?.email || user?.uid;
      const savedDoc = await saveVoucher(
        companyId,
        user.uid,
        sanitizedData,
        originalVoucherIdToDelete ? null : docId,
        approveAfterSave && isEdit ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined
      );

      if (savedDoc && savedDoc.id) {
          docId = savedDoc.id;
          setSavedVoucherId(docId);
          if (originalVoucherIdToDelete) {
               await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, originalVoucherIdToDelete), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                convertedToType: voucherType,
                convertedToVoucherNumber: sanitizedData.voucherNumber,
            });
          }
      } else {
          throw new Error("Failed to save voucher and get ID.");
      }

        if (approveAfterSave && savedDoc?.id) {
          if (!isEdit) {
            await approveVoucherWithHistory(companyId, savedDoc.id, user.uid, approverName);
          }
          sonnerToast.success(isEdit ? "Receipt updated and approved." : "Receipt saved and approved.", { id: toastId });
        } else {
          sonnerToast.success("Receipt Recorded!", { id: toastId, description: `Voucher #${data.voucherNumber} has been ${isEdit ? 'updated' : 'created'}.` });
        }
        triggerSync();

        if (companyId && company) {
          const vid = docId ?? voucher?.id;
          if (isEdit) {
            const oldV = voucher as any;
            const changes = getChangedFieldLabels(
              { amount: oldV?.total ?? oldV?.amount, narration: oldV?.narration, date: oldV?.date?.toDate?.() ?? oldV?.date, voucherNumber: oldV?.voucherNumber, accountId: oldV?.accountId, partyId: oldV?.partyId, staffId: oldV?.staffId },
              { amount: data.amount, narration: data.narration, date: data.date, voucherNumber: data.voucherNumber, accountId: data.accountId, partyId: data.partyId, staffId: data.staffId },
              [
                { key: "amount", label: "Amount" },
                { key: "narration", label: "Narration" },
                { key: "date", label: "Date" },
                { key: "voucherNumber", label: "Voucher number" },
                { key: "accountId", label: "Account" },
                { key: "partyId", label: "Party" },
                { key: "staffId", label: "Staff" },
              ]
            );
            await sendTransactionAlert(companyId, company, {
              kind: "edited",
              voucherId: vid,
              voucherNumber: data.voucherNumber,
              voucherType: voucherType,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
              changes: changes.length > 0 ? changes : undefined,
            });
          } else if (isAmountOverOneLakh(cleanAmount)) {
            await sendTransactionAlert(companyId, company, {
              kind: "large_amount",
              voucherId: vid,
              voucherNumber: data.voucherNumber,
              voucherType: voucherType,
              amount: cleanAmount,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
            });
          }
        }

        if (print && docId) {
            window.open(`/payment-in/receipt/${docId}`, "_blank");
        }

        if (saveAndNew) {
            form.reset(getInitialFormValues());
            setFiles([]);
            setSavedVoucherId(null);
            setAllocations([]);
            await fetchVoucherNumber();
        }

        if (approveAfterSave && voucher?.id) onSuccess?.();
        else if (!approveAfterSave) onSuccess?.();
  
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
      } else if (isVoucherLimitError(error)) {
        sonnerToast.error("Voucher limit reached", { id: toastId, description: error.message, action: { label: "Upgrade", onClick: () => window.location.assign("/billing") } });
      } else {
        console.error("Error saving voucher: ", error);
        sonnerToast.error("Error", { id: toastId, description: "Failed to save voucher." });
      }
    } finally {
        setIsLoading(false);
    }
  }

  const handleDelete = async () => {
    if (!savedVoucherId || !companyId) return;
    
    try {
      // Permission check: delete (and delete_approved_voucher if voucher is approved)
      const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId));
      const voucherData = voucherDoc.exists() ? voucherDoc.data() : null;
      if (!canDeleteVoucher(voucherData)) {
        throw new PermissionDeniedError(
          (voucherData as any)?.isApproved ? "You do not have permission to delete approved vouchers." : "You do not have permission to delete records."
        );
      }
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
  const availableAccounts = processedAccounts.filter(acc => {
    if (!acc.isSpecial) return true;
    if (isOwner || can('manage_special_bank_accounts') || can('view_special_bank_accounts')) {
        return acc.useFor?.in.includes(user?.email || "") ?? true;
    }
    return false;
  });
  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.[voucherType] || [getVoucherPrefix()], [company, voucherType]);
  
  const paymentPayeeTypes = [
    { value: 'party', label: 'Party' },
    { value: 'staff', label: 'Staff' },
    { value: 'tax', label: 'Tax' },
  ];
  const incomePayeeTypes = [
    { value: 'income', label: 'Income' },
  ];
  const currentPayeeTypes = voucherType === 'payment_in' ? paymentPayeeTypes : incomePayeeTypes;
  

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
                                            <SelectValue/>
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
                                        <Input placeholder="e.g. RCPT-001" {...voucherField} className="h-9 text-xs px-2 min-w-0 max-w-full truncate w-full" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
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
                                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                          <PopoverTrigger asChild>
                                            <FormControl>
                                              <Button variant="outline" className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")}>
                                                {dateField.value ? formatDate(dateField.value) : <span className="text-xs">Pick date</span>}
                                                <CalendarIcon className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                                              </Button>
                                            </FormControl>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0 z-50" align="start">
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
                            {isPrefixSelectionEnabled && voucherPrefixes.length > 0 ? (
                              <Select
                                onValueChange={(prefix) => {
                                  fetchVoucherNumber(prefix);
                                }}
                                value={voucherPrefixes.find(p => field.value?.startsWith(normalizePrefix(p)) || field.value?.startsWith(p)) || voucherPrefixes[0]}
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
                              <Input placeholder="e.g. RCPT-001" {...field} className="h-10" disabled={isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers'))} />
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
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn("h-10 pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                    >
                                      {field.value ? formatDate(field.value) : <span>Pick a date</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-50" align="start">
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

               <FormField
                control={form.control}
                name="payeeType"
                render={({ field }: any) => (
                    <FormItem className="space-y-3">
                        <FormLabel>Received From</FormLabel>
                        <FormControl>
                            <RadioGroup
                            onValueChange={(value) => {
                                if (deleteDisabledWhenLinked) return;
                                field.onChange(value);
                                form.setValue('partyId', '');
                                form.setValue('staffId', '');
                                form.setValue('taxAccountId', '');
                                form.setValue('incomeAccountId', '');
                                form.setValue('payeeName', '');
                            }}
                            value={field.value}
                            className="flex space-x-4"
                            >
                            {currentPayeeTypes.map(type => (
                              <FormItem key={type.value} className="flex items-center space-x-2 space-y-0">
                                <FormControl><RadioGroupItem value={type.value} disabled={deleteDisabledWhenLinked} /></FormControl>
                                <FormLabel className="font-normal">{type.label}</FormLabel>
                              </FormItem>
                            ))}
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
                />

              {isMobile ? (
                <>
                  {/* Mobile: From and To accounts - grid-cols-2 so fields fit inside dialog */}
                  <div className="grid grid-cols-2 gap-2 w-full">
                    {payeeType === 'party' && (
                      <FormField
                        control={form.control}
                        name="partyId"
                        render={({ field }: any) => (
                          <FormItem className="min-w-0">
                            <div className="flex justify-between items-baseline mb-1 min-w-0">
                              <FormLabel className="text-xs truncate">From (Party)</FormLabel>
                              {payeeBalance !== null && payeeBalance !== undefined && (
                                <FormLabel className={cn("text-[10px] font-semibold mr-[2px] shrink-0", payeeBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  {formatCurrencyForPrint(payeeBalance, { noSuffix: true, noAnimation: true })} {payeeBalance >= 0 ? 'Dr' : 'Cr'}
                                </FormLabel>
                              )}
                            </div>
                            <div className="min-w-0 w-full overflow-hidden">
                              <Combobox
                                triggerClassName="w-full min-w-0"
                                options={processedPartiesForSelection.map(p => ({ value: p.id, label: p.name }))}
                                value={field.value}
                                onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreatePartyOpen(true);
                                    setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-party-name', { detail: newName })), 100);
                                  } else {
                                    field.onChange(val);
                                  }
                                }}
                                placeholder="Select customer"
                                addNewLabel="+ Add New Party"
                                disabled={deleteDisabledWhenLinked}
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {payeeType === 'staff' && (
                      <FormField
                        control={form.control}
                        name="staffId"
                        render={({ field }: any) => (
                          <FormItem className="min-w-0">
                            <div className="flex justify-between items-baseline mb-1 min-w-0">
                              <FormLabel className="text-xs truncate">From (Staff)</FormLabel>
                              {payeeBalance !== null && payeeBalance !== undefined && (
                                <FormLabel className={cn("text-[10px] font-semibold mr-[2px] shrink-0", payeeBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  {formatCurrencyForPrint(payeeBalance, { noSuffix: true, noAnimation: true })} {payeeBalance >= 0 ? 'Dr' : 'Cr'}
                                </FormLabel>
                              )}
                            </div>
                            <div className="min-w-0 w-full overflow-hidden">
                              <Combobox
                                triggerClassName="w-full min-w-0"
                                options={processedStaff.map(s => ({ value: s.id, label: s.name }))}
                                value={field.value}
                                onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreateStaffOpen(true);
                                    setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-staff-name', { detail: newName })), 100);
                                  } else {
                                    field.onChange(val);
                                  }
                                }}
                                placeholder="Select staff"
                                addNewLabel="+ Add New Staff"
                                disabled={deleteDisabledWhenLinked}
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {payeeType === 'tax' && (
                      <FormField
                        control={form.control}
                        name="taxAccountId"
                        render={({ field }: any) => (
                          <FormItem className="min-w-0">
                            <div className="flex justify-between items-baseline mb-1 min-w-0">
                              <FormLabel className="text-xs truncate">From (Tax)</FormLabel>
                            </div>
                            <div className="min-w-0 w-full overflow-hidden">
                              <Combobox
                                triggerClassName="w-full min-w-0"
                                options={processedTaxes.map(t => ({ value: t.id, label: t.name }))}
                                value={field.value}
                                onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreateTaxOpen(true);
                                    setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-tax-name', { detail: newName })), 100);
                                  } else {
                                    field.onChange(val);
                                  }
                                }}
                                placeholder="Select tax"
                                addNewLabel="+ Add New Tax Ledger"
                                disabled={deleteDisabledWhenLinked}
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {payeeType === 'income' && (
                      <FormField
                        control={form.control}
                        name="incomeAccountId"
                        render={({ field }: any) => (
                          <FormItem className="min-w-0">
                            <div className="flex justify-between items-baseline mb-1 min-w-0">
                              <FormLabel className="text-xs truncate">From (Income)</FormLabel>
                            </div>
                            <div className="min-w-0 w-full overflow-hidden">
                              <Combobox
                                triggerClassName="w-full min-w-0"
                                options={expenseAccounts.map(e => ({ value: e.id, label: e.name }))}
                                value={field.value}
                                onChange={(val, newName) => {
                                  if (val === 'add-new') {
                                    setIsCreateExpenseAccountOpen(true);
                                    setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-expense-account-name', { detail: newName })), 100);
                                  } else {
                                    field.onChange(val);
                                  }
                                }}
                                placeholder="Select account"
                                addNewLabel="+ Add New Income Account"
                                disabled={deleteDisabledWhenLinked}
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="accountId"
                      render={({ field }: any) => (
                        <FormItem className="min-w-0">
                          <div className="flex justify-between items-baseline mb-1 min-w-0">
                            <FormLabel className="text-xs truncate">To Bank/Cash</FormLabel>
                            {accountBalance !== null && <FormLabel className="text-[10px] text-muted-foreground shrink-0">Bal: {formatCurrency(accountBalance, {noAnimation: true, noSuffix: true})}</FormLabel>}
                          </div>
                          <div className="min-w-0 w-full overflow-hidden">
                            <Combobox
                              triggerClassName="w-full min-w-0"
                              options={availableAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})`, isSpecial: a.isSpecial }))}
                              value={field.value}
                              onChange={(value, newName) => {
                                if (value === "add-new") {
                                  setIsCreateAccountOpen(true);
                                  setTimeout(() => {
                                    document.dispatchEvent(new CustomEvent('prefill-create-bank-account-name', { detail: newName }));
                                  }, 100);
                                } else {
                                  field.onChange(value);
                                }
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {payeeType === 'party' && (
                    <FormField
                      control={form.control}
                      name="partyId"
                      render={({ field }: any) => (
                        <FormItem>
                          <div className="flex justify-between items-baseline">
                            <FormLabel>From (Party)</FormLabel>
                            {payeeBalance !== null && payeeBalance !== undefined && (
                              <FormLabel className={cn("text-xs font-semibold", payeeBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {payeeBalance >= 0 
                                  ? `Receivable: ${formatCurrencyForPrint(payeeBalance, { noSuffix: true, noAnimation: true })} Dr`
                                  : `Payable: ${formatCurrencyForPrint(Math.abs(payeeBalance), { noSuffix: true, noAnimation: true })} Cr`
                                }
                              </FormLabel>
                            )}
                          </div>
                          <Combobox
                            options={processedPartiesForSelection.map(p => ({ value: p.id, label: p.name }))}
                            value={field.value}
                            onChange={(val, newName) => {
                              if (val === 'add-new') {
                                setIsCreatePartyOpen(true);
                                setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-party-name', { detail: newName })), 100);
                              } else {
                                field.onChange(val);
                              }
                            }}
                            placeholder="Select a customer"
                            addNewLabel="+ Add New Party"
                            disabled={deleteDisabledWhenLinked}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                 {payeeType === 'staff' && (
                    <FormField
                      control={form.control}
                      name="staffId"
                      render={({ field }: any) => (
                        <FormItem>
                           <div className="flex justify-between items-baseline">
                                <FormLabel>From (Staff)</FormLabel>
                                {payeeBalance !== null && payeeBalance !== undefined && (
                                    <FormLabel className={cn("text-xs font-semibold", payeeBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                       {payeeBalance >= 0 
                                         ? `Receivable: ${formatCurrencyForPrint(payeeBalance, { noSuffix: true, noAnimation: true })} Dr`
                                         : `Payable: ${formatCurrencyForPrint(Math.abs(payeeBalance), { noSuffix: true, noAnimation: true })} Cr`
                                       }
                                    </FormLabel>
                                )}
                            </div>
                           <Combobox
                                options={processedStaff.map(s => ({ value: s.id, label: s.name }))}
                                value={field.value}
                                 onChange={(val, newName) => {
                                    if (val === 'add-new') {
                                        setIsCreateStaffOpen(true);
                                        setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-staff-name', { detail: newName })), 100);
                                    } else {
                                        field.onChange(val);
                                    }
                                }}
                                placeholder="Select a staff member"
                                addNewLabel="+ Add New Staff"
                                disabled={deleteDisabledWhenLinked}
                            />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                 )}
                {payeeType === 'tax' && (
                    <FormField
                      control={form.control}
                      name="taxAccountId"
                      render={({ field }: any) => (
                        <FormItem>
                          <div className="flex justify-between items-baseline">
                            <FormLabel>From (Tax)</FormLabel>
                            {payeeBalance !== null && payeeBalance !== undefined && (
                                <FormLabel className={cn("text-xs font-semibold", payeeBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                   {payeeBalance >= 0 
                                     ? `Receivable: ${formatCurrencyForPrint(payeeBalance, { noSuffix: true, noAnimation: true })} Dr`
                                     : `Payable: ${formatCurrencyForPrint(Math.abs(payeeBalance), { noSuffix: true, noAnimation: true })} Cr`
                                   }
                                </FormLabel>
                            )}
                          </div>
                            <Combobox
                                options={processedTaxes.map(t => ({ value: t.id, label: t.name }))}
                                value={field.value}
                                onChange={(val, newName) => {
                                    if (val === 'add-new') {
                                        setIsCreateTaxOpen(true);
                                        setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-tax-name', { detail: newName })), 100);
                                    } else {
                                        field.onChange(val);
                                    }
                                }}
                                placeholder="Select a tax ledger"
                                addNewLabel="+ Add New Tax Ledger"
                                disabled={deleteDisabledWhenLinked}
                            />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                )}
                 {payeeType === 'income' && (
                    <FormField
                      control={form.control}
                      name="incomeAccountId"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>From (Income)</FormLabel>
                            <Combobox
                                options={expenseAccounts.map(e => ({ value: e.id, label: e.name }))}
                                value={field.value}
                                onChange={(val, newName) => {
                                    if (val === 'add-new') {
                                        setIsCreateExpenseAccountOpen(true);
                                        setTimeout(() => document.dispatchEvent(new CustomEvent('prefill-create-expense-account-name', { detail: newName })), 100);
                                    } else {
                                        field.onChange(val);
                                    }
                                }}
                                placeholder="Select an income account"
                                addNewLabel="+ Add New Income Account"
                                disabled={deleteDisabledWhenLinked}
                            />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                 )}
                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }: any) => (
                    <FormItem>
                       <div className="flex justify-between items-baseline">
                        <FormLabel>To Bank/Cash Account</FormLabel>
                        {accountBalance !== null && <FormLabel className="text-xs text-muted-foreground">Balance: {formatCurrency(accountBalance, {noAnimation: true})}</FormLabel>}
                      </div>
                       <Combobox
                            options={availableAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})`, isSpecial: a.isSpecial }))}
                            value={field.value}
                            onChange={(value, newName) => {
                              if (value === "add-new") {
                                  setIsCreateAccountOpen(true);
                                  setTimeout(() => {
                                    document.dispatchEvent(new CustomEvent('prefill-create-bank-account-name', { detail: newName }));
                                  }, 100);
                              } else {
                                  field.onChange(value);
                              }
                            }}
                            placeholder="Select an account"
                            addNewLabel="+ Add New Account"
                            disabled={deleteDisabledWhenLinked}
                        />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              )}

              <FormField
                control={form.control}
                name="amount"
                render={({ field }: any) => {
                  const hasLinks = allocations.length > 0;
                  return (
                  <FormItem>
                    <FormLabel>Amount Received</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        value={typeof field.value === 'number' ? field.value : (field.value ?? '')} 
                        onChange={(e) => {
                          if (hasLinks) return;
                          const rawValue = e.target.value;
                          if (rawValue === '' || rawValue === null || rawValue === undefined) {
                            field.onChange(0);
                          } else {
                            const cleanValue = String(rawValue).replace(/,/g, '');
                            const numValue = parseFloat(cleanValue);
                            field.onChange(isNaN(numValue) ? 0 : numValue);
                          }
                        }}
                        disabled={hasLinks}
                        className={hasLinks ? "bg-muted" : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                  );
                }}
              />
              <div className={cn("grid gap-4", showLinkedSection ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
                <FormField
                  control={form.control}
                  name="narration"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Narration</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional details..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {showLinkedSection && (
                  <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-center gap-2 font-medium">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <span>Linked to</span>
                    </div>
                    {linkedToRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No sales linked to this payment.</p>
                    ) : (
                      <div className="space-y-1.5 text-sm">
                        {linkedToRows.map((r) => (
                          <div
                            key={r.voucherId}
                            {...(can('edit_link')
                              ? {
                                  role: "button" as const,
                                  tabIndex: 0,
                                  className: "flex justify-between items-center gap-2 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                  onClick: () => setIsLinkDialogOpen(true),
                                  onKeyDown: (e: React.KeyboardEvent) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setIsLinkDialogOpen(true);
                                    }
                                  },
                                }
                              : { className: "flex justify-between items-center gap-2 rounded-md px-2 py-1.5 -mx-2" })}
                          >
                            <span className="truncate text-muted-foreground">
                              {r.voucherNumber === "Opening Balance"
                                ? "Opening Balance"
                                : `${r.date ? (dateSystem === "BS" ? formatDateBS(r.date) : formatDate(r.date)) : "—"} · ${r.voucherNumber}`}
                            </span>
                            <span className="shrink-0">{formatCurrency(r.amount, { noSuffix: true, noAnimation: true })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-2 border-t space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total linked</span>
                        <span>{formatCurrency(totalLinked, { noSuffix: true, noAnimation: true })}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Balance</span>
                        <span className={remainingToLink === 0 && totalLinked > 0 ? "text-green-600 font-semibold" : ""}>
                          {remainingToLink === 0 && totalLinked > 0 ? "Settled" : formatCurrency(remainingToLink, { noSuffix: true, noAnimation: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {can('add_link') && (
                          <>
                            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIsLinkDialogOpen(true)}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Link to Txns
                            </Button>
                            <Button type="button" variant="outline" size="sm" className="w-fit" disabled={remainingToLink <= 0 || paymentInAlloc.salesWithOutstanding.length === 0} onClick={() => { setAllocations(paymentInAlloc.autoLink(amountReceived)); sonnerToast.success("Auto link applied."); }}>
                              <Zap className="h-4 w-4 mr-2" />
                              Auto Link
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
            "border-t min-w-0 max-w-full overflow-x-hidden",
            isMobile ? "mt-[3px] pt-[3px] pb-[3px] space-y-0" : "pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4"
          )}>
            {isMobile ? (
              <div className={cn("grid grid-cols-3 gap-2 w-full min-w-0", VOUCHER_BUTTONS_CLASS)}>
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
                  <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher || !onOpenHistory} className={cn("shrink-0", BTN_HISTORY_CLASS)}>
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
          </div>
        </form>
      </Form>
      <CreatePartyDialog onPartyCreated={(id) => { setIsCreatePartyOpen(false); form.setValue("partyId", id); }} isOpen={isCreatePartyOpen} onOpenChange={setIsCreatePartyOpen} />
      <CreateStaffDialog onStaffCreated={(id) => {setIsCreateStaffOpen(false); form.setValue("staffId", id)}} isOpen={isCreateStaffOpen} onOpenChange={setIsCreateStaffOpen} groups={[]}>
        <div/>
      </CreateStaffDialog>
       <CreateBankAccountDialog 
        onAccountCreated={(id) => {
            setIsCreateAccountOpen(false);
            form.setValue("accountId", id);
        }} 
        isOpen={isCreateAccountOpen} 
        onOpenChange={setIsCreateAccountOpen} 
      />
       <CreateExpenseAccountDialog 
          isOpen={isCreateExpenseAccountOpen} 
          onOpenChange={setIsCreateExpenseAccountOpen}
          onExpenseAccountCreated={(id) => {
            setIsCreateExpenseAccountOpen(false);
            form.setValue("incomeAccountId", id);
        }} >
          <div/>
        </CreateExpenseAccountDialog>
       <CreateTaxDialog 
        onTaxCreated={(id) => {
            setIsCreateTaxOpen(false);
            form.setValue("taxAccountId", id);
        }} 
        isOpen={isCreateTaxOpen} 
        onOpenChange={setIsCreateTaxOpen}
      />
      {voucherType === "payment_in" && partyId && (
        <LinkPaymentToTxnsDialog
          isOpen={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
          variant="payment_in"
          partyId={partyId}
          partyName={processedParties.find((p) => p.id === partyId)?.name ?? "Party"}
          receivedAmount={Number(form.watch("amount")) || 0}
          existingAllocations={allocations}
          paymentInId={voucher?.id ?? savedVoucherId ?? undefined}
          accountId={form.watch("accountId") || undefined}
          paymentInVoucherNumber={form.watch("voucherNumber") || undefined}
          paymentInDate={form.watch("date")}
          partyOpeningBalance={processedParties.find((p) => p.id === partyId)?.openingBalance ?? 0}
          onDone={async (allocs, _amount) => {
            setAllocations(allocs);
            const vid = voucher?.id ?? savedVoucherId;
            if (vid && companyId) {
              try {
                await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, vid), {
                  allocations: allocs,
                  linkedToVoucherNos: [],
                  linkedFromVoucherNos: [],
                });
                triggerSync?.();
              } catch (e) {
                toast({ variant: "destructive", title: "Error", description: "Failed to save link changes." });
              }
            }
          }}
        />
      )}
    </>
  );
}


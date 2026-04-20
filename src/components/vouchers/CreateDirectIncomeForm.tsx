"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Trash2, Upload, FileText, PlusCircle } from "lucide-react";
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
import { toast as sonnerToast } from "sonner";
import BsDatePicker from "../ui/BsDatePicker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Staff } from "@/components/staff/types";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { compressVoucherAttachment } from "@/lib/compression";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateTaxDialog } from "@/components/tax/CreateTaxDialog";
import { Combobox } from "@/components/ui/combobox";
import { FilePreview } from "../vouchers/FilePreview";
import { useVouchers } from "@/hooks/useVouchers";
import { CreateExpenseAccountDialog } from "../expenses/CreateExpenseAccountDialog";
import type { ExpenseAccount } from "../expenses/types";
import { Checkbox } from "../ui/checkbox";
import { BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import type { DateRange } from "@/components/ui/ad-calendar";
import { saveVoucher, isVoucherLimitError, patchVoucherFields } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { isLocalOnlyMode } from "@/lib/localMode";
import { appendLocalOnlyVoucherFilesToUrls } from "@/lib/voucherLocalAttachmentUpload";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { hasPaymentLinks } from "@/lib/payment-allocation-utils";
import { useIsMobile } from "@/hooks/use-mobile";


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
            total: voucher.total || voucher.amount,
            partyId: voucher.partyId || "",
            staffId: voucher.staffId || "",
            payeeName: voucher.payeeName || "",
            incomeAccountId: voucher.incomeAccountId || "",
            taxAccountId: voucher.taxAccountId || "",
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
  onVoucherCreated,
  onVoucherUpdated,
  defaultTab,
}: {
  voucher?: any;
  onVoucherCreated?: () => void;
  onVoucherUpdated?: () => void;
  defaultTab?: 'payment_in' | 'direct_income';
}) {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { formatCurrency, formatDate, dateSystem } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedParties, processedPartiesForSelection, processedStaff, processedTaxes, processedStaffGroups, processedAccounts, expenseAccounts } = useVouchers();
  const { company, companyId } = useCompany();
  const { canPerformBackdatedAction, allowAttachments, fileAttachmentLimits, can } = usePermissions();
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
  /** Edit-mode Save vs dirty: snapshot of URL attachments when voucher loads */
  const initialFilesRef = useRef<string[]>([]);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);


    useEffect(() => {
        setLoading(vouchersLoading);

    }, [vouchersLoading, companyId]);

  const isEditingAndConverting = voucher && (voucher.type !== 'payment_in' && voucher.type !== 'direct_income');
  
  const form = useForm<PaymentInFormValues>({
    resolver: zodResolver(formSchema) as Resolver<PaymentInFormValues>,
    defaultValues: getInitialFormValues(voucher),
  });

  const { isDirty: _isFormFieldsDirty } = form.formState;
  const _isFileDirty = (() => {
    const currentUrls = files.filter((f): f is string => typeof f === "string");
    const newFiles = files.filter((f): f is File => f instanceof File);
    if (newFiles.length > 0) return true;
    const init = initialFilesRef.current;
    return currentUrls.length !== init.length || currentUrls.some((u, i) => u !== init[i]);
  })();
  const isFormDirty = _isFormFieldsDirty || _isFileDirty;

  const payeeType = form.watch('payeeType');
  const partyId = form.watch("partyId");
  const staffId = form.watch("staffId");
  const taxAccountId = form.watch("taxAccountId");
  const accountId = form.watch("accountId");
  const incomeAccountId = form.watch("incomeAccountId");
  
  const voucherType = defaultTab === 'direct_income' ? 'direct_income' : 'payment_in';

  const payeeBalance = useMemo(() => {
    if (payeeType === 'party' && partyId) return processedParties.find(p => p.id === partyId)?.balance;
    if (payeeType === 'staff' && staffId) return processedStaff.find(s => s.id === staffId)?.balance;
    if (payeeType === 'tax' && taxAccountId) return processedTaxes.find(t => t.id === taxAccountId)?.balance;
    if (payeeType === 'income' && incomeAccountId) return expenseAccounts.find(e => e.id === incomeAccountId)?.balance;
    return null;
  }, [payeeType, partyId, staffId, taxAccountId, incomeAccountId, processedParties, processedStaff, processedTaxes, expenseAccounts]);

  const accountBalance = useMemo(() => {
    if (!accountId) return null;
    return processedAccounts.find(a => a.id === accountId)?.balance;
  }, [accountId, processedAccounts]);

  const transactionDates = useMemo(() => {
    if (!allVouchers?.length) return [];
    return allVouchers.map((v) => {
      const d = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
    }).filter(Boolean) as Date[];
  }, [allVouchers]);
  
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

  useEffect(() => {
    if (voucher) {
        const initialValues = getInitialFormValues(voucher);
        if (isEditingAndConverting) {
            initialValues.voucherNumber = "";
        }
        form.reset(initialValues);
        setSavedVoucherId(voucher.id);
        const urls = voucher.fileUrls || [];
        setFiles(urls);
        initialFilesRef.current = [...urls];
    }
}, [voucher, form, isEditingAndConverting]);

  
  useEffect(() => {
    if ((!savedVoucherId || isEditingAndConverting) && isAutoVoucherEnabled) {
      fetchVoucherNumber();
    }
  }, [isAutoVoucherEnabled, savedVoucherId, fetchVoucherNumber, isEditingAndConverting, payeeType]);

  useEffect(() => {
    if (voucherType === 'payment_in' && !['party', 'staff', 'tax'].includes(payeeType)) {
        form.setValue('payeeType', 'party');
    } else if (voucherType === 'direct_income' && payeeType !== 'income') {
        form.setValue('payeeType', 'income');
    }
  }, [payeeType, voucherType, form]);
  
  // Validated `data` — `getValues()` से date miss न हो
  function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean } = {}) {
    e.preventDefault();
    void form.handleSubmit(
      async (data) => {
        await processAndSave(data, options.saveAndNew);
      },
      () => {
        sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      }
    )(e);
  }
  
  async function processAndSave(data: PaymentInFormValues, saveAndNew: boolean = false) {
    if (!user || !companyId) {
      sonnerToast.error("Error", { description: "Login and company selection required." });
      return;
    }
    
    if (!voucher && !canPerformBackdatedAction("entry", data.date)) {
      sonnerToast.error("Permission Denied", { description: "You cannot create a voucher for this date based on your role's permissions."});
      return;
    }

    if (!saveAndNew) {
      onVoucherCreated?.();
      onVoucherUpdated?.();
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
      const { files: formFiles, date, ...restOfData } = data;
      const submissionData: any = {
        ...restOfData,
        date: date.toISOString(),
        amount: Number(restOfData.amount || 0),
        total: Number(restOfData.amount || 0),
        partyId: form.getValues('partyId') || null,
        staffId: form.getValues('staffId') || null,
        taxAccountId: form.getValues('taxAccountId') || null,
        incomeAccountId: form.getValues('incomeAccountId') || null,
        payeeName: form.getValues('payeeName') || null,
        fileUrls: files.filter(f => typeof f === 'string') as string[],
        type: voucherType
      };

      const newFilesToUpload = files.filter(f => typeof f !== 'string') as File[];
      let preGeneratedVoucherId: string | undefined;
      if (newFilesToUpload.length > 0) {
        const totalNewBytes = newFilesToUpload.reduce((s, f) => s + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes }, company?.storageOption);
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        if (isLocalOnlyMode()) {
          const voucherIdForLocalAttachments =
            isEditingAndConverting && voucher?.id
              ? null
              : (savedVoucherId ?? voucher?.id ?? null);
          const { fileUrls: merged, preGeneratedVoucherId: preGen } =
            await appendLocalOnlyVoucherFilesToUrls({
              companyId,
              storageFolder: String(voucherType),
              existingFileUrls: submissionData.fileUrls as string[],
              newFiles: newFilesToUpload,
              maxFileCount: fileAttachmentLimits.maxFileCount,
              existingVoucherId: voucherIdForLocalAttachments,
            });
          submissionData.fileUrls = merged;
          if (preGen) preGeneratedVoucherId = preGen;
          try {
            await incrementCompanyStorage(companyId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes });
          } catch {
            /* offline */
          }
        } else {
          for (const file of newFilesToUpload) {
            if (submissionData.fileUrls.length >= fileAttachmentLimits.maxFileCount) break;
            const storageRef = ref(storage, `voucher-files/${companyId}/${voucherType}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            submissionData.fileUrls.push(url);
            await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
          }
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
        originalVoucherIdToDelete ? null : docId,
        undefined,
        preGeneratedVoucherId ? { preGeneratedVoucherId } : undefined
      );

      if (savedDoc && savedDoc.id) {
          docId = savedDoc.id;
          setSavedVoucherId(docId);
          if (originalVoucherIdToDelete) {
              // Converted source voucher ko local/offline me bhi recycle-bin mark karo.
              await patchVoucherFields(companyId, originalVoucherIdToDelete, {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                convertedToType: voucherType,
                convertedToVoucherNumber: submissionData.voucherNumber,
              });
          }
      } else {
          throw new Error("Failed to save voucher and get ID.");
      }

        sonnerToast.success("Receipt Recorded!", { id: toastId, description: `Voucher #${data.voucherNumber} has been created.` });

        if (companyId && company) {
          const isEdit = !!voucher?.id;
          const amount = Number(submissionData.amount ?? submissionData.total) || 0;
          const vid = savedVoucherId || voucher?.id;
          if (isEdit) {
            const oldV = voucher as any;
            const newDate = typeof submissionData.date === "string" ? new Date(submissionData.date) : submissionData.date;
            const changes = getChangedFieldLabels(
              { amount: oldV?.total ?? oldV?.amount, narration: oldV?.narration, date: oldV?.date?.toDate?.() ?? oldV?.date, voucherNumber: oldV?.voucherNumber },
              { amount: submissionData.amount ?? submissionData.total, narration: submissionData.narration, date: newDate, voucherNumber: submissionData.voucherNumber },
              [
                { key: "amount", label: "Amount" },
                { key: "narration", label: "Narration" },
                { key: "date", label: "Date" },
                { key: "voucherNumber", label: "Voucher number" },
              ]
            );
            await sendTransactionAlert(companyId, company, {
              kind: "edited",
              voucherId: vid,
              voucherNumber: submissionData.voucherNumber,
              voucherType: voucherType,
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
              voucherType: voucherType,
              amount,
              performedByUserId: user?.uid,
              performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
              performedByEmail: user?.email ?? undefined,
            });
          }
        }

        if (saveAndNew) {
            form.reset(getInitialFormValues());
            setFiles([]);
            setSavedVoucherId(null);
            await fetchVoucherNumber();
        }
  
    } catch (error) {
      if (isVoucherLimitError(error)) {
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
    const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId));
    const voucherData = voucherDoc.exists() ? voucherDoc.data() : null;
    if (voucherData && hasPaymentLinks(voucherData)) {
      toast({ variant: "destructive", title: "Cannot Delete", description: "First unlink linked transactions." });
      return;
    }
    setIsLoading(true);
    try {
      // Local/offline compatible delete: voucher ko bin me move karo instead of hard delete.
      await patchVoucherFields(companyId, savedVoucherId, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || "",
      });
      toast({ title: "Voucher Moved to Bin", description: "The voucher has been moved to recycle bin." });
      onVoucherUpdated?.();
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
        description: `You can only upload up to ${maxFiles} file${maxFiles > 1 ? "s" : ""}.`,
      });
      return;
    }

    const filesToProcess = newFiles.slice(0, remainingSlots);

    for (const file of filesToProcess) {
      const isImage = file.type.startsWith("image/");
      const isPDF =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

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
        const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
        const processedFile = await compressVoucherAttachment(file, maxBytes);
        if (processedFile.size > maxBytes) {
          toast({
            variant: "destructive",
            title: "File Still Too Large",
            description: `After compression the file is still over ${MAX_FILE_SIZE_MB} MB. Try a smaller PDF or image.`,
          });
          continue;
        }
        setFiles((prev) => {
          if (prev.length >= maxFiles) return prev;
          return [...prev, processedFile];
        });
      } catch (error) {
        console.error("Compression error:", error);
        toast({
          variant: "destructive",
          title: "Could not process file",
          description: error instanceof Error ? error.message : "Compression or PDF read failed.",
        });
      }
    }
    e.target.value = "";
  };
  
  const availableAccounts = processedAccounts.filter(acc => !acc.isSpecial);
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
          <ScrollArea className={cn("flex-1 min-h-0 overflow-x-hidden min-w-0 w-full", !isMobile && "pr-6 -mr-6")}>
            <div className="space-y-6 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full">
               <FormField
                control={form.control}
                name="payeeType"
                render={({ field }: any) => (
                    <FormItem className="space-y-3">
                        <FormLabel>Received From</FormLabel>
                        <FormControl>
                            <RadioGroup
                            onValueChange={(value) => {
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
                                <FormControl><RadioGroupItem value={type.value} /></FormControl>
                                <FormLabel className="font-normal">{type.label}</FormLabel>
                              </FormItem>
                            ))}
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
                />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {payeeType === 'party' && (
                     <FormField
                      control={form.control}
                      name="partyId"
                      render={({ field }: any) => (
                        <FormItem>
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
                        {accountBalance !== null && accountBalance !== undefined && <FormLabel className="text-xs text-muted-foreground">Balance: {formatCurrency(accountBalance)}</FormLabel>}
                      </div>
                       <Combobox
                            options={availableAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})` }))}
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
                        />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Top Right: Voucher No. and Date */}
              <div className="flex justify-end gap-4 items-end">
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
                              <BsDatePicker valueAD={field.value} onChangeAD={(d) => { field.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} />
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
                                    <Calendar mode="single" selected={field.value} onSelect={(date) => {field.onChange(date); setIsCalendarOpen(false);}} initialFocus modifiers={{ hasTransactions: transactionDates }} modifiersClassNames={{ hasTransactions: "has-transactions" }} />
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
                name="amount"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Amount Received</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
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
               <FormItem>
                <FormLabel>Attach Files (Optional)</FormLabel>
                 <div className="flex flex-wrap gap-4">
                  {files.map((file, index) => (
                    <FilePreview 
                      key={index} 
                      file={file} 
                      attachmentClientFileUrls={files.filter((f): f is string => typeof f === "string")}
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
              </FormItem>
            </div>
          </ScrollArea>

          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 pt-4 border-t">
            <div className="flex justify-center md:justify-start">
              {voucher && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full md:w-auto">
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
            <div className={cn(
              "grid gap-2",
              voucher ? "grid-cols-2 md:flex md:gap-4" : "grid-cols-3 md:flex md:gap-4"
            )}>
              <Button type="button" onClick={() => voucher ? onVoucherUpdated?.() : onVoucherCreated?.()} className={cn("w-full", BTN_CANCEL_CLASS)}>
                Cancel
              </Button>
               {!voucher && (
                 <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={isLoading} className={cn("w-full", BTN_SAVE_NEW_CLASS)}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                </Button>
              )}
              <Button type="submit" disabled={isLoading || (!!voucher?.id && !isFormDirty)} className={cn("w-full", BTN_SAVE_CLASS)}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
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
    </>
  );
}
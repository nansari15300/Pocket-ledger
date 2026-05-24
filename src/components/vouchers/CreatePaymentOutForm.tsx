
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect, useRef, useCallback, useMemo, useId } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Trash2, Upload, FileText, PlusCircle, Crown, Printer, Link2, History, CheckCircle, Info } from "lucide-react";
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
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import { isLocalOnlyMode } from "@/lib/localMode";
import { preferLocalLedgerReads, shouldAutoFlushOutboxAfterEnqueue } from "@/lib/apkOnlineFirestoreWritePolicy";
import { flushVoucherOutbox } from "@/lib/localVoucherOutbox";
import {
  findVoucherInLocalMirrorByNumberAndType,
  getCompanyDocFromBrowserDb,
  listCompanyDocsFromBrowserDb,
} from "@/lib/localCompanyDocMirror";
import {
  appendLocalOnlyVoucherFilesToUrls,
  shouldDeferStorageIncrementUntilPendingUpload,
  shouldStageNewVoucherFilesAsLocalPending,
} from "@/lib/voucherLocalAttachmentUpload";
import { toast as sonnerToast } from "sonner";
import { replaceVoucherSaveLoadingWithShortSuccess } from "@/lib/voucherSaveUi";
import type { CopyMasterDraftRequestPayload } from "./AddVoucherDialog";
import BsDatePicker from "../ui/BsDatePicker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Staff } from "@/components/staff/types";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { compressVoucherAttachment } from "@/lib/compression";
import { appendCompressedVoucherAttachmentsToState } from "@/lib/appendCompressedVoucherAttachments";
import { AttachmentHoldPasteSurface } from "@/components/vouchers/AttachmentHoldPasteSurface";
import { attachmentMaxBytes, attachmentStillTooLargeToastFields } from "@/lib/attachmentCompressionUi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateTaxDialog } from "@/components/tax/CreateTaxDialog";
import { Combobox } from "@/components/ui/combobox";
import { FilePreview } from "../vouchers/FilePreview";
import { useVouchers } from "@/hooks/useVouchers";
import { CreateExpenseAccountDialog } from "../expenses/CreateExpenseAccountDialog";
import type { ExpenseAccount } from "../expenses/types";
import { Checkbox } from "../ui/checkbox";
import type { DateRange } from "@/components/ui/ad-calendar";
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory, syncBillWiseAllocationsToTargetVouchers, patchVoucherFields, softDeleteVoucherMoveToRecycleBin, voucherRecycleBinDeletedAt } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { VoucherPdfAsImageToggle } from "@/components/vouchers/VoucherPdfAsImageToggle";
import {
  convertPdfAttachmentsToJpegIfEnabled,
  shouldSuggestPdfAsImage,
} from "@/lib/voucherAttachmentPdfAsImage";
import { useAccountBalance } from "@/hooks/useAccountBalance";
import { bankAccountAllowsVoucherMinusBalance } from "@/lib/bankAccountMinusBalancePolicy";
import { useIsMobile } from "@/hooks/use-mobile";
import { useResetLinkStateOnCopyTargetCompany } from "@/hooks/useResetLinkStateOnCopyTargetCompany";
import { useCopyDraftFirstSave } from "@/hooks/useCopyDraftFirstSave";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS, VOUCHER_NARRATION_TEXTAREA_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { LinkPaymentToTxnsDialog } from "@/components/vouchers/LinkPaymentToTxnsDialog";
import { LinkPaymentOutToSalaryDialog } from "@/components/vouchers/LinkPaymentOutToSalaryDialog";
import { LinkPaymentInToPaymentOutDialog } from "@/components/vouchers/LinkPaymentInToPaymentOutDialog";
import { LinkSectionInfoDialog } from "@/components/vouchers/LinkSectionInfoDialog";
import type { Allocation } from "@/lib/payment-allocation-utils";
import { getAllocatedByVoucherIdFromPaymentOuts, getAllocationTotal, getTaxNetAllocatedByVoucherIdFromPaymentOuts, getPaymentInRemaining, hasPaymentLinks, OPENING_BALANCE_VOUCHER_ID } from "@/lib/payment-allocation-utils";
import { allocatePaymentInAmounts } from "@/lib/paymentInAllocation";
import { getOpeningBalanceBaseAmount, SPEND_WISE_OPENING_BALANCE_ID } from "@/lib/spendWiseOpeningBalance";
import { usePaymentOutAllocations } from "@/hooks/usePaymentAllocations";
import { useLinkPaymentToTxnsLinkableCount } from "@/hooks/useLinkPaymentToTxnsLinkableCount";
import { printPaymentVoucherReceipt } from "@/lib/printPaymentVoucherReceipt";
import { Zap } from "lucide-react";

const fileSchema = z.object({
  file: z.custom<File | null>().optional(),
});

const formSchema = z.object({
  payeeType: z.enum(["party", "staff", "tax", "expense", "other"]),
  partyId: z.string().optional(),
  staffId: z.string().optional(),
  taxAccountId: z.string().optional(),
  expenseAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
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
    if (data.payeeType === 'expense' && !data.expenseAccountId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select an expense account.", path: ["expenseAccountId"] });
    }
    if (data.payeeType === 'other' && !data.toAccountId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select To Account (Other).", path: ["toAccountId"] });
    }
});

type PaymentOutFormValues = z.infer<typeof formSchema>;

/** RHF+zod errors को save validation toast के लिए string में बाँधता है */
function formatPaymentOutFormValidationErrors(errors: FieldErrors<PaymentOutFormValues>): string {
  const errorMessages: string[] = [];
  if (errors.payeeType?.message) errorMessages.push(`Payee Type: ${errors.payeeType.message}`);
  if (errors.partyId?.message) errorMessages.push(`Party: ${errors.partyId.message}`);
  if (errors.staffId?.message) errorMessages.push(`Staff: ${errors.staffId.message}`);
  if (errors.taxAccountId?.message) errorMessages.push(`Tax Account: ${errors.taxAccountId.message}`);
  if (errors.expenseAccountId?.message) errorMessages.push(`Expense Account: ${errors.expenseAccountId.message}`);
  if (errors.toAccountId?.message) errorMessages.push(`To Account (Other): ${errors.toAccountId.message}`);
  if (errors.payeeName?.message) errorMessages.push(`Payee Name: ${errors.payeeName.message}`);
  if (errors.accountId?.message) errorMessages.push(`Bank/Cash Account: ${errors.accountId.message}`);
  if (errors.date?.message) errorMessages.push(`Date: ${errors.date.message}`);
  if (errors.voucherNumber?.message) errorMessages.push(`Voucher No.: ${errors.voucherNumber.message}`);
  if (errors.amount?.message) errorMessages.push(`Amount: ${errors.amount.message}`);
  return errorMessages.length > 0 ? errorMessages.join(", ") : "Please check the form and try again.";
}

const getVoucherPrefix = (prefixes?: Record<string, string[]>, type?: 'payment_out' | 'direct_expense') => {
    if (type === 'direct_expense') {
        return (prefixes?.direct_expense && prefixes.direct_expense[0]) || "DEXP-";
    }
    return (prefixes?.payment_out && prefixes.payment_out[0]) || "PYMT-";
}

const getPayeeTypeFromVoucher = (v: any) => {
  if (v?.payeeType === 'staff') return 'staff';
  if (v?.payeeType === 'party') return 'party';
  if (v?.payeeType === 'tax') return 'tax';
  if (v?.payeeType === 'expense') return 'expense';
  if (v?.payeeType === 'other') return 'other';
  if (v?.staffId) return 'staff';
  if (v?.taxAccountId) return 'tax';
  if (v?.type === 'direct_expense') {
    return 'expense';
  }
  if (v?.expenseAccountId) return 'expense';
  if (v?.payeeName) return 'other';
  return 'party';
}

const getInitialFormValues = (voucher?: any): PaymentOutFormValues => {
    if (voucher) {
        const payeeType = getPayeeTypeFromVoucher(voucher);
        const toAccountId = voucher.toAccountId || (payeeType === 'expense' ? voucher.expenseAccountId : '') || "";
        // Copy/cross-company seed me `date` kabhi string/Timestamp miss ho kar InvalidDate ban jata tha — BS picker khali dikhta tha.
        const rawDate = voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date as string | number | Date);
        const safeDate = Number.isFinite(rawDate.getTime()) ? rawDate : startOfDay(new Date());
        // `id` form values me na ghuse — nahi to save path kabhi “edit” samajh leta (copy draft ke baad bhi).
        const { id: _dropVoucherId, ...voucherRest } = voucher as Record<string, unknown>;
        return {
            ...voucherRest,
            payeeType,
            date: safeDate,
            amount: typeof (voucher.total || voucher.amount) === 'string' 
              ? parseFloat(String(voucher.total || voucher.amount).replace(/,/g, '')) || 0
              : Number(voucher.total || voucher.amount || 0),
            partyId: voucher.partyId || "",
            staffId: voucher.staffId || "",
            payeeName: voucher.payeeName || "",
            expenseAccountId: voucher.expenseAccountId || "",
            toAccountId,
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
        expenseAccountId: "",
        toAccountId: ""
    };
};


export function CreatePaymentOutForm({
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
  onEffectiveLinksChange,
  copySaveTargetCompanyId,
  copyMismatchCategories,
  onCopyMissingCategory,
  isCopyingMissingMasters = false,
  copyMasterDraftRequest,
  onRefreshCopyMismatch,
  recurringVoucherSaveBlocked = false,
  recurringVoucherAuxiliaryDirty = false,
}: {
  voucher?: any;
  onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string) => void;
  onOpenHistory?: () => void;
  showHistoryButton?: boolean;
  defaultTab?: 'payment_out' | 'direct_expense';
  defaultVoucherData?: any;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  /** Report effective has-links (bill-wise or spend-wise) so dialog locks fields as soon as user links in this session. */
  onEffectiveLinksChange?: (hasLinks: boolean | undefined) => void;
  copySaveTargetCompanyId?: string;
  copyMismatchCategories?: string[];
  onCopyMissingCategory?: (category: string) => void;
  isCopyingMissingMasters?: boolean;
  copyMasterDraftRequest?: CopyMasterDraftRequestPayload | null;
  /** Save & Copy mismatch list dubara ginti party/bank create ke baad — Copy-* buttons hide hone ke liye. */
  onRefreshCopyMismatch?: () => void | Promise<void>;
  recurringVoucherSaveBlocked?: boolean;
  recurringVoucherAuxiliaryDirty?: boolean;
}) {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS, dateSystem } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedParties, processedPartiesForSelection, processedStaff, processedTaxes, processedStaffGroups, processedAccounts, expenseAccounts } = useVouchers();
  const { company, companyId } = useCompany();
  const { can, role, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  /** Sirf saved + dialog-linked par file band; nayi txn par parent flag ignore. */
  const fileAttachLockedByDialog = !!voucher?.id && deleteDisabledWhenLinked;
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
  const attachFileInputId = useId();
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  /** Naye party save ke turant baad parties sync se pehle stale-master effect `partyId` na wipe kare (Copy-to-voucher / Create Party). */
  const pendingPartyIdUntilInPartiesListRef = useRef<string | null>(null);
  /** Bank/cash create ke baad accounts list sync se pehle stale-master toast avoid. */
  const pendingAccountIdUntilInAccountsListRef = useRef<string | null>(null);
  const pendingStaffIdUntilInStaffListRef = useRef<string | null>(null);
  const pendingTaxIdUntilInTaxesListRef = useRef<string | null>(null);
  const pendingExpenseAccountIdUntilInListRef = useRef<string | null>(null);
  const pendingToAccountIdUntilInListRef = useRef<string | null>(null);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [isCreateExpenseAccountOpen, setIsCreateExpenseAccountOpen] = useState(false);
  const [copyAccountCreateHint, setCopyAccountCreateHint] = useState<string>("");
  const [files, setFiles] = useState<(File|string)[]>([]);
  /** Attach tile: har parent tick par naya `.filter` array na bane — FilePreview blob revoke/flash avoid. */
  const attachmentClientFileUrlsForPreview = useMemo(
    () => files.filter((f): f is string => typeof f === "string"),
    [files]
  );
  const [savePdfAsImage, setSavePdfAsImage] = useState(false);
  const showPdfAsImageToggle = useMemo(
    () =>
      allowAttachments &&
      fileAttachmentLimits.maxFileCount > 0 &&
      (fileAttachmentLimits.allowPDF || shouldSuggestPdfAsImage(files)),
    [allowAttachments, fileAttachmentLimits.maxFileCount, fileAttachmentLimits.allowPDF, files]
  );
  const initialFilesRef = useRef<string[]>([]);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isLinkToTaxDialogOpen, setIsLinkToTaxDialogOpen] = useState(false);
  const [isLinkToSalaryOpen, setIsLinkToSalaryOpen] = useState(false);
  const [linkedPaymentInIds, setLinkedPaymentInIds] = useState<string[]>([]);
  const [isLinkPaymentInDialogOpen, setIsLinkPaymentInDialogOpen] = useState(false);
  // Add/non-linked edit starts collapsed; linked edit auto-expands link sections.
  const [showLinkSections, setShowLinkSections] = useState(false);
  const [linkSectionInfoOpen, setLinkSectionInfoOpen] = useState(false);
  // Block overspending from selected bank/cash account for all roles (including owner).
  const [isAmountMoreThanAccountOpen, setIsAmountMoreThanAccountOpen] = useState(false);
  // Track last valid amount so invalid keystroke can be reverted immediately.
  const lastValidAmountRef = useRef<number>(Number(voucher?.amount ?? voucher?.total ?? 0) || 0);
  const initialLinkedPaymentInIdsRef = useRef<string[]>([]);
  const initialAllocationsRef = useRef<{ voucherId: string; amount: number }[]>([]);
  /** Last voucher id we synced allocations from — avoid overwriting user's Link dialog changes when voucher ref changes (useVouchers refresh). */
  const lastSyncedVoucherIdRef = useRef<string | null>(null);
  /** Last voucher id we reset form for — skip reset when same doc updates (liveVoucher) and user has edits. */
  const lastResetVoucherIdRef = useRef<string | null>(null);

    useEffect(() => {
        setLoading(vouchersLoading);
    }, [vouchersLoading, companyId]);

  useEffect(() => {
    const ids = Array.isArray(voucher?.linkedPaymentInIds) ? [...voucher.linkedPaymentInIds] : [];
    setLinkedPaymentInIds(ids);
    initialLinkedPaymentInIdsRef.current = ids;
  }, [voucher?.id, voucher?.linkedPaymentInIds]);

  const resetLinksOnCopyTargetChange = useCallback(() => {
    setAllocations([]);
    initialAllocationsRef.current = [];
    setLinkedPaymentInIds([]);
    initialLinkedPaymentInIdsRef.current = [];
    setShowLinkSections(false);
    setIsLinkDialogOpen(false);
    setIsLinkToTaxDialogOpen(false);
    setIsLinkToSalaryOpen(false);
    setIsLinkPaymentInDialogOpen(false);
    onEffectiveLinksChange?.(false);
  }, [onEffectiveLinksChange]);
  useResetLinkStateOnCopyTargetCompany(copySaveTargetCompanyId, resetLinksOnCopyTargetChange);

  /** Copy-to draft: pehli save insert; stale savedVoucherId se purana voucher overwrite na ho (same-company Copy To). */
  const {
    resolveVoucherIdForSave,
    isPermissionEdit,
    markCopiedDraftPersisted,
    isCopiedDraftFirstInsert,
  } = useCopyDraftFirstSave(copySaveTargetCompanyId);

  const isEditingAndConverting = voucher && (voucher.type !== 'payment_out' && voucher.type !== 'direct_expense');
  
  const form = useForm<PaymentOutFormValues>({
    resolver: zodResolver(formSchema) as Resolver<PaymentOutFormValues>,
    // Seed form from gallery/default payload so unassigned attachments and defaults hydrate for new voucher.
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
  const _isLinkDirty =
    linkedPaymentInIds.length !== initialLinkedPaymentInIdsRef.current.length ||
    linkedPaymentInIds.some((id, i) => id !== initialLinkedPaymentInIdsRef.current[i]);
  const _isBillWiseLinkDirty = (() => {
    if (allocations.length !== initialAllocationsRef.current.length) return true;
    const cur = allocations.slice().sort((a, b) => a.voucherId.localeCompare(b.voucherId)).map((a) => ({ voucherId: a.voucherId, amount: getAllocationTotal(a) }));
    const init = initialAllocationsRef.current.slice().sort((a, b) => a.voucherId.localeCompare(b.voucherId));
    return cur.some((c, i) => c.voucherId !== init[i]?.voucherId || c.amount !== init[i]?.amount);
  })();
  const isFormDirty =
    _isFormFieldsDirty || _isFileDirty || _isLinkDirty || _isBillWiseLinkDirty || recurringVoucherAuxiliaryDirty;
  const payeeType = form.watch('payeeType');
  /** Copy-draft (Save & Copy To) aur target company selected — red Copy_* buttons dikha sakte hain. */
  const copyDraftMasterHelpersEnabled = Boolean(copySaveTargetCompanyId && onCopyMissingCategory);
  const copyPayeeMasterCategoryArg = (): "party" | "staff" | "tax" | "account_expense" => {
    if (payeeType === "party") return "party";
    if (payeeType === "staff") return "staff";
    if (payeeType === "tax") return "tax";
    return "account_expense";
  };
  const copyPayeeMasterButtonLabel = () => {
    if (payeeType === "party") return "Copy party";
    if (payeeType === "staff") return "Copy staff";
    if (payeeType === "tax") return "Copy tax";
    return "Copy expense ledger";
  };
  useEffect(() => {
    if (!copyMasterDraftRequest) return;
    const req = copyMasterDraftRequest as CopyMasterDraftRequestPayload;
    const targetLabel = req.targetCompanyName || "company";
    const payload = req.sourceRowPayload;
    const sc = String(req.sourceCollection || "");
    const nm = String(req.sourceName || "").trim();
    const hint = (kind: string) =>
      setCopyAccountCreateHint(`Prefilled ${kind} — review & save into "${targetLabel}".`);

    // Pehle poora row (timestamps + profile URLs) — target par naye doc ke saath align.
    if (payload && sc === "parties") {
      hint("party");
      setIsCreatePartyOpen(true);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("prefill-create-party-full", { detail: { rowPayload: payload } }));
      }, 90);
      return;
    }
    if (payload && sc === "bank_accounts") {
      hint("bank/cash account");
      setIsCreateAccountOpen(true);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("prefill-create-bank-account-full", { detail: { rowPayload: payload } }));
      }, 90);
      return;
    }
    if (payload && sc === "expense_accounts") {
      hint("expense ledger");
      setIsCreateExpenseAccountOpen(true);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("prefill-create-expense-account-full", { detail: { rowPayload: payload } }));
      }, 90);
      return;
    }
    // Staff copy chip: source row ka full clone — profile + docs URLs se File staging.
    if (payload && sc === "staff") {
      hint("staff");
      setIsCreateStaffOpen(true);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("prefill-create-staff-full", { detail: { rowPayload: payload } }));
      }, 90);
      return;
    }
    // Tax account copy: full row + attachments (`prefill-create-tax-from-row`).
    if (payload && sc === "taxes") {
      hint("tax");
      setIsCreateTaxOpen(true);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("prefill-create-tax-from-row", { detail: { rowPayload: payload } }));
      }, 90);
      return;
    }

    // Fallback: naam — source row unavailable (network/offline partial load).
    if (!nm) return;
    switch (req.category) {
      case "account":
        // Generic "Fix account" chip remap se — sourceCollection se bank vs expense खोले.
        if (sc === "expense_accounts") {
          hint("expense ledger");
          setIsCreateExpenseAccountOpen(true);
          setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-expense-account-name", { detail: nm })), 80);
          return;
        }
        hint("bank/cash account");
        setIsCreateAccountOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-bank-account-name", { detail: nm })), 80);
        return;
      case "account_bank":
        hint("bank/cash account");
        setIsCreateAccountOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-bank-account-name", { detail: nm })), 80);
        return;
      case "account_expense":
        hint("expense ledger");
        setIsCreateExpenseAccountOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-expense-account-name", { detail: nm })), 80);
        return;
      case "party":
        hint("party");
        setIsCreatePartyOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-party-name", { detail: nm })), 80);
        return;
      case "staff":
        hint("staff");
        setIsCreateStaffOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-staff-name", { detail: nm })), 80);
        return;
      case "tax":
        hint("tax");
        setIsCreateTaxOpen(true);
        setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-tax-name", { detail: nm })), 80);
        return;
      default:
        break;
    }
  }, [copyMasterDraftRequest]);

  const partyId = form.watch("partyId");
  const staffId = form.watch("staffId");
  const taxAccountId = form.watch("taxAccountId");
  const accountId = form.watch("accountId");
  const { displayBalance: accountBalance, account: selectedPayFromAccount } = useAccountBalance(accountId);
  const allowPayFromMinusBalance = bankAccountAllowsVoucherMinusBalance(selectedPayFromAccount);
  const accountOpeningBalance = Number(processedAccounts.find((a: any) => a.id === accountId)?.openingBalance ?? 0) || 0;
  /** Edit par ledger balance is voucher ka outflow pehle se ghata chuka hota hai — same bank par is amount ko wapas jod kar limit nikalo (naya voucher = 0). */
  const bookedPayFromAmountCreditBack = useMemo(() => {
    if (!voucher?.id) return 0;
    if (voucher.type !== "payment_out" && voucher.type !== "direct_expense") return 0;
    const savedPayFromId = (voucher as any).accountId || (voucher as any).fromAccountId;
    if (!savedPayFromId || savedPayFromId !== accountId) return 0;
    return Number((voucher as any).total ?? (voucher as any).amount ?? 0) || 0;
  }, [
    voucher?.id,
    voucher?.type,
    accountId,
    (voucher as any)?.accountId,
    (voucher as any)?.fromAccountId,
    (voucher as any)?.total,
    (voucher as any)?.amount,
  ]);
  const isAmountExceedingSelectedAccount = useCallback(
    (enteredAmount: number) => {
      if (!accountId || allowPayFromMinusBalance) return false;
      const selectedBalance = Number(accountBalance) || 0;
      const effectiveAvailable = selectedBalance + bookedPayFromAmountCreditBack;
      return enteredAmount > effectiveAvailable;
    },
    [accountId, accountBalance, bookedPayFromAmountCreditBack, allowPayFromMinusBalance]
  );

  const expenseAccountId = form.watch("expenseAccountId");
  const toAccountId = form.watch("toAccountId");

  /** Dusri tab/me master delete hone par selected ID stale ho to toast + clear (ghost label avoid). */
  useEffect(() => {
    if (loading || !companyId) return;
    // APK/EXE: company switch baad masters hydrate hone se pehle lists kabhi‑kabhi []; edit IDs mat wipe karo (Payment In jaisa race).
    if (
      voucher?.id &&
      processedParties.length === 0 &&
      processedAccounts.length === 0 &&
      processedStaff.length === 0 &&
      processedTaxes.length === 0 &&
      expenseAccounts.length === 0
    ) {
      return;
    }
    const missing: string[] = [];
    const pid = String(partyId || "").trim();
    if (pid && !processedParties.some((p: any) => p.id === pid)) {
      // Abhi list me nahi = deleted **ya** abhi-abhi create (listener pending) — sirf pehle case me clear.
      if (pendingPartyIdUntilInPartiesListRef.current !== pid) {
        missing.push("party");
        form.setValue("partyId", "");
      }
    }
    const sid = String(staffId || "").trim();
    if (sid && !processedStaff.some((s: any) => s.id === sid)) {
      if (pendingStaffIdUntilInStaffListRef.current !== sid) {
        missing.push("staff");
        form.setValue("staffId", "");
      }
    }
    const tid = String(taxAccountId || "").trim();
    if (tid && !processedTaxes.some((t: any) => t.id === tid)) {
      if (pendingTaxIdUntilInTaxesListRef.current !== tid) {
        missing.push("tax");
        form.setValue("taxAccountId", "");
      }
    }
    const aid = String(accountId || "").trim();
    if (aid && !processedAccounts.some((a: any) => a.id === aid)) {
      if (pendingAccountIdUntilInAccountsListRef.current !== aid) {
        missing.push("bank/cash account");
        form.setValue("accountId", "");
      }
    }
    const eid = String(expenseAccountId || "").trim();
    if (eid && !expenseAccounts.some((e: any) => e.id === eid)) {
      if (pendingExpenseAccountIdUntilInListRef.current !== eid) {
        missing.push("ledger");
        form.setValue("expenseAccountId", "");
      }
    }
    const toAcc = String(toAccountId || "").trim();
    if (payeeType === "other" && toAcc && !expenseAccounts.some((e: any) => e.id === toAcc)) {
      if (pendingToAccountIdUntilInListRef.current !== toAcc) {
        missing.push("ledger");
        form.setValue("toAccountId", "");
      }
    }
    if (missing.length > 0) {
      toast({
        variant: "destructive",
        title: "Master no longer exists",
        description: `Removed: ${[...new Set(missing)].join(", ")}. Select again.`,
      });
    }
  }, [
    loading,
    companyId,
    partyId,
    staffId,
    taxAccountId,
    accountId,
    expenseAccountId,
    toAccountId,
    payeeType,
    processedParties,
    processedStaff,
    processedTaxes,
    processedAccounts,
    expenseAccounts,
    form,
    toast,
  ]);

  /** Pending party ab `processedParties` me aa gaya — ref hatao taaki dubara normal stale check chale. */
  useEffect(() => {
    const pend = pendingPartyIdUntilInPartiesListRef.current;
    if (!pend) return;
    if (processedParties.some((p: any) => p.id === pend)) {
      pendingPartyIdUntilInPartiesListRef.current = null;
    }
  }, [processedParties]);

  /** User ne dropdown se aur party choose kiya — pending create-id waive. */
  useEffect(() => {
    const pend = pendingPartyIdUntilInPartiesListRef.current;
    const pid = String(partyId || "").trim();
    if (pend && pid && pid !== pend) {
      pendingPartyIdUntilInPartiesListRef.current = null;
    }
  }, [partyId]);

  useEffect(() => {
    const pend = pendingAccountIdUntilInAccountsListRef.current;
    if (!pend) return;
    if (processedAccounts.some((a: any) => a.id === pend)) {
      pendingAccountIdUntilInAccountsListRef.current = null;
    }
  }, [processedAccounts]);

  useEffect(() => {
    const pend = pendingAccountIdUntilInAccountsListRef.current;
    const aid = String(accountId || "").trim();
    if (pend && aid && aid !== pend) {
      pendingAccountIdUntilInAccountsListRef.current = null;
    }
  }, [accountId]);

  useEffect(() => {
    const pend = pendingStaffIdUntilInStaffListRef.current;
    if (!pend) return;
    if (processedStaff.some((s: any) => s.id === pend)) {
      pendingStaffIdUntilInStaffListRef.current = null;
    }
  }, [processedStaff]);

  useEffect(() => {
    const pend = pendingStaffIdUntilInStaffListRef.current;
    const sid = String(staffId || "").trim();
    if (pend && sid && sid !== pend) {
      pendingStaffIdUntilInStaffListRef.current = null;
    }
  }, [staffId]);

  useEffect(() => {
    const pend = pendingTaxIdUntilInTaxesListRef.current;
    if (!pend) return;
    if (processedTaxes.some((t: any) => t.id === pend)) {
      pendingTaxIdUntilInTaxesListRef.current = null;
    }
  }, [processedTaxes]);

  useEffect(() => {
    const pend = pendingTaxIdUntilInTaxesListRef.current;
    const tid = String(taxAccountId || "").trim();
    if (pend && tid && tid !== pend) {
      pendingTaxIdUntilInTaxesListRef.current = null;
    }
  }, [taxAccountId]);

  useEffect(() => {
    const pend = pendingExpenseAccountIdUntilInListRef.current;
    if (!pend) return;
    if (expenseAccounts.some((e: any) => e.id === pend)) {
      pendingExpenseAccountIdUntilInListRef.current = null;
    }
  }, [expenseAccounts]);

  useEffect(() => {
    const pend = pendingExpenseAccountIdUntilInListRef.current;
    const eid = String(expenseAccountId || "").trim();
    if (pend && eid && eid !== pend) {
      pendingExpenseAccountIdUntilInListRef.current = null;
    }
  }, [expenseAccountId]);

  useEffect(() => {
    const pend = pendingToAccountIdUntilInListRef.current;
    if (!pend) return;
    if (expenseAccounts.some((e: any) => e.id === pend)) {
      pendingToAccountIdUntilInListRef.current = null;
    }
  }, [expenseAccounts]);

  useEffect(() => {
    const pend = pendingToAccountIdUntilInListRef.current;
    const toAcc = String(toAccountId || "").trim();
    if (pend && toAcc && toAcc !== pend) {
      pendingToAccountIdUntilInListRef.current = null;
    }
  }, [toAccountId]);

  /** Copy-from-source chips: sirf dropdown khali hone par — mismatch naam list me rehne se chip band nahi hota (pehle bug). */
  const showCopyBankFromSource = useMemo(() => {
    if (!copyDraftMasterHelpersEnabled) return false;
    return !String(accountId || "").trim();
  }, [copyDraftMasterHelpersEnabled, accountId]);

  const showCopyPayeeMasterFromSource = useMemo(() => {
    if (!copyDraftMasterHelpersEnabled) return false;
    if (payeeType === "party") return !String(partyId || "").trim();
    if (payeeType === "staff") return !String(staffId || "").trim();
    if (payeeType === "tax") return !String(taxAccountId || "").trim();
    if (payeeType === "expense") return !String(expenseAccountId || "").trim();
    if (payeeType === "other") return !String(toAccountId || "").trim();
    return false;
  }, [
    copyDraftMasterHelpersEnabled,
    payeeType,
    partyId,
    staffId,
    taxAccountId,
    expenseAccountId,
    toAccountId,
  ]);

  /** Copy row label red = jis row par Copy chip hai — `showCopyBank` / `showCopyPayee` ke saath sync. */
  const highlightBankLabelCopyMismatch = showCopyBankFromSource;
  const highlightPayToLabelCopyMismatch = showCopyPayeeMasterFromSource;

  const voucherType = defaultTab === 'direct_expense' ? 'direct_expense' : 'payment_out';
  const spendWiseOppositeEditable =
    (company as { spendWiseOppositeVoucherEditable?: boolean } | null)?.spendWiseOppositeVoucherEditable === true;
  const spendWiseEnabled = (company as { spendWiseEnabled?: boolean } | null)?.spendWiseEnabled === true;
  const requirePaymentLink =
    spendWiseOppositeEditable &&
    (() => {
      const byRole = (company as { requirePaymentLinkByRole?: Record<string, boolean | { payment_out?: boolean; contra?: boolean; direct_expense?: boolean }> } | null)?.requirePaymentLinkByRole?.[role];
      if (byRole === undefined) return false;
      if (typeof byRole === "boolean") return byRole;
      return byRole[voucherType] === true;
    })();
  /** Opposite-voucher master OFF ⇒ spend-wise force band (Firestore `spendWiseEnabled` bhi yahan tame — warna PO save disabled rehta aur UI switch OFF dikhakar confusion). */
  const spendWiseLinkRequired = spendWiseOppositeEditable && (spendWiseEnabled || requirePaymentLink);

  const payeeBalance = useMemo(() => {
    if (payeeType === 'party' && partyId) return processedParties.find(p => p.id === partyId)?.balance;
    if (payeeType === 'staff' && staffId) return processedStaff.find(s => s.id === staffId)?.balance;
    if (payeeType === 'tax' && taxAccountId) return processedTaxes.find(t => t.id === taxAccountId)?.balance;
    if (payeeType === 'expense' && expenseAccountId) return expenseAccounts.find(e => e.id === expenseAccountId)?.balance;
    if (payeeType === 'other' && toAccountId) return expenseAccounts.find(e => e.id === toAccountId)?.balance;
    return null;
  }, [payeeType, partyId, staffId, taxAccountId, expenseAccountId, toAccountId, processedParties, processedStaff, processedTaxes, expenseAccounts]);

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

  const paymentOutAlloc = usePaymentOutAllocations(partyId, allVouchers ?? [], voucher?.id ?? savedVoucherId ?? undefined);

  const totalLinked = useMemo(() => linkedToRows.reduce((s, r) => s + r.amount, 0), [linkedToRows]);

  /** Report effective has-links to dialog: 1 link → fields disabled; all unlink → edit enable. Applies to Party, Staff, Tax, Expense equally. */
  useEffect(() => {
    if (!onEffectiveLinksChange) return;
    const hasLinks = allocations.length > 0 || (linkedPaymentInIds?.length ?? 0) > 0;
    onEffectiveLinksChange(hasLinks);
  }, [onEffectiveLinksChange, allocations.length, linkedPaymentInIds?.length]);

  /** Per target voucher: amount already linked by other payment outs (for "Linked on others" column in bill-wise table). */
  const linkedOnOthersByVoucherId = useMemo(() => {
    const currentId = voucher?.id ?? savedVoucherId;
    const others = (allVouchers ?? []).filter((v: any) => (v.type === "payment_out" || v.type === "direct_expense") && v.id !== currentId);
    return getAllocatedByVoucherIdFromPaymentOuts(others);
  }, [allVouchers, voucher?.id, savedVoucherId]);
  const amountPaid = Number(form.watch("amount")) || 0;
  const remainingToLink = Math.max(0, amountPaid - totalLinked);
  const linkedAmountByPaymentInId = useMemo(() => {
    const map = new Map<string, number>();
    if (!allVouchers?.length || !accountId) return map;
    const currentId = voucher?.id ?? savedVoucherId;
    allVouchers
      .filter(
        (v: any) =>
          // Match spend-wise popup logic: include all out-flow owners for this account (payment out, direct expense, contra out).
          (((v.type === "payment_out" || v.type === "direct_expense") && v.accountId === accountId) ||
            (v.type === "contra" && v.fromAccountId === accountId)) &&
          Array.isArray(v.linkedPaymentInIds) &&
          v.linkedPaymentInIds.length > 0 &&
          v.id !== currentId &&
          !v.isDeleted
      )
      .forEach((po: any) => {
        const poAmt = Number(po.total ?? po.amount ?? 0) || 0;
        const ids = po.linkedPaymentInIds as string[];
        const amounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
        ids.forEach((piId: string) => {
          const add = amounts?.[piId] != null ? Number(amounts[piId]) : poAmt / ids.length;
          map.set(piId, (map.get(piId) ?? 0) + add);
        });
      });
    return map;
  }, [allVouchers, accountId, voucher?.id, savedVoucherId]);
  const isInVoucherForAccount = (x: any, accId: string) =>
    (x.type === "payment_in" && x.accountId === accId) ||
    (x.type === "direct_income" && x.accountId === accId) ||
    (x.type === "contra" && x.toAccountId === accId);
  const linkedPaymentInTotal = useMemo(() => {
    if (!allVouchers?.length || !linkedPaymentInIds?.length || !accountId) return 0;
    return linkedPaymentInIds.reduce((sum, id) => {
      if (id === SPEND_WISE_OPENING_BALANCE_ID) {
        // Opening balance behaves like spend-wise source row on Dr side for Payment Out/Direct Expense.
        const base = getOpeningBalanceBaseAmount(accountOpeningBalance, "dr");
        const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
        const linkable = Math.max(0, base - alreadyLinked);
        return sum + linkable;
      }
      const v = allVouchers.find((x: any) => x.id === id && isInVoucherForAccount(x, accountId));
      const amount = Number(v?.total ?? v?.amount ?? 0) || 0;
      const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
      const linkable = Math.max(0, amount - alreadyLinked);
      return sum + linkable;
    }, 0);
  }, [allVouchers, linkedPaymentInIds, accountId, linkedAmountByPaymentInId, accountOpeningBalance]);
  const amountMatched = amountPaid > 0 && linkedPaymentInTotal >= amountPaid;
  const showLinkPayMode = !!accountId && (voucherType === "payment_out" || voucherType === "direct_expense") && amountPaid > 0;
  const showLinkPayButton = showLinkPayMode && !amountMatched;
  const showSaveAfterLink = showLinkPayMode && amountMatched;
  const isEditPaymentOut = !!(voucher?.id || savedVoucherId) && voucherType === "payment_out";

  /** Bill wise: same count as Link to Cr popup (purchases + payment ins + OB with linkable amount). */
  const billWiseLinkableCountFromPopup = useLinkPaymentToTxnsLinkableCount(
    "payment_out",
    payeeType === "party" ? partyId : null,
    allVouchers ?? [],
    {
      paymentOutId: voucher?.id ?? savedVoucherId ?? undefined,
      existingAllocations: allocations,
      partyOpeningBalance: processedParties.find((p) => p.id === partyId)?.openingBalance ?? 0,
    }
  );
  const staffBillWiseLinkableCount = useMemo(() => {
    if (payeeType !== "staff" || !staffId || !allVouchers?.length) return 0;
    const currentId = voucher?.id ?? savedVoucherId ?? null;
    const otherPaymentOuts = (allVouchers as any[]).filter(
      (v: any) => (v.type === "payment_out" || v.type === "direct_expense") && v.id !== currentId
    );
    const allocatedMap = getTaxNetAllocatedByVoucherIdFromPaymentOuts(otherPaymentOuts);
    const addSalaryCount = (allVouchers as any[])
      .filter((v: any) => v.type === "journal" && v.subType === "add_salary" && Array.isArray(v.entries))
      .filter((v: any) =>
        v.entries.some((e: any) => e.accountId === staffId && (Number(e.credit) || 0) > 0)
      )
      .filter((v: any) => {
        const netTotal = v.entries
          .filter((e: any) => (Number(e.credit) || 0) > 0 && !String(e.narration || "").includes("(Staff ID:"))
          .reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0);
        const allocated = allocatedMap.get(v.id)?.net ?? 0;
        const outstanding = Math.max(0, netTotal - allocated);
        const alreadyLinked = allocations.some((a) => a.voucherId === v.id && getAllocationTotal(a) > 0);
        return outstanding > 0 || alreadyLinked;
      }).length;
    const paymentInCount = (allVouchers as any[])
      .filter((v: any) => (v.type === "payment_in" || v.type === "direct_income") && v.staffId === staffId)
      .filter((v: any) => {
        const allAllocs = (v.allocations as Allocation[] | undefined) || [];
        const allocatedToOthers = currentId
          ? allAllocs.filter((a) => a.voucherId !== currentId).reduce((s, a) => s + getAllocationTotal(a), 0)
          : allAllocs.reduce((s, a) => s + getAllocationTotal(a), 0);
        const currentAllocated = currentId
          ? allAllocs.filter((a) => a.voucherId === currentId).reduce((s, a) => s + getAllocationTotal(a), 0)
          : 0;
        const outstanding = getPaymentInRemaining(v) + currentAllocated;
        const alreadyLinked = allocations.some((a) => a.voucherId === v.id && getAllocationTotal(a) > 0);
        return outstanding > 0 || alreadyLinked;
      }).length;
    // Include staff opening balance row when credit-side OB has pending linkable amount (or already linked in edit).
    const staffOB = Number(processedStaff.find((s: any) => s.id === staffId)?.openingBalance ?? 0) || 0;
    let obCount = 0;
    if (staffOB < 0) {
      const obAmount = Math.abs(staffOB);
      const consumedByOthers = (allVouchers as any[])
        .filter((v: any) => (v.type === "payment_out" || v.type === "direct_expense") && v.staffId === staffId)
        .reduce((sum: number, v: any) => {
          const allocs = (v.allocations as Allocation[] | undefined) || [];
          return sum + allocs.reduce((s: number, a: Allocation) => s + (a.voucherId === OPENING_BALANCE_VOUCHER_ID ? getAllocationTotal(a) : 0), 0);
        }, 0);
      const outstandingOB = Math.max(0, obAmount - consumedByOthers);
      const alreadyLinkedOB = allocations.some((a) => a.voucherId === OPENING_BALANCE_VOUCHER_ID && getAllocationTotal(a) > 0);
      if (outstandingOB > 0 || alreadyLinkedOB) obCount = 1;
    }
    return addSalaryCount + paymentInCount + obCount;
  }, [payeeType, staffId, allVouchers, voucher?.id, savedVoucherId, allocations, processedStaff]);
  const taxBillWiseLinkableCount = useMemo(() => {
    if (payeeType !== "tax" || !taxAccountId || !allVouchers?.length) return 0;
    const currentId = voucher?.id ?? savedVoucherId ?? null;
    const otherPaymentOuts = (allVouchers as any[]).filter(
      (v: any) => (v.type === "payment_out" || v.type === "direct_expense") && v.id !== currentId
    );
    const allocatedByPaymentOuts = getAllocatedByVoucherIdFromPaymentOuts(otherPaymentOuts);
    const allocatedTaxMap = getTaxNetAllocatedByVoucherIdFromPaymentOuts(otherPaymentOuts);
    const salePurchaseCount = (allVouchers as any[])
      .filter((v: any) => (v.type === "sale" || v.type === "sale_service" || v.type === "purchase" || v.type === "purchase_service"))
      .filter((v: any) => String((v as any).taxAccountId ?? "") === String(taxAccountId))
      .filter((v: any) => {
        const taxAmount = Number((v as any).taxAmount ?? 0) || 0;
        const linked = allocatedByPaymentOuts.get(v.id) ?? 0;
        const outstanding = Math.max(0, taxAmount - linked);
        const alreadyLinked = allocations.some((a) => a.voucherId === v.id && getAllocationTotal(a) > 0);
        return outstanding > 0 || alreadyLinked;
      }).length;
    const salaryTaxCount = (allVouchers as any[])
      .filter((v: any) => v.type === "journal" && v.subType === "add_salary" && Array.isArray(v.entries))
      .filter((v: any) => {
        const taxTotal = v.entries
          .filter((e: any) => e.accountId === taxAccountId && (Number(e.credit) || 0) > 0)
          .reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0);
        const linkedTax = allocatedTaxMap.get(v.id)?.tax ?? 0;
        const outstanding = Math.max(0, taxTotal - linkedTax);
        const alreadyLinked = allocations.some((a) => a.voucherId === v.id && getAllocationTotal(a) > 0);
        return outstanding > 0 || alreadyLinked;
      }).length;
    return salePurchaseCount + salaryTaxCount;
  }, [payeeType, taxAccountId, allVouchers, voucher?.id, savedVoucherId, allocations]);
  const billWiseLinkableCount =
    payeeType === "party"
      ? billWiseLinkableCountFromPopup
      : payeeType === "staff"
        ? staffBillWiseLinkableCount
        : payeeType === "tax"
          ? taxBillWiseLinkableCount
          : 0;

  /** Spend wise: count of Payment In / Direct Income / Contra for this account with linkable amount > 0. */
  const spendWiseLinkableCount = useMemo(() => {
    if (!accountId || !allVouchers?.length) return 0;
    const voucherCount = allVouchers.filter((v: any) => {
      if (!isInVoucherForAccount(v, accountId)) return false;
      const amount = Number(v.total ?? v.amount ?? 0) || 0;
      const alreadyLinked = linkedAmountByPaymentInId.get(v.id) ?? 0;
      return amount - alreadyLinked > 0;
    }).length;
    const obBase = getOpeningBalanceBaseAmount(accountOpeningBalance, "dr");
    const obAlreadyLinked = linkedAmountByPaymentInId.get(SPEND_WISE_OPENING_BALANCE_ID) ?? 0;
    const obCount = obBase - obAlreadyLinked > 0 ? 1 : 0;
    // Include Opening Balance row in spend-wise available count when Dr opening has pending linkable amount.
    return voucherCount + obCount;
  }, [accountId, allVouchers, linkedAmountByPaymentInId, accountOpeningBalance]);

  /** Show Link for bill wise card whenever payee is selected; when Link for Bill Wise setting is OFF, linking is optional (card visible, message hidden). */
  const showLinkedSection = (voucherType === "payment_out" || voucherType === "direct_expense") &&
    ((payeeType === "party" && partyId) || (payeeType === "staff" && staffId) || (payeeType === "tax" && taxAccountId));
  const showSpendWiseSection = showLinkPayMode;
  const isEditMode = !!voucher?.id;
  const hasBillWiseLinks = linkedToRows.length > 0;
  const hasSpendWiseLinks = linkedPaymentInIds.length > 0;
  const shouldShowBillWiseSection = showLinkedSection && (showLinkSections || (isEditMode && hasBillWiseLinks));
  const shouldShowSpendWiseSection = showSpendWiseSection && (showLinkSections || (isEditMode && hasSpendWiseLinks));
  const shouldShowAnyLinkSection = shouldShowBillWiseSection || shouldShowSpendWiseSection;
  const shouldShowLinkButton = (showSpendWiseSection || showLinkedSection) && !shouldShowAnyLinkSection;

  useEffect(() => {
    if (isEditMode && (hasBillWiseLinks || hasSpendWiseLinks)) setShowLinkSections(true);
  }, [isEditMode, hasBillWiseLinks, hasSpendWiseLinks]);

  /** When Link for Bill Wise is ON: cannot save without bill-wise link if vouchers available to link (party only). */
  const saveDisabledByBillWise =
    !!company?.enableLinkPaymentToTxns && showLinkedSection && payeeType === "party" && billWiseLinkableCount > 0 && linkedToRows.length === 0;
  /** Spend-wise: sirf tab save roko jab linkable PI hain aur amount (`amountMatched`) choose kiye bina pura allocate nahi hua — varna busy bank par `count>0` hamesha reh sakta aur Save (copy/other company switch ke baad) band rehta. */
  const saveDisabledBySpendWise =
    spendWiseLinkRequired && spendWiseLinkableCount > 0 && showLinkPayMode && !amountMatched;
  const linkPayOthersDisabled = saveDisabledByBillWise || saveDisabledBySpendWise;
  
  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.[voucherType] ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.[voucherType] ?? false;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.[voucherType] ?? false;

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const prefixes = company?.voucherPrefixes?.[voucherType] || [getVoucherPrefix(company.voucherPrefixes, voucherType)];
    const VOUCHER_PREFIX = selectedPrefix || prefixes[0];
    
    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", voucherType));
      let voucherNumbers: string[] = [];
      // APK/static offline: Firestore `getDocs` hang — next number SQLite mirror se (Payment In jaisa path).
      if (isLocalOnlyMode() || (typeof navigator !== "undefined" && !navigator.onLine)) {
        const rows = await listCompanyDocsFromBrowserDb(companyId, "vouchers");
        voucherNumbers = rows
          .filter((r: { type?: string }) => String(r?.type ?? "") === String(voucherType))
          .map((r: { voucherNumber?: string }) => String(r?.voucherNumber ?? ""))
          .filter(Boolean);
      } else {
        const querySnapshot = await getDocs(q);
        voucherNumbers = querySnapshot.docs.map((d) => d.data().voucherNumber as string);
      }
      
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
    if (voucher?.id) {
        const isSameVoucher = lastResetVoucherIdRef.current === voucher.id;
        // Same voucher id — dubara `reset` mat karo (liveVoucher / date edit)
        if (isSameVoucher) return;
        lastResetVoucherIdRef.current = voucher.id;
        const initialValues = getInitialFormValues(voucher);
        if (isEditingAndConverting) {
            initialValues.voucherNumber = "";
        }
        form.reset(initialValues);
        setSavedVoucherId(voucher.id);
        const editUrls = voucher.fileUrls || [];
        setFiles(editUrls);
        initialFilesRef.current = editUrls;
        setSavePdfAsImage(shouldSuggestPdfAsImage(editUrls));
        if (lastSyncedVoucherIdRef.current !== voucher.id) {
          lastSyncedVoucherIdRef.current = voucher.id;
          const allocs = Array.isArray(voucher.allocations) ? voucher.allocations : [];
          setAllocations(allocs);
          initialAllocationsRef.current = allocs.map((a: any) => ({ voucherId: a.voucherId, amount: getAllocationTotal(a) }));
        }
    } else if (defaultVoucherData && !voucher?.id) {
        lastResetVoucherIdRef.current = null;
        // Gallery preload + defaults sirf ek baar — warna `isFormDirty` par effect dubara `setFiles` se locally added File mita deta tha.
        if (lastSyncedVoucherIdRef.current !== "new") {
          lastSyncedVoucherIdRef.current = "new";
          const initialUrls = defaultVoucherData.unassignedFile?.url ? [defaultVoucherData.unassignedFile.url] : (defaultVoucherData.fileUrls || []);
          setFiles(initialUrls);
          initialFilesRef.current = initialUrls.filter((f: any) => typeof f === "string");
          setSavePdfAsImage(shouldSuggestPdfAsImage(initialUrls));
          const allocs = Array.isArray(defaultVoucherData.allocations) ? defaultVoucherData.allocations : [];
          setAllocations(allocs);
          initialAllocationsRef.current = allocs.map((a: any) => ({ voucherId: a.voucherId, amount: getAllocationTotal(a) }));
        }
    }
}, [voucher, defaultVoucherData, form, isEditingAndConverting]);

  // Outbox flush ke baad `local:` → HTTPS: `voucher.fileUrls` sync; same id par reset skip — stale `local:` preview fix (Payment In jaisa).
  useEffect(() => {
    if (!voucher?.id || savedVoucherId !== voucher.id) return;
    const hasUnsavedFilePick = files.some((f) => f instanceof File);
    if (hasUnsavedFilePick) return;
    if (_isFileDirty) return;
    const incoming = (voucher.fileUrls || []).filter((u: unknown): u is string => typeof u === "string");
    const cur = files.filter((f): f is string => typeof f === "string");
    if (JSON.stringify(incoming) === JSON.stringify(cur)) return;
    setFiles(incoming);
    initialFilesRef.current = [...incoming];
  }, [voucher?.id, voucher?.fileUrls, savedVoucherId, files, _isFileDirty]);

  
  useEffect(() => {
    if ((!savedVoucherId || isEditingAndConverting) && isAutoVoucherEnabled) {
      fetchVoucherNumber();
    }
  }, [isAutoVoucherEnabled, savedVoucherId, fetchVoucherNumber, isEditingAndConverting, payeeType]);

  useEffect(() => {
    if (voucherType === 'payment_out' && !['party', 'staff', 'tax'].includes(payeeType)) {
        form.setValue('payeeType', 'party');
    } else if (voucherType === 'direct_expense' && payeeType !== 'expense') {
        form.setValue('payeeType', 'expense');
    }
  }, [payeeType, voucherType, form]);
  
  // Amount guard पहले; फिर validated `data` — nested mobile date + `getValues()` से miss न हो
  function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean; print?: boolean; approveAfterSave?: boolean } = {}) {
    e?.preventDefault?.();
    const enteredAmount = Number(form.getValues("amount")) || 0;
    if (isAmountExceedingSelectedAccount(enteredAmount)) {
      setIsAmountMoreThanAccountOpen(true);
      return;
    }
    void form.handleSubmit(
      async (data) => {
        // Parent `onVoucherAction` dialog band karta hai — save complete hone se *pehle* call karne se unmount + galat company snapshot ho sakta tha (copy-to-company).
        await processAndSave(data, options.saveAndNew, options.print, options.approveAfterSave ? onApprove : undefined, options.approveAfterSave);
      },
      (errors) => {
        sonnerToast.error("Validation Failed", { description: formatPaymentOutFormValidationErrors(errors) });
      }
    )(e);
  }
  
  async function processAndSave(data: PaymentOutFormValues, saveAndNew: boolean = false, print: boolean = false, onSuccess?: () => void, approveAfterSave?: boolean) {
    if (!user || !companyId) {
      sonnerToast.error("Error", { description: "Login and company selection required." });
      return;
    }
    if (voucherType === "payment_out" || voucherType === "direct_expense") {
      if (saveDisabledByBillWise) {
        sonnerToast.error("Link bill wise", { description: "Link for Bill Wise is ON. Please link to purchase(s) first to save." });
        return;
      }
      if (saveDisabledBySpendWise) {
        sonnerToast.error("Link for spend wise", { description: `${spendWiseLinkableCount} voucher(s) available to link — link 1st to save.` });
        return;
      }
      if (linkedPaymentInIds?.length) {
        // Copy-draft pehli save: "current" PO abhi persist nahi — stale id hata ke link math sahi rahe.
        const currentId = isCopiedDraftFirstInsert ? null : (voucher?.id ?? savedVoucherId);
        const linkedByPi = new Map<string, number>();
        allVouchers
          ?.filter(
            (v: any) =>
              // Save-time validation must include contra out links too, same as popup + count logic.
              (((v.type === "payment_out" || v.type === "direct_expense") && v.accountId === data.accountId) ||
                (v.type === "contra" && v.fromAccountId === data.accountId)) &&
              Array.isArray(v.linkedPaymentInIds) &&
              v.linkedPaymentInIds.length > 0 &&
              v.id !== currentId &&
              !v.isDeleted
          )
          .forEach((po: any) => {
            const poAmt = Number(po.total ?? po.amount ?? 0) || 0;
            const ids = po.linkedPaymentInIds as string[];
            const amounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
            ids.forEach((piId: string) => {
              const add = amounts?.[piId] != null ? Number(amounts[piId]) : poAmt / ids.length;
              linkedByPi.set(piId, (linkedByPi.get(piId) ?? 0) + add);
            });
          });
        const accId = data.accountId;
        const isInForAccount = (x: any) =>
          (x.type === "payment_in" && x.accountId === accId) ||
          (x.type === "direct_income" && x.accountId === accId) ||
          (x.type === "contra" && x.toAccountId === accId);
        const linkedTotal = linkedPaymentInIds.reduce((sum, id) => {
          if (id === SPEND_WISE_OPENING_BALANCE_ID) {
            // Save-time validation must include Opening Balance row when user selected it in spend-wise.
            const base = getOpeningBalanceBaseAmount(accountOpeningBalance, "dr");
            const alreadyLinked = linkedByPi.get(id) ?? 0;
            return sum + Math.max(0, base - alreadyLinked);
          }
          const v = allVouchers?.find((x: any) => x.id === id && isInForAccount(x));
          const amount = Number(v?.total ?? v?.amount ?? 0) || 0;
          const alreadyLinked = linkedByPi.get(id) ?? 0;
          const linkable = Math.max(0, amount - alreadyLinked);
          return sum + linkable;
        }, 0);
        // Partial spend-wise linking is allowed; only reject selections that have no usable linkable balance at all.
        if (linkedTotal <= 0) {
          sonnerToast.error("No linkable balance", { description: "Selected spend-wise vouchers do not have any remaining linkable balance." });
          return;
        }
      }
    }
    
    try {
      // Permission check: create or edit (copy draft ki pehli save = create, chahe stale savedVoucherId ho)
      const isEdit = isPermissionEdit(!!voucher?.id, savedVoucherId);
      const voucherDate = data.date instanceof Date ? data.date : new Date(data.date);
      
      if (isEdit) {
        // Check edit permission - determine ownership
        // Offline: `getDoc` network par block — mirror se voucher row (save hang avoid).
        const preferLocalReads = preferLocalLedgerReads();
        const fetchVoucher = async (cid: string, vid: string) => {
          if (preferLocalReads) {
            return await getCompanyDocFromBrowserDb(cid, "vouchers", vid);
          }
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
          const existingVoucher = allVouchers.find((v) => v.id === savedVoucherId);
          if (existingVoucher?.date) {
            originalVoucherDate = existingVoucher.date?.toDate
              ? existingVoucher.date.toDate()
              : new Date(existingVoucher.date);
          } else if (companyId) {
            // Edit date baseline: offline par Firestore read mat karo — mirror row se `date`.
            const preferLocalReadsDate = preferLocalLedgerReads();
            if (preferLocalReadsDate) {
              const row = await getCompanyDocFromBrowserDb(companyId, "vouchers", savedVoucherId);
              if (row?.date != null) {
                originalVoucherDate = (row as { date?: { toDate?: () => Date } }).date?.toDate?.()
                  ? (row as { date: { toDate: () => Date } }).date.toDate()
                  : new Date(row.date as string | number | Date);
              }
            } else {
              const voucherDoc = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, savedVoucherId));
              if (voucherDoc.exists()) {
                const voucherData = voucherDoc.data();
                originalVoucherDate = voucherData.date?.toDate
                  ? voucherData.date.toDate()
                  : new Date(voucherData.date);
              }
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

    const toastId = sonnerToast.loading("Saving payment...");
    setIsLoading(true);

    try {
      const originalVoucherIdToDelete: string | null =
        isEditingAndConverting && voucher?.id ? String(voucher.id) : null;
      const idArgForFirestore = resolveVoucherIdForSave({
        savedVoucherId,
        originalVoucherIdToDelete,
      });

      if (!idArgForFirestore || data.voucherNumber !== voucher?.voucherNumber) {
        // Duplicate check: offline par `getDocs` hang — mirror scan (outbox/SQLite-backed list).
        const preferLocalReads = preferLocalLedgerReads();
        let duplicateOtherId: string | null = null;
        if (preferLocalReads) {
          const hit = await findVoucherInLocalMirrorByNumberAndType(companyId, data.voucherNumber, voucherType);
          if (hit && hit.id !== idArgForFirestore) duplicateOtherId = hit.id;
        } else {
          const q = query(
            collection(firestore, `companies/${companyId}/vouchers`),
            where("voucherNumber", "==", data.voucherNumber),
            where("type", "==", voucherType)
          );
          const existingVoucherSnap = await getDocs(q);
          if (!existingVoucherSnap.empty && existingVoucherSnap.docs[0].id !== idArgForFirestore) {
            duplicateOtherId = existingVoucherSnap.docs[0].id;
          }
        }
        if (duplicateOtherId) {
          sonnerToast.error("Duplicate Voucher Number", { id: toastId, description: "This voucher number is already in use." });
          setIsLoading(false);
          return;
        }
      }
  
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

      let filesForSave = files;
      if (savePdfAsImage) {
        const convToast = sonnerToast.loading("Converting PDF attachments to image…");
        try {
          filesForSave = await convertPdfAttachmentsToJpegIfEnabled(files, true);
        } finally {
          sonnerToast.dismiss(convToast);
        }
      }
      
      const submissionData: any = {
        ...restOfData,
        date: date.toISOString(),
        amount: cleanAmount,
        total: cleanAmount,
        fileUrls: filesForSave.filter(f => typeof f === 'string') as string[],
        type: voucherType
      };
      if (voucherType === 'payment_out') {
        submissionData.allocations = allocations ?? [];
        if (submissionData.payeeType === 'staff' && data.staffId) {
          submissionData.staffId = data.staffId;
        }
        const linkIds = linkedPaymentInIds ?? [];
        submissionData.linkedPaymentInIds = linkIds;
        submissionData.linkedPaymentInAmounts =
          linkIds.length > 0
            ? allocatePaymentInAmounts(cleanAmount, linkIds, allVouchers ?? [], data.accountId, linkedAmountByPaymentInId, accountOpeningBalance)
            : {};
      }
      if (voucherType === 'direct_expense') {
        submissionData.fromAccountId = submissionData.accountId;
        submissionData.payToType = 'EXPENSE';
        submissionData.toAccountId = submissionData.expenseAccountId || submissionData.toAccountId;
        submissionData.expenseAccountId = submissionData.toAccountId;
        if (submissionData.fromAccountId === submissionData.toAccountId) {
          sonnerToast.error("Validation Failed", { id: toastId, description: "From and To account cannot be the same." });
          setIsLoading(false);
          return;
        }
        const linkIds = linkedPaymentInIds ?? [];
        submissionData.linkedPaymentInIds = linkIds;
        submissionData.linkedPaymentInAmounts =
          linkIds.length > 0
            ? allocatePaymentInAmounts(cleanAmount, linkIds, allVouchers ?? [], data.accountId, linkedAmountByPaymentInId, accountOpeningBalance)
            : {};
      }
  
      const sanitizedData = JSON.parse(JSON.stringify(submissionData));
      if (!idArgForFirestore) delete (sanitizedData as { id?: string }).id;
      let preGeneratedVoucherId: string | undefined;
      const newFilesToUpload = filesForSave.filter(f => typeof f !== 'string') as File[];

      if (newFilesToUpload.length > 0) {
        const totalNewBytes = newFilesToUpload.reduce((sum, f) => sum + (f.size || 0), 0);
        const limitCheck = await checkStorageLimit(companyId, company?.planId, { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes }, company?.storageOption);
        if (!limitCheck.allowed) {
          sonnerToast.error("Storage limit reached", { id: toastId, description: limitCheck.message });
          setIsLoading(false);
          return;
        }
        if (await shouldStageNewVoucherFilesAsLocalPending(companyId)) {
          // Copy-draft pehli insert: idArgForFirestore null — local placeholder bhi naya doc id (stale pass-through na ho).
          const voucherIdForLocalAttachments =
            isEditingAndConverting && voucher?.id
              ? null
              : idArgForFirestore ?? null;
          const { fileUrls: merged, preGeneratedVoucherId: preGen } =
            await appendLocalOnlyVoucherFilesToUrls({
              companyId,
              storageFolder: String(voucherType),
              existingFileUrls: sanitizedData.fileUrls as string[],
              newFiles: newFilesToUpload,
              maxFileCount: fileAttachmentLimits.maxFileCount,
              existingVoucherId: voucherIdForLocalAttachments,
            });
          sanitizedData.fileUrls = merged;
          if (preGen) preGeneratedVoucherId = preGen;
          if (!shouldDeferStorageIncrementUntilPendingUpload()) {
            try {
              await incrementCompanyStorage(companyId, {
                attachmentsBytes: totalNewBytes,
                storageBytes: totalNewBytes,
              });
            } catch {
              /* offline */
            }
          }
        } else {
          for (const file of newFilesToUpload) {
            if (sanitizedData.fileUrls.length >= fileAttachmentLimits.maxFileCount) break;
            const storageRef = ref(storage, `voucher-files/${companyId}/${voucherType}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            sanitizedData.fileUrls.push(url);
            await incrementCompanyStorage(companyId, { attachmentsBytes: file.size, storageBytes: file.size });
          }
        }
      }

      const isEdit = !!voucher?.id && !originalVoucherIdToDelete;
      const approverName = customUser?.displayName || user?.displayName || user?.email || user?.uid;
      // Keep a stable "before save" snapshot so target voucher unlink/remove sync works even when props are stale.
      const previousAllocationsForSync: Allocation[] = initialAllocationsRef.current.map((a) => ({ voucherId: a.voucherId, amount: Number(a.amount) || 0 }));
      const savedDoc = await saveVoucher(
        companyId,
        user.uid,
        sanitizedData,
        idArgForFirestore,
        approveAfterSave && isEdit ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined,
        preGeneratedVoucherId ? { preGeneratedVoucherId } : undefined
      );

      if (savedDoc && savedDoc.id) {
          markCopiedDraftPersisted();
          setSavedVoucherId(savedDoc.id);
          const savedLinkIds = Array.isArray(sanitizedData.linkedPaymentInIds) ? [...sanitizedData.linkedPaymentInIds] : [];
          initialLinkedPaymentInIdsRef.current = savedLinkIds;
          if (originalVoucherIdToDelete) {
              // Conversion ke baad original voucher ko local/offline me bhi recycle-bin mark karo.
              await patchVoucherFields(companyId, originalVoucherIdToDelete, {
                isDeleted: true,
                deletedAt: voucherRecycleBinDeletedAt(),
                convertedToType: voucherType,
                convertedToVoucherNumber: sanitizedData.voucherNumber,
              });
          }
      } else {
          throw new Error("Failed to save voucher and get ID.");
      }

        // Bill-wise bilateral: sync allocations to target vouchers (Purchase/Sale/Payment In) so link shows on target too
        if (voucherType === "payment_out" && companyId && savedDoc?.id && Array.isArray(sanitizedData.allocations)) {
          try {
            await syncBillWiseAllocationsToTargetVouchers(companyId, savedDoc.id, sanitizedData.allocations, previousAllocationsForSync);
          } catch (e) {
            console.error(e);
            sonnerToast.error("Payment saved but bill-wise link sync to target vouchers failed.");
          }
        }
        if (voucherType === "payment_out" && Array.isArray(sanitizedData.allocations)) {
          // Refresh baseline after a successful save/sync so next edit can diff/add/remove correctly.
          initialAllocationsRef.current = sanitizedData.allocations.map((a: any) => ({ voucherId: a.voucherId, amount: getAllocationTotal(a) }));
        }
        // Save ke baad string URLs only — `File` rehne par flush/outbox pending delete ke baad preview doosri baar tut-ta tha.
        {
          const persistedUrls = (sanitizedData.fileUrls || []).filter((u: unknown): u is string => typeof u === "string");
          setFiles(persistedUrls);
          initialFilesRef.current = persistedUrls;
        }
        if (shouldAutoFlushOutboxAfterEnqueue()) {
          void flushVoucherOutbox().catch((err) => {
            console.warn("[CreatePaymentOutForm] post-save outbox flush", err);
          });
        }

        const docId = savedDoc.id;
        const approveBanner = !!(approveAfterSave && docId);
        // Save & Close: dialog turant band — approve/alerts/print background (`postSaveTail`).
        if (approveBanner) {
          replaceVoucherSaveLoadingWithShortSuccess(
            toastId,
            isEdit ? "Payment updated and approved." : "Payment saved and approved."
          );
        } else {
          replaceVoucherSaveLoadingWithShortSuccess(
            toastId,
            "Payment Recorded!",
            `Voucher #${data.voucherNumber} has been ${isEdit ? "updated" : "created"}.`
          );
        }
        setIsLoading(false);

        const postSaveTail = async () => {
          if (approveBanner && !isEdit) {
            await approveVoucherWithHistory(companyId, docId, user.uid, approverName);
          }
          if (companyId && company) {
            const vid = docId || voucher?.id;
            if (isEdit) {
              const oldV = voucher as any;
              const changes = getChangedFieldLabels(
                { amount: oldV?.total ?? oldV?.amount, narration: oldV?.narration, date: oldV?.date?.toDate?.() ?? oldV?.date, voucherNumber: oldV?.voucherNumber, accountId: oldV?.accountId, partyId: oldV?.partyId, staffId: oldV?.staffId, expenseAccountId: oldV?.expenseAccountId, toAccountId: oldV?.toAccountId },
                { amount: data.amount, narration: data.narration, date: data.date, voucherNumber: data.voucherNumber, accountId: data.accountId, partyId: data.partyId, staffId: data.staffId, expenseAccountId: data.expenseAccountId, toAccountId: data.toAccountId },
                [
                  { key: "amount", label: "Amount" },
                  { key: "narration", label: "Narration" },
                  { key: "date", label: "Date" },
                  { key: "voucherNumber", label: "Voucher number" },
                  { key: "accountId", label: "Account" },
                  { key: "partyId", label: "Party" },
                  { key: "staffId", label: "Staff" },
                  { key: "expenseAccountId", label: "Expense account" },
                  { key: "toAccountId", label: "To account" },
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

          if (print && docId && company) {
            const payeeLabel =
              data.payeeType === "party"
                ? processedParties.find((p) => p.id === data.partyId)?.name ?? "—"
                : data.payeeType === "staff"
                  ? processedStaff.find((s) => s.id === data.staffId)?.name ?? "—"
                  : data.payeeType === "tax"
                    ? processedTaxes.find((t) => t.id === data.taxAccountId)?.name ?? "—"
                    : data.payeeType === "expense"
                      ? expenseAccounts.find((e) => e.id === data.expenseAccountId)?.name ?? "—"
                      : processedAccounts.find((a) => a.id === data.toAccountId)?.accountName ?? "—";
            const accountLabel = processedAccounts.find((a) => a.id === data.accountId)?.accountName ?? "—";
            try {
              await printPaymentVoucherReceipt({
                company: {
                  name: company.name,
                  pan: company.pan,
                  phone: company.phone,
                  address: company.address,
                  decimalPlaces: company.decimalPlaces,
                  showDrCr: company.showDrCr,
                  showCurrencySymbol: company.showCurrencySymbol,
                  logoUrl: company.logoUrl,
                },
                dateSystem,
                formatDate,
                formatDateBS,
                formatCurrencyForPrint,
                voucherId: docId,
                voucherType,
                date: data.date instanceof Date ? data.date : new Date(data.date),
                voucherNumber: data.voucherNumber,
                amount: cleanAmount,
                narration: data.narration,
                payeeLabel,
                accountLabel,
              });
            } catch (printErr) {
              console.error(printErr);
              sonnerToast.error("Print preview failed", {
                description: printErr instanceof Error ? printErr.message : "Please try again.",
              });
            }
          }

          if (saveAndNew) {
            form.reset(getInitialFormValues());
            setFiles([]);
            setSavePdfAsImage(false);
            setSavedVoucherId(null);
            setAllocations([]);
            setLinkedPaymentInIds([]);
            initialLinkedPaymentInIdsRef.current = [];
            await fetchVoucherNumber();
          }

          onSuccess?.();

          if (saveAndNew) {
            onVoucherAction?.("saved", true, docId);
          }
        };

        if (!saveAndNew) {
          onVoucherAction?.("saved", false, docId);
          void postSaveTail().catch((err) => {
            console.error("[CreatePaymentOutForm] post-save tail", err);
            sonnerToast.error("Payment saved — finishing steps pending", {
              description: err instanceof Error ? err.message : "Alerts or print may still run.",
              duration: 4500,
            });
          });
          return;
        }

        await postSaveTail();
  
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
        // Move-to-bin operation local-first helper ke through run karo.
        await softDeleteVoucherMoveToRecycleBin(companyId, savedVoucherId, user?.uid || "");
        toast({ title: "Voucher Moved to Bin" });
        onVoucherAction?.('cancelled', false, savedVoucherId);
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
        const maxBytes = attachmentMaxBytes();
        const processedFile = await compressVoucherAttachment(file, maxBytes);
        if (processedFile.size > maxBytes) {
          toast({
            variant: "destructive",
            ...attachmentStillTooLargeToastFields(),
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
  const isOwner = user?.uid === company?.ownerId;
  const availableAccounts = processedAccounts.filter(acc => {
    if (!acc.isSpecial) return true;
    if (isOwner || can('manage_special_bank_accounts') || can('view_special_bank_accounts')) {
        return acc.useFor?.out.includes(user?.email || "") ?? true;
    }
    return false;
  });
  // Use the same computed account balances shown above the field; disable non-positive balances in dropdown.
  const bankCashAccountOptions = useMemo(
    () =>
      availableAccounts.map((a: any) => ({
        value: a.id,
        // Keep selected field clean (without balance); show balance only in dropdown list rows.
        triggerLabel: `${a.accountName} (${a.accountType})`,
        // Keep list balance short as requested: "2,000.00 Dr" (no "Balance:" / no currency prefix).
        label: `${a.accountName} (${a.accountType}) — ${formatCurrencyForPrint(Number(a.balance) || 0, { showDrCr: true, noSuffix: true, noAnimation: true })}`,
        isSpecial: a.isSpecial,
        disabled:
          !bankAccountAllowsVoucherMinusBalance(a) && (Number(a.balance) || 0) <= 0,
      })),
    [availableAccounts, formatCurrencyForPrint]
  );
  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.[voucherType] || [getVoucherPrefix()], [company, voucherType]);

  const paymentInDialogNames = useMemo(() => {
    const m: Record<string, string> = {};
    processedParties?.forEach((p) => { m[p.id] = p.name ?? ""; });
    processedStaff?.forEach((s) => { m[s.id] = s.name ?? ""; });
    processedTaxes?.forEach((t) => { m[t.id] = t.name ?? (t as any).label ?? ""; });
    processedAccounts?.forEach((a) => { m[a.id] = a.accountName ?? ""; });
    expenseAccounts?.forEach((e) => { m[e.id] = e.name ?? ""; });
    return m;
  }, [processedParties, processedStaff, processedTaxes, processedAccounts, expenseAccounts]);

  const spendWiseDisplayRows = useMemo(() => {
    if (!showSpendWiseSection || !allVouchers?.length || !linkedPaymentInIds?.length || !accountId) return [];
    const uniqueIds = [...new Set(linkedPaymentInIds)];
    const allocated = allocatePaymentInAmounts(amountPaid, linkedPaymentInIds, allVouchers, accountId, linkedAmountByPaymentInId, accountOpeningBalance);
    return uniqueIds.map((id) => {
      if (id === SPEND_WISE_OPENING_BALANCE_ID) {
        const amount = getOpeningBalanceBaseAmount(accountOpeningBalance, "dr");
        const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
        const linkable = Math.max(0, amount - alreadyLinked);
        return {
          id,
          voucherNumber: "Opening Balance (Dr)",
          date: null as Date | null,
          amount,
          linked: allocated[id] ?? 0,
          linkedOnOthers: alreadyLinked,
          linkable,
          from: "Opening Balance",
        };
      }
      const v = allVouchers.find((x: any) => x.id === id && isInVoucherForAccount(x, accountId));
      if (!v) return null;
      const date = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      const amount = Number(v.total ?? v.amount ?? 0) || 0;
      const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
      const linkable = Math.max(0, amount - alreadyLinked);
      const linkedFromThis = allocated[id] ?? 0;
      const from =
        v.type === "contra"
          ? (paymentInDialogNames[v.fromAccountId] ?? "—")
          : (paymentInDialogNames[v.partyId] ?? paymentInDialogNames[v.staffId] ?? paymentInDialogNames[v.taxAccountId] ?? paymentInDialogNames[v.incomeAccountId] ?? v.payeeName ?? "—");
      return {
        id,
        voucherNumber: v.voucherNumber ?? "—",
        date,
        amount,
        linked: linkedFromThis,
        linkedOnOthers: alreadyLinked,
        linkable,
        from,
      };
    }).filter(Boolean) as { id: string; voucherNumber: string; date: Date | null; amount: number; linked: number; linkedOnOthers: number; linkable: number; from: string }[];
  }, [showSpendWiseSection, allVouchers, linkedPaymentInIds, accountId, amountPaid, linkedAmountByPaymentInId, paymentInDialogNames, accountOpeningBalance]);

  const formDate = form.watch("date");
  const formVoucherNumber = form.watch("voucherNumber");
  /** Current Payment Out as it appears on the opposite voucher (Payment In / Direct Income / Contra in) in their "Link for spend wise (linked to me)" table — one row: this voucher's details (e.g. PYMT-006). */
  const currentVoucherAsOnOppositeRows = useMemo(() => {
    if (!showSpendWiseSection || !accountId) return [];
    const date = formDate;
    const voucherNumber = formVoucherNumber || voucher?.voucherNumber || "—";
    const amt = amountPaid;
    const linked = spendWiseDisplayRows.reduce((s, r) => s + r.linked, 0);
    let toName = "—";
    if (payeeType === "party" && partyId) toName = processedParties.find((p) => p.id === partyId)?.name ?? "—";
    else if (payeeType === "staff" && staffId) toName = processedStaff.find((s) => s.id === staffId)?.name ?? "—";
    else if (payeeType === "tax" && taxAccountId) toName = processedTaxes.find((t) => t.id === taxAccountId)?.name ?? (processedTaxes.find((t) => t.id === taxAccountId) as any)?.label ?? "—";
    else if (payeeType === "expense" && expenseAccountId) toName = expenseAccounts.find((e) => e.id === expenseAccountId)?.name ?? "—";
    else if (payeeType === "other" && toAccountId) toName = expenseAccounts.find((e) => e.id === toAccountId)?.name ?? form.getValues("payeeName") ?? "—";
    return [
      {
        id: "current",
        voucherNumber,
        date: date ? (date instanceof Date ? date : new Date(date)) : null,
        amount: amt,
        linked,
        from: toName,
      },
    ];
  }, [showSpendWiseSection, accountId, formDate, formVoucherNumber, voucher?.voucherNumber, amountPaid, spendWiseDisplayRows, payeeType, partyId, staffId, taxAccountId, expenseAccountId, toAccountId, processedParties, processedStaff, processedTaxes, expenseAccounts, form]);

  /** Summary for Link Payment In dialog: current Payment Out shown at top (like Payment In dialog's current voucher). */
  const paymentOutCurrentVoucherSummary = useMemo(() => {
    if (!showSpendWiseSection || !accountId) return undefined;
    const row = currentVoucherAsOnOppositeRows[0];
    if (row) {
      return {
        voucherNumber: row.voucherNumber,
        date: row.date,
        from: row.from,
        amount: row.amount,
        linkedTotal: Number(row.linked) || 0,
      };
    }
    const voucherNumber = formVoucherNumber || voucher?.voucherNumber || "—";
    const date = formDate ? (formDate instanceof Date ? formDate : new Date(formDate)) : null;
    let toName = "—";
    if (payeeType === "party" && partyId) toName = processedParties.find((p) => p.id === partyId)?.name ?? "—";
    else if (payeeType === "staff" && staffId) toName = processedStaff.find((s) => s.id === staffId)?.name ?? "—";
    else if (payeeType === "tax" && taxAccountId) toName = processedTaxes.find((t) => t.id === taxAccountId)?.name ?? (processedTaxes.find((t) => t.id === taxAccountId) as any)?.label ?? "—";
    else if (payeeType === "expense" && expenseAccountId) toName = expenseAccounts.find((e) => e.id === expenseAccountId)?.name ?? "—";
    else if (payeeType === "other" && toAccountId) toName = expenseAccounts.find((e) => e.id === toAccountId)?.name ?? form.getValues("payeeName") ?? "—";
    const linkedTotal =
      (voucher?.linkedPaymentInAmounts && typeof voucher.linkedPaymentInAmounts === "object"
        ? Object.values(voucher.linkedPaymentInAmounts).reduce((s: number, v: any) => s + (Number(v) || 0), 0)
        : spendWiseDisplayRows.reduce((s: number, r) => s + (Number(r.linked) || 0), 0)) as number;
    return { voucherNumber, date, from: toName, amount: amountPaid, linkedTotal };
  }, [showSpendWiseSection, accountId, currentVoucherAsOnOppositeRows, formVoucherNumber, voucher?.voucherNumber, voucher?.linkedPaymentInAmounts, formDate, payeeType, partyId, staffId, taxAccountId, expenseAccountId, toAccountId, processedParties, processedStaff, processedTaxes, expenseAccounts, form, amountPaid, spendWiseDisplayRows]);
  
  const paymentPayeeTypes = [
    { value: 'party', label: 'Party' },
    { value: 'staff', label: 'Staff' },
    { value: 'tax', label: 'Tax' },
  ];
  const expensePayeeTypes = [
    { value: 'expense', label: 'Expense' },
  ];
  const currentPayeeTypes = voucherType === 'payment_out' ? paymentPayeeTypes : expensePayeeTypes;
  

  return (
    <>
      <Form {...form}>
        <form
          data-suppress-global-copy-red
          onSubmit={(e) => handleFormSubmit(e)}
          className="h-full flex flex-col min-w-0 w-full max-w-full"
        >
          <ScrollArea className={cn("flex-1 overflow-x-hidden min-w-0 w-full", !isMobile && "pr-6 -mr-6")}>
            <div className={cn(
              "space-y-6 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full",
              isMobile ? "" : "px-[2px]"
            )}>
              {/* Section 1 (Date + Voucher No.): unified ribbon tone for payment-out forms. */}
              <div className="rounded-lg border border-sky-400 bg-sky-100 p-2 md:p-3">
              {isMobile ? (
                <>
                  {/* Mobile: Prefix + Voucher No. + Date — `date` को `voucherNumber` के अंदर nest नहीं */}
                  {(() => {
                    const hasPrefix = isPrefixSelectionEnabled && voucherPrefixes.length > 0;
                    const hasDateBS = dateSystem === 'BS' || dateSystem === 'Both';
                    const hasDateAD = dateSystem === 'AD' || dateSystem === 'Both';
                    const colCount = (hasPrefix ? 1 : 0) + 1 + (hasDateBS ? 1 : 0) + (hasDateAD ? 1 : 0);
                    return (
                      <>
                        <div className="grid gap-[2px] w-full min-w-0 max-w-full" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                          <FormField
                            control={form.control}
                            name="voucherNumber"
                            render={({ field: voucherField }: any) => (
                              <>
                                {hasPrefix && (
                                  <FormItem className="min-w-0 w-full overflow-hidden">
                                    <FormLabel className="text-xs truncate">Prefix</FormLabel>
                                    <Select onValueChange={(prefix) => fetchVoucherNumber(prefix)} value={voucherPrefixes.find((p) => voucherField.value?.startsWith(normalizePrefix(p)) || voucherField.value?.startsWith(p)) || voucherPrefixes[0]} disabled={deleteDisabledWhenLinked}>
                                      <SelectTrigger className="h-9 w-full min-w-0 max-w-full text-xs px-1 [&>span]:truncate">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {voucherPrefixes.map((p) => (
                                          <SelectItem key={p} value={p}>
                                            {p}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                                <FormItem className="min-w-0 w-full overflow-hidden">
                                  <FormLabel className="text-xs truncate">Voucher No.</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. PYMT-001" {...voucherField} className="h-9 text-xs px-2 min-w-0 max-w-full truncate w-full" disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                                  </FormControl>
                                </FormItem>
                              </>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="date"
                            render={({ field: dateField }: any) => (
                              <>
                                {hasDateBS && (
                                  <FormItem className="min-w-0 w-full overflow-hidden">
                                    <FormLabel className="text-xs truncate">Date (BS)</FormLabel>
                                    <div className="min-w-0 w-full overflow-hidden">
                                      <BsDatePicker valueAD={dateField.value} onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); dateField.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} className="h-9 text-xs w-full" disabled={deleteDisabledWhenLinked} />
                                    </div>
                                  </FormItem>
                                )}
                                {hasDateAD && (
                                  <FormItem className="min-w-0 w-full overflow-hidden">
                                    <FormLabel className="text-xs truncate">Date</FormLabel>
                                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button variant="outline" className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")} disabled={deleteDisabledWhenLinked}>
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
                              </>
                            )}
                          />
                        </div>
                        <div className="flex flex-col gap-0">
                          <FormField control={form.control} name="voucherNumber" render={() => <FormMessage />} />
                          <FormField control={form.control} name="date" render={() => <FormMessage />} />
                        </div>
                      </>
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
                                disabled={deleteDisabledWhenLinked}
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
                              <Input placeholder="e.g. PYMT-001" {...field} className="h-10" disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
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
                              }} isRange={false} transactionDates={transactionDates} disabled={deleteDisabledWhenLinked} />
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn("h-10 pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                      disabled={deleteDisabledWhenLinked}
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
              </div>

              {/* Section 2 (Account + Amount): keep account/payee controls and amount together. */}
              <div className="rounded-lg border border-emerald-300/80 bg-emerald-50/70 p-2 md:p-3">
              {copyAccountCreateHint && (
                // User ko clear context: yeh create dialog selected target company ke liye open ho raha hai.
                <p className="mb-2 text-[10px] md:text-xs font-semibold text-emerald-700">{copyAccountCreateHint}</p>
              )}
              {isMobile ? (
                <>
                  {/* Mobile: From Bank/Cash in a box (height matches Pay To), Pay To right */}
                  <div className="grid grid-cols-2 gap-2 w-full items-stretch">
                    <div className="h-full min-h-0 rounded-lg border bg-muted/20 p-2 flex flex-col">
                    <FormField
                      control={form.control}
                      name="accountId"
                      render={({ field }: any) => (
                        <FormItem className="min-w-0 flex-1 flex flex-col min-h-0">
                          <div className="flex justify-between items-center mb-1 min-w-0 gap-1">
                            <FormLabel
                              className={cn(
                                "text-[10px] truncate",
                                highlightBankLabelCopyMismatch ? "font-semibold text-red-600" : "text-muted-foreground"
                              )}
                            >
                              From Bank/Cash
                            </FormLabel>
                            <div className="flex items-center gap-1 shrink-0">
                              {showCopyBankFromSource && (
                                // From Bank: target company me same source bank row (full prefill) banana.
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-5 px-1.5 text-[9px] border-rose-300 text-rose-700"
                                  onClick={() => onCopyMissingCategory?.("account_bank")}
                                >
                                  Copy account
                                </Button>
                              )}
                              {accountBalance !== null && <FormLabel className="text-[10px] text-muted-foreground shrink-0">Bal: {formatCurrency(accountBalance, {noAnimation: true, noSuffix: true})}</FormLabel>}
                            </div>
                          </div>
                          <div className="min-w-0 w-full overflow-hidden">
                            <Combobox
                              triggerClassName="w-full min-w-0"
                              options={bankCashAccountOptions}
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
                              // Match contra UX: keep balance segment highlighted in dropdown rows.
                              highlightBalanceInOptions
                              disabled={deleteDisabledWhenLinked}
                            />
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    </div>
                    <div className="space-y-2 min-w-0">
                      <FormField
                        control={form.control}
                        name="payeeType"
                        render={({ field }: any) => (
                          <FormItem className="space-y-2 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <FormLabel className={cn("text-xs", highlightPayToLabelCopyMismatch && "font-semibold text-red-600")}>
                                Pay To
                              </FormLabel>
                              {showCopyPayeeMasterFromSource && (
                                // Pay To: Party/Staff/Tax/Expense ledger ke liye alag naam se copy-master (Purana "Copy this?").
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-5 px-1.5 text-[9px] border-rose-300 text-rose-700"
                                  onClick={() => onCopyMissingCategory?.(copyPayeeMasterCategoryArg())}
                                >
                                  {copyPayeeMasterButtonLabel()}
                                </Button>
                              )}
                            </div>
                            <FormControl>
                              <RadioGroup
                                onValueChange={(value) => {
                                  if (deleteDisabledWhenLinked) return;
                                  field.onChange(value);
                                  form.setValue('partyId', '');
                                  form.setValue('staffId', '');
                                  form.setValue('taxAccountId', '');
                                  form.setValue('expenseAccountId', '');
                                  form.setValue('toAccountId', '');
                                  form.setValue('payeeName', '');
                                }}
                                value={field.value}
                                className="flex flex-wrap gap-x-3 gap-y-1"
                                disabled={deleteDisabledWhenLinked}
                              >
                                {currentPayeeTypes.map(type => (
                                  <FormItem key={type.value} className="flex items-center space-x-2 space-y-0">
                                    <FormControl><RadioGroupItem value={type.value} disabled={deleteDisabledWhenLinked} /></FormControl>
                                    <FormLabel className="font-normal text-xs">{type.label}</FormLabel>
                                  </FormItem>
                                ))}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    {payeeType === 'party' && (
                      <FormField
                        control={form.control}
                        name="partyId"
                        render={({ field }: any) => (
                          <FormItem className="min-w-0">
                            <div className="flex justify-between items-baseline mb-1 min-w-0">
                              <FormLabel className="text-xs truncate">To (Party)</FormLabel>
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
                                placeholder="Select supplier"
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
                              <FormLabel className="text-xs truncate">To (Staff)</FormLabel>
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
                              <FormLabel className="text-xs truncate">To (Tax)</FormLabel>
                              {payeeBalance !== null && payeeBalance !== undefined && (
                                <FormLabel className={cn("text-[10px] font-semibold mr-[2px] shrink-0", payeeBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  {formatCurrencyForPrint(payeeBalance, { noSuffix: true, noAnimation: true })} {payeeBalance >= 0 ? 'Dr' : 'Cr'}
                                </FormLabel>
                              )}
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
                    {payeeType === 'expense' && (
                      <FormField
                        control={form.control}
                        name="expenseAccountId"
                        render={({ field }: any) => (
                          <FormItem className="min-w-0">
                            <div className="flex justify-between items-baseline mb-1 min-w-0">
                              <FormLabel className="text-xs truncate">To (Expense)</FormLabel>
                              {payeeBalance !== null && payeeBalance !== undefined && (
                                <FormLabel className={cn("text-[10px] font-semibold mr-[2px] shrink-0", payeeBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  {formatCurrencyForPrint(payeeBalance, { noSuffix: true, noAnimation: true })} {payeeBalance >= 0 ? 'Dr' : 'Cr'}
                                </FormLabel>
                              )}
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
                                addNewLabel="+ Add New Expense Account"
                                disabled={deleteDisabledWhenLinked}
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-6 min-w-0 items-stretch">
                  <div className="h-full min-h-0 rounded-lg border bg-muted/20 p-3 flex flex-col">
                    <FormField
                      control={form.control}
                      name="accountId"
                      render={({ field }: any) => (
                        <FormItem className="flex flex-col flex-1 min-h-0">
                           <div className="flex justify-between items-center gap-1">
                            <FormLabel
                              className={cn(
                                "text-xs",
                                highlightBankLabelCopyMismatch ? "font-semibold text-red-600" : "text-muted-foreground"
                              )}
                            >
                              From Bank/Cash
                            </FormLabel>
                            <div className="flex items-center gap-2">
                              {showCopyBankFromSource && (
                                // Desktop From Bank/Cash → source bank का पूरा row target में (prefill dialogs).
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] border-rose-300 text-rose-700"
                                  onClick={() => onCopyMissingCategory?.("account_bank")}
                                >
                                  Copy account
                                </Button>
                              )}
                              {accountBalance !== null && <FormLabel className="text-xs text-muted-foreground">Balance: {formatCurrency(accountBalance)}</FormLabel>}
                            </div>
                          </div>
                           <Combobox
                                options={bankCashAccountOptions}
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
                                // Match contra UX: keep balance segment highlighted in dropdown rows.
                                highlightBalanceInOptions
                                disabled={deleteDisabledWhenLinked}
                            />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="space-y-3 min-w-0">
                    <FormField
                      control={form.control}
                      name="payeeType"
                      render={({ field }: any) => (
                        <FormItem className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <FormLabel className={cn(highlightPayToLabelCopyMismatch && "font-semibold text-red-600")}>
                              Pay To
                            </FormLabel>
                            {showCopyPayeeMasterFromSource && (
                              // Desktop Pay To — party/staff/tax/expense ledger copy labels.
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] border-rose-300 text-rose-700"
                                onClick={() => onCopyMissingCategory?.(copyPayeeMasterCategoryArg())}
                              >
                                {copyPayeeMasterButtonLabel()}
                              </Button>
                            )}
                          </div>
                          <FormControl>
                            <RadioGroup
                              onValueChange={(value) => {
                                if (deleteDisabledWhenLinked) return;
                                field.onChange(value);
                                form.setValue('partyId', '');
                                form.setValue('staffId', '');
                                form.setValue('taxAccountId', '');
                                form.setValue('expenseAccountId', '');
                                form.setValue('toAccountId', '');
                                form.setValue('payeeName', '');
                              }}
                              value={field.value}
                              className="flex space-x-4"
                              disabled={deleteDisabledWhenLinked}
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
                  {payeeType === 'party' && (
                    <FormField
                      control={form.control}
                      name="partyId"
                      render={({ field }: any) => (
                        <FormItem>
                          <div className="flex justify-between items-baseline">
                            <FormLabel>To (Party)</FormLabel>
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
                            placeholder="Select a supplier"
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
                                <FormLabel>To (Staff)</FormLabel>
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
                            <FormLabel>To (Tax)</FormLabel>
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
                 {payeeType === 'expense' && (
                    <FormField
                      control={form.control}
                      name="expenseAccountId"
                      render={({ field }: any) => (
                        <FormItem>
                          <div className="flex justify-between items-baseline">
                            <FormLabel>To (Expense)</FormLabel>
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
                                placeholder="Select an expense account"
                                addNewLabel="+ Add New Expense Account"
                                disabled={deleteDisabledWhenLinked}
                            />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                 )}
                  </div>
              </div>
              )}


              <FormField
                control={form.control}
                name="amount"
                render={({ field }: any) => {
                  const hasLinks = allocations.length > 0;
                  const amountDisabled = hasLinks || deleteDisabledWhenLinked;
                  return (
                  <FormItem>
                    <FormLabel>Amount Paid</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        value={field.value ?? ''} 
                        onChange={(e) => {
                          if (amountDisabled) return;
                          const nextAmount = e.target.value === '' ? 0 : Number(e.target.value);
                          // If entered amount exceeds selected account balance, keep previous valid value.
                          if (isAmountExceedingSelectedAccount(nextAmount)) {
                            field.onChange(lastValidAmountRef.current);
                            setIsAmountMoreThanAccountOpen(true);
                            return;
                          }
                          field.onChange(nextAmount);
                          // Persist last valid value so next invalid keystroke can rollback cleanly.
                          lastValidAmountRef.current = nextAmount;
                          if (isAmountExceedingSelectedAccount(nextAmount)) {
                            // Show immediate popup feedback while typing if entered amount exceeds selected account balance.
                            setIsAmountMoreThanAccountOpen(true);
                          }
                        }}
                        disabled={amountDisabled}
                        className={amountDisabled ? "bg-muted" : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                  );
                }}
              />
              </div>
              {/* Section 3 (Attachment + Narration): single grouped container for file + narration fields. */}
              <div className="rounded-lg border border-indigo-300/80 bg-indigo-50 p-3">
              {/* Desktop par narration ko attachment ke right me lane ke liye dono fields ek responsive 2-col grid me. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start min-w-0">
              {/* File pehle — link cards ke upar; warna link ke baad attach band ho jata hai */}
              <FormItem>
                <FormLabel>Attach Files (Optional)</FormLabel>
                {showPdfAsImageToggle && (
                  <VoucherPdfAsImageToggle
                    id="voucher-save-pdf-as-image-payment-out"
                    checked={savePdfAsImage}
                    onCheckedChange={setSavePdfAsImage}
                    disabled={!allowAttachments || fileAttachLockedByDialog || fileAttachmentLimits.maxFileCount === 0}
                    className="mb-2"
                  />
                )}
                <RestrictedFileUploader>
                  {/* When linked: no add/remove; existing files view-only (click to open still works). */}
                  <div className={cn("flex flex-wrap gap-4", fileAttachLockedByDialog && "rounded-md bg-muted/20 p-2")}>
                    {files.map((file, index) => (
                      <FilePreview
                        key={index}
                        file={file}
                        attachmentClientFileUrls={attachmentClientFileUrlsForPreview}
                        onRemove={allowAttachments && !fileAttachLockedByDialog && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((_, i) => i !== index)) : undefined}
                        className={!allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : ""}
                      />
                    ))}
                    {allowAttachments && !fileAttachLockedByDialog && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
                      <>
                        <AttachmentHoldPasteSurface
                          enabled={
                            !editingDisabled &&
                            !fileAttachLockedByDialog &&
                            allowAttachments &&
                            fileAttachmentLimits.maxFileCount > 0
                          }
                          onShortActivate={() => {
                            if (editingDisabled) return;
                            if (fileAttachLockedByDialog || !allowAttachments || fileAttachmentLimits.maxFileCount === 0) return;
                            fileInputRef.current?.click();
                          }}
                          onPastedFiles={(incoming) =>
                            void appendCompressedVoucherAttachmentsToState({
                              incomingFiles: incoming,
                              currentFiles: files,
                              maxFiles: fileAttachmentLimits.maxFileCount || 0,
                              allowImage: fileAttachmentLimits.allowImage,
                              allowPDF: fileAttachmentLimits.allowPDF,
                              setFiles,
                              toast,
                            })
                          }
                          className={cn(
                            "relative w-24 h-24 border-2 border-dashed rounded-lg flex flex-col justify-center items-center transition-colors",
                            allowAttachments && fileAttachmentLimits.maxFileCount > 0
                              ? "text-muted-foreground hover:border-primary cursor-pointer"
                              : "pointer-events-none text-muted-foreground/50 border-muted-foreground/25 cursor-not-allowed opacity-50"
                          )}
                        >
                          <PlusCircle className="h-6 w-6" />
                          <span className="text-xs mt-1">Add File</span>
                        </AttachmentHoldPasteSurface>
                        <Input
                          id={attachFileInputId}
                          type="file"
                          className="sr-only"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept={[
                            fileAttachmentLimits.allowImage ? "image/*" : "",
                            fileAttachmentLimits.allowPDF ? "application/pdf" : ""
                          ].filter(Boolean).join(",") || "image/*,application/pdf"}
                          multiple={fileAttachmentLimits.maxFileCount > 1}
                          disabled={fileAttachLockedByDialog || !allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                        />
                      </>
                    )}
                  </div>
                </RestrictedFileUploader>
              </FormItem>
              {/* Mobile me narration neeche, desktop me right column me show hota hai. */}
              <div className="grid gap-4 min-w-0 max-w-full grid-cols-1">
                {/* Narration stays with attachment: mobile below attachment, desktop at right via section arrangement. */}
                <FormField
                  control={form.control}
                  name="narration"
                  render={({ field }: any) => (
                    <FormItem className="min-w-0 max-w-full">
                      {/* overflow-hidden hata: textarea resize / scroll clip na ho */}
                      <FormLabel>Narration</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional details..." {...field} className={cn(VOUCHER_NARRATION_TEXTAREA_CLASS)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              </div>
              </div>
              {(showSpendWiseSection || showLinkedSection) && (
                <>
                {shouldShowLinkButton && (
                  <div className="pb-1">
                    {/* User-triggered reveal: keep add/new non-linked forms cleaner by default. */}
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowLinkSections(true)}>Show Link</Button>
                  </div>
                )}
                <div className={cn(
                  "grid gap-4 min-w-0 max-w-full",
                  showSpendWiseSection && showLinkedSection && voucherType === "payment_out"
                    ? "grid-cols-1"
                    : showSpendWiseSection && showLinkedSection
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1"
                )}>
                  {/* Payment Out: bill wise first, then spend wise below. Direct Expense: spend wise then bill wise side-by-side on PC */}
                  {/* Bill-wise link card uses rose tone so it differs from spend-wise card color. */}
                  {voucherType === "payment_out" && shouldShowBillWiseSection && (
                    <div
                      className="space-y-2 rounded-lg border-2 border-rose-300/80 bg-rose-50 p-3 min-w-0 w-full max-w-full overflow-hidden [&_span]:truncate [&_.truncate]:text-ellipsis"
                      // Fail-safe: bill-wise section should stay pink in every build target.
                      style={{ backgroundColor: "#fff1f2", borderColor: "#fda4af" }}
                    >
                      <div className="flex items-center gap-2 font-semibold min-w-0 border-b border-border/60 pb-2">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">Link for bill wise</span>
                      </div>
                      {company?.enableLinkPaymentToTxns && (
                        <p className="text-sm text-blue-600">
                          {billWiseLinkableCount > 0
                            ? `${billWiseLinkableCount} voucher${billWiseLinkableCount === 1 ? "" : "s"} available to link, so link 1st to save.`
                            : "You can save this voucher without linking, bcz no voucher to link."}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {/* Keep party/staff/tax bill-wise cards consistent with "x voucher(s) available to link" text. */}
                        {`${billWiseLinkableCount} voucher(s) available to link.`}
                        {linkedToRows.length > 0 && ` ${linkedToRows.length} linked.`}
                      </p>
                      {linkedToRows.length === 0 ? null : (
                        <div className="overflow-x-auto -mx-1 min-w-0 scrollbar-slim-dim-extra">
                          <table className="w-full text-sm border-collapse min-w-[400px]">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-2 font-semibold text-black whitespace-nowrap">Date</th>
                                <th className="text-left p-2 font-semibold text-black whitespace-nowrap">Voucher No.</th>
                                <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Amount</th>
                                <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Linked on others</th>
                                <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Linked on current</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linkedToRows.map((r) => {
                                const targetVoucher = allVouchers?.find((v: any) => v.id === r.voucherId) as any;
                                const billTotal = targetVoucher != null ? Number(targetVoucher?.total ?? targetVoucher?.amount ?? 0) || 0 : 0;
                                const linkedOnOthers = linkedOnOthersByVoucherId.get(r.voucherId) ?? 0;
                                const rowProps = can('edit_link') ? { role: "button" as const, tabIndex: 0, className: "cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 border-b border-border/30 last:border-b-0", onClick: () => (payeeType === "staff" ? setIsLinkToSalaryOpen(true) : payeeType === "tax" ? setIsLinkToTaxDialogOpen(true) : setIsLinkDialogOpen(true)), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); payeeType === "staff" ? setIsLinkToSalaryOpen(true) : payeeType === "tax" ? setIsLinkToTaxDialogOpen(true) : setIsLinkDialogOpen(true); } } } : { className: "border-b border-border/30 last:border-b-0" };
                                return (
                                  <tr key={r.voucherId} {...rowProps}>
                                    <td className="p-2 text-muted-foreground whitespace-nowrap">{r.voucherNumber === "Opening Balance" ? "—" : (r.date ? (dateSystem === "BS" ? formatDateBS(r.date) : formatDate(r.date)) : "—")}</td>
                                    <td className="p-2 font-medium whitespace-nowrap">{r.voucherNumber}</td>
                                    <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(billTotal || r.amount, { noSuffix: true, noAnimation: true })}</td>
                                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(linkedOnOthers, { noSuffix: true, noAnimation: true })}</td>
                                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(r.amount, { noSuffix: true, noAnimation: true })}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="pt-2 border-t flex justify-end min-w-0">
                        <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                            <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                            <span className="truncate text-right whitespace-nowrap leading-tight">{formatCurrency(totalLinked, { noSuffix: true, noAnimation: true })}</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                            <span className="truncate leading-tight">Balance</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                            <span className={cn("truncate text-right whitespace-nowrap leading-tight", remainingToLink === 0 ? "text-green-600 font-semibold" : "")}>
                              {remainingToLink === 0 ? "Settled" : formatCurrency(remainingToLink, { noSuffix: true, noAnimation: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap min-w-0">
                          {payeeType === "party" && can('add_link') && (
                            <>
                              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIsLinkDialogOpen(true)}>
                                <Link2 className="h-4 w-4 mr-2" />
                                Link to Cr
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="w-fit" disabled={remainingToLink <= 0 || paymentOutAlloc.purchasesWithOutstanding.length === 0} onClick={() => { setAllocations(paymentOutAlloc.autoLink(amountPaid)); sonnerToast.success("Auto link applied."); }}>
                                <Zap className="h-4 w-4 mr-2" />
                                Auto Link
                              </Button>
                            </>
                          )}
                          {payeeType === "staff" && can('add_link') && (
                            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIsLinkToSalaryOpen(true)}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Link to Salary
                            </Button>
                          )}
                          {payeeType === "tax" && can('add_link') && (
                            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIsLinkToTaxDialogOpen(true)}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Link to Tax
                            </Button>
                          )}
                        </div>
                      </div>
                  )}
                  {(voucherType === "payment_out" || voucherType === "direct_expense") && shouldShowSpendWiseSection && (
                    <div className="grid grid-cols-1 gap-4 min-w-0 w-full">
                      {/* Left: From Voucher — message inside card when Link for Bill Wise is ON */}
                      {/* Spend-wise link card uses amber tone to keep link sections visually distinct. */}
                      <div
                        className="space-y-2 rounded-lg border-2 border-amber-300/80 bg-amber-50 p-3 min-w-0 w-full max-w-full overflow-hidden"
                        // Fail-safe: spend-wise section should stay amber in every build target.
                        style={{ backgroundColor: "#fffbeb", borderColor: "#fcd34d" }}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 font-medium min-w-0">
                            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">Link for spend wise</span>
                          </div>
                          <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-base font-medium text-blue-700">From Voucher</span>
                        </div>
                        {spendWiseLinkRequired && (
                          <p className="text-sm text-blue-600">
                            {spendWiseLinkableCount > 0
                              ? `${spendWiseLinkableCount} voucher${spendWiseLinkableCount === 1 ? "" : "s"} available to link, so link 1st to save.`
                              : "You can save this voucher without linking, bcz no voucher to link."}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {spendWiseLinkableCount} voucher(s) available to link.
                          {spendWiseDisplayRows.length > 0 && ` ${spendWiseDisplayRows.length} linked.`}
                        </p>
                        {spendWiseDisplayRows.length === 0 ? null : (
                          <div className="overflow-x-auto -mx-1 min-w-0 scrollbar-slim-dim-extra">
                            <table className="w-full text-sm border-collapse min-w-[400px]">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                                  <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                                  <th className="text-left p-2 font-medium whitespace-nowrap">From</th>
                                  <th className="text-right p-2 font-medium whitespace-nowrap">Amount</th>
                                  <th className="text-right p-2 font-medium whitespace-nowrap">Linked on others</th>
                                  <th className="text-right p-2 font-medium whitespace-nowrap">Linked on current</th>
                                </tr>
                              </thead>
                              <tbody>
                                {spendWiseDisplayRows.map((row) => (
                                  <tr key={row.id} className="border-b last:border-b-0">
                                    <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? (dateSystem === "BS" ? formatDateBS(row.date) : formatDate(row.date)) : "—"}</td>
                                    <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber}</td>
                                    <td className="p-2 whitespace-nowrap">{row.from}</td>
                                    <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(row.amount, { noSuffix: true, noAnimation: true })} Dr</td>
                                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(row.linkedOnOthers ?? 0, { noSuffix: true, noAnimation: true })} Dr</td>
                                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(row.linked, { noSuffix: true, noAnimation: true })} Dr</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="pt-2 border-t flex justify-end min-w-0">
                          <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                              <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                              <span className="truncate text-right whitespace-nowrap leading-tight">
                                {formatCurrency(spendWiseDisplayRows.reduce((s, r) => s + r.linked, 0), { noSuffix: true, noAnimation: true })} Dr
                              </span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className="truncate leading-tight">Balance</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className={cn("truncate text-right whitespace-nowrap leading-tight", (() => { const bal = spendWiseDisplayRows.reduce((s, r) => s + (r.amount - r.linked - (r.linkedOnOthers ?? 0)), 0); return bal <= 0 && spendWiseDisplayRows.length > 0; })() ? "text-green-600 font-semibold" : "")}>
                                {(() => {
                                  const fromVoucherBalance = spendWiseDisplayRows.reduce((s, r) => s + (r.amount - r.linked - (r.linkedOnOthers ?? 0)), 0);
                                  return fromVoucherBalance <= 0 && spendWiseDisplayRows.length > 0
                                    ? "Settled"
                                    : `${formatCurrency(Math.max(0, fromVoucherBalance), { noSuffix: true, noAnimation: true })} Dr`;
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 border-t flex flex-wrap gap-2 items-center">
                          <Button type="button" onClick={() => setIsLinkPaymentInDialogOpen(true)} className={cn("w-fit", BTN_SAVE_CLASS)}>
                            <Link2 className="h-4 w-4 mr-2" />
                            Link Pay In
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setLinkSectionInfoOpen(true)} aria-label="Link section information">
                            <Info className="h-4 w-4 shrink-0" />
                            Read me
                          </Button>
                        </div>
                      </div>
                      {/* Requested UX: remove current voucher preview card; keep only From Voucher section for spend-wise. */}
                    </div>
                  )}
                  {/* Non-payment-out spend-wise card keeps same amber tone for consistent section identity. */}
                  {voucherType !== "payment_out" && voucherType !== "direct_expense" && shouldShowSpendWiseSection && (
                    <div
                      className="space-y-2 rounded-lg border-2 border-amber-300/80 bg-amber-50 p-3 min-w-0 w-full max-w-full overflow-hidden"
                      // Fail-safe: non-payment-out spend-wise block keeps same amber identity.
                      style={{ backgroundColor: "#fffbeb", borderColor: "#fcd34d" }}
                    >
                      <div className="flex items-center gap-2 font-medium min-w-0">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">Link for spend wise</span>
                      </div>
                      {spendWiseLinkRequired && (
                        <p className="text-sm text-blue-600">
                          {spendWiseLinkableCount > 0
                            ? `${spendWiseLinkableCount} voucher${spendWiseLinkableCount === 1 ? "" : "s"} available to link, so link 1st to save.`
                            : "You can save this voucher without linking, bcz no voucher to link."}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {spendWiseLinkableCount} voucher(s) available to link.
                        {spendWiseDisplayRows.length > 0 && ` ${spendWiseDisplayRows.length} linked.`}
                      </p>
                      {spendWiseDisplayRows.length === 0 ? null : (
                        <div className="overflow-x-auto -mx-1 min-w-0">
                          <table className="w-full text-sm border-collapse min-w-[480px]">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                                <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                                <th className="text-left p-2 font-medium whitespace-nowrap">From</th>
                                <th className="text-right p-2 font-medium whitespace-nowrap">Amount</th>
                                <th className="text-right p-2 font-medium whitespace-nowrap">Linked</th>
                              </tr>
                            </thead>
                            <tbody>
                              {spendWiseDisplayRows.map((row) => (
                                <tr key={row.id} className="border-b last:border-b-0">
                                  <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? (dateSystem === "BS" ? formatDateBS(row.date) : formatDate(row.date)) : "—"}</td>
                                  <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber}</td>
                                  <td className="p-2 whitespace-nowrap">{row.from}</td>
                                  <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(row.amount, { noSuffix: true, noAnimation: true })} Dr</td>
                                  <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(row.linked, { noSuffix: true, noAnimation: true })} Dr</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="pt-2 border-t flex justify-end min-w-0">
                        <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                            <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                            <span className="truncate text-right whitespace-nowrap leading-tight">
                              {formatCurrency(spendWiseDisplayRows.reduce((s, r) => s + r.linked, 0), { noSuffix: true, noAnimation: true })} Dr
                            </span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                            <span className="truncate leading-tight">Balance</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                            <span className={cn("truncate text-right whitespace-nowrap leading-tight", amountMatched ? "text-green-600 font-semibold" : "")}>
                              {amountMatched ? "Settled" : `${formatCurrency(Math.max(0, amountPaid - spendWiseDisplayRows.reduce((s, r) => s + r.linked, 0)), { noSuffix: true, noAnimation: true })} Dr`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t flex flex-wrap gap-2 items-center">
                        <Button type="button" onClick={() => setIsLinkPaymentInDialogOpen(true)} className={cn("w-fit", BTN_SAVE_CLASS)}>
                          <Link2 className="h-4 w-4 mr-2" />
                          Link Pay In
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setLinkSectionInfoOpen(true)} aria-label="Link section information">
                          <Info className="h-4 w-4 shrink-0" />
                          Read me
                        </Button>
                      </div>
                    </div>
                  )}
                  {/* Bill-wise card keeps rose tone across voucher types for a stable visual pattern. */}
                  {voucherType !== "payment_out" && shouldShowBillWiseSection && (
                    <div
                      className="space-y-2 rounded-lg border-2 border-rose-300/80 bg-rose-50 p-3 min-w-0 w-full max-w-full overflow-hidden [&_span]:truncate [&_.truncate]:text-ellipsis"
                      // Fail-safe: non-payment-out bill-wise block keeps pink identity.
                      style={{ backgroundColor: "#fff1f2", borderColor: "#fda4af" }}
                    >
                      <div className="flex items-center gap-2 font-semibold min-w-0 border-b border-border/60 pb-2">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">Link for bill wise</span>
                      </div>
                      {company?.enableLinkPaymentToTxns && (
                        <p className="text-sm text-blue-600">
                          {billWiseLinkableCount > 0
                            ? `${billWiseLinkableCount} voucher${billWiseLinkableCount === 1 ? "" : "s"} available to link, so link 1st to save.`
                            : "You can save this voucher without linking, bcz no voucher to link."}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {/* Keep party/staff/tax bill-wise cards consistent with "x voucher(s) available to link" text. */}
                        {`${billWiseLinkableCount} voucher(s) available to link.`}
                        {linkedToRows.length > 0 && ` ${linkedToRows.length} linked.`}
                      </p>
                      {linkedToRows.length === 0 ? null : (
                        <div className="overflow-x-auto -mx-1 min-w-0 scrollbar-slim-dim-extra">
                          <table className="w-full text-sm border-collapse min-w-[400px]">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-2 font-semibold text-black whitespace-nowrap">Date</th>
                                <th className="text-left p-2 font-semibold text-black whitespace-nowrap">Voucher No.</th>
                                <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Amount</th>
                                <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Linked on others</th>
                                <th className="text-right p-2 font-semibold text-black whitespace-nowrap">Linked on current</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linkedToRows.map((r) => {
                                const targetVoucher = allVouchers?.find((v: any) => v.id === r.voucherId) as any;
                                const billTotal = targetVoucher != null ? Number(targetVoucher?.total ?? targetVoucher?.amount ?? 0) || 0 : 0;
                                const linkedOnOthers = linkedOnOthersByVoucherId.get(r.voucherId) ?? 0;
                                const rowProps = can('edit_link') ? { role: "button" as const, tabIndex: 0, className: "cursor-pointer hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 border-b border-border/30 last:border-b-0", onClick: () => (payeeType === "staff" ? setIsLinkToSalaryOpen(true) : payeeType === "tax" ? setIsLinkToTaxDialogOpen(true) : setIsLinkDialogOpen(true)), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); payeeType === "staff" ? setIsLinkToSalaryOpen(true) : payeeType === "tax" ? setIsLinkToTaxDialogOpen(true) : setIsLinkDialogOpen(true); } } } : { className: "border-b border-border/30 last:border-b-0" };
                                return (
                                  <tr key={r.voucherId} {...rowProps}>
                                    <td className="p-2 text-muted-foreground whitespace-nowrap">{r.voucherNumber === "Opening Balance" ? "—" : (r.date ? (dateSystem === "BS" ? formatDateBS(r.date) : formatDate(r.date)) : "—")}</td>
                                    <td className="p-2 font-medium whitespace-nowrap">{r.voucherNumber}</td>
                                    <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">{formatCurrency(billTotal || r.amount, { noSuffix: true, noAnimation: true })}</td>
                                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(linkedOnOthers, { noSuffix: true, noAnimation: true })}</td>
                                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(r.amount, { noSuffix: true, noAnimation: true })}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="pt-2 border-t flex justify-end min-w-0">
                        <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                            <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                            <span className="truncate text-right whitespace-nowrap leading-tight">{formatCurrency(totalLinked, { noSuffix: true, noAnimation: true })}</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                            <span className="truncate leading-tight">Balance</span>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                            <span className={cn("truncate text-right whitespace-nowrap leading-tight", remainingToLink === 0 ? "text-green-600 font-semibold" : "")}>
                              {remainingToLink === 0 ? "Settled" : formatCurrency(remainingToLink, { noSuffix: true, noAnimation: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap min-w-0">
                          {payeeType === "party" && can('add_link') && (
                            <>
                              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIsLinkDialogOpen(true)}>
                                <Link2 className="h-4 w-4 mr-2" />
                                Link to Cr
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="w-fit" disabled={remainingToLink <= 0 || paymentOutAlloc.purchasesWithOutstanding.length === 0} onClick={() => { setAllocations(paymentOutAlloc.autoLink(amountPaid)); sonnerToast.success("Auto link applied."); }}>
                                <Zap className="h-4 w-4 mr-2" />
                                Auto Link
                              </Button>
                            </>
                          )}
                          {payeeType === "staff" && can('add_link') && (
                            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIsLinkToSalaryOpen(true)}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Link to Salary
                            </Button>
                          )}
                          {payeeType === "tax" && can('add_link') && (
                            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIsLinkToTaxDialogOpen(true)}>
                              <Link2 className="h-4 w-4 mr-2" />
                              Link to Tax
                            </Button>
                          )}
                        </div>
                      </div>
                  )}
                </div>
                </>
              )}

            </div>
          </ScrollArea>

          <div className={cn(
            "border-t min-w-0 max-w-full overflow-x-hidden",
            isMobile ? "mt-[3px] pt-[3px] pb-[3px] space-y-0" : "pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4"
          )}>
            {isMobile ? (
              <div className={cn("grid grid-cols-3 gap-2 w-full min-w-0", VOUCHER_BUTTONS_CLASS)}>
                {showLinkPayMode ? (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" className="w-full" disabled={!voucher?.id || linkPayOthersDisabled || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                    <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || linkPayOthersDisabled || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS)}>
                      History
                    </Button>
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={linkPayOthersDisabled || isLoading || editingDisabled} className={cn("w-full", BTN_PRINT_CLASS)}>
                      Save & Print
                    </Button>
                    {/* Row: Cancel | Save | Approve (right) */}
                    <Button type="button" onClick={() => { setAllocations(initialAllocationsRef.current.map((a) => ({ voucherId: a.voucherId, amount: a.amount }))); setLinkedPaymentInIds(initialLinkedPaymentInIdsRef.current); onVoucherAction?.('cancelled'); }} className={cn("w-full", BTN_CANCEL_CLASS)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={linkPayOthersDisabled || isLoading || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)} className={cn("w-full", BTN_SAVE_CLASS)}>
                      {isLoading ? "..." : "Save"}
                    </Button>
                    <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={linkPayOthersDisabled || editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                      {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                    </Button>
                  </>
                ) : (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" className="w-full" disabled={!voucher?.id || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                    <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS)}>
                      History
                    </Button>
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={isLoading || editingDisabled} className={cn("w-full", BTN_PRINT_CLASS)}>
                      Save & Print
                    </Button>
                    <Button type="button" onClick={() => { setAllocations(initialAllocationsRef.current.map((a) => ({ voucherId: a.voucherId, amount: a.amount }))); setLinkedPaymentInIds(initialLinkedPaymentInIdsRef.current); onVoucherAction?.('cancelled'); }} className={cn("w-full", BTN_CANCEL_CLASS)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isLoading || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)} className={cn("w-full", BTN_SAVE_CLASS)}>
                      {isLoading ? "..." : "Save"}
                    </Button>
                    <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                      {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                {showLinkPayMode ? (
                  <>
                    <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                      <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || linkPayOthersDisabled || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                        <History className="mr-2 h-4 w-4" /> History
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive" className="w-full md:w-auto shrink-0 rounded-full" disabled={!voucher?.id || linkPayOthersDisabled || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                      <Button type="button" onClick={() => { setAllocations(initialAllocationsRef.current.map((a) => ({ voucherId: a.voucherId, amount: a.amount }))); setLinkedPaymentInIds(initialLinkedPaymentInIdsRef.current); onVoucherAction?.('cancelled'); }} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={(e) => handleFormSubmit(e, { saveAndNew: true })} disabled={linkPayOthersDisabled || !!voucher || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_NEW_CLASS)}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save & New
                      </Button>
                      <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={linkPayOthersDisabled || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_PRINT_CLASS)}>
                        <Printer className="mr-2 h-4 w-4" />
                        Save & Print
                      </Button>
                      <Button type="submit" disabled={linkPayOthersDisabled || isLoading || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                      </Button>
                      {voucher?.id ? (
                        <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={linkPayOthersDisabled || editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                          {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                          {isFormDirty ? "Save & Approve" : "Approve"}
                        </Button>
                      ) : (
                        <Button type="button" onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })} disabled={linkPayOthersDisabled || !showSaveAndApproveOnCreate || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save & Approve
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                      <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                        <History className="mr-2 h-4 w-4" /> History
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive" className="w-full md:w-auto shrink-0 rounded-full" disabled={!voucher?.id || editingDisabled || deleteDisabledWhenLinked || (!!voucher && !canDeleteVoucher(voucher))}>
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
                      <Button type="button" onClick={() => { setAllocations(initialAllocationsRef.current.map((a) => ({ voucherId: a.voucherId, amount: a.amount }))); setLinkedPaymentInIds(initialLinkedPaymentInIdsRef.current); onVoucherAction?.('cancelled'); }} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
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
                      <Button type="submit" disabled={isLoading || editingDisabled || recurringVoucherSaveBlocked || (!!voucher?.id && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                      </Button>
                      {voucher?.id ? (
                        <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
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
              </>
            )}
          </div>
        </form>
      </Form>
      <CreatePartyDialog
        onPartyCreated={(id) => {
          pendingPartyIdUntilInPartiesListRef.current = id;
          setIsCreatePartyOpen(false);
          form.setValue("partyId", id);
          void onRefreshCopyMismatch?.();
        }}
        isOpen={isCreatePartyOpen}
        onOpenChange={setIsCreatePartyOpen}
      />
      <CreateStaffDialog
        onStaffCreated={(id) => {
          pendingStaffIdUntilInStaffListRef.current = id;
          setIsCreateStaffOpen(false);
          form.setValue("staffId", id);
          void onRefreshCopyMismatch?.();
        }}
        isOpen={isCreateStaffOpen}
        onOpenChange={setIsCreateStaffOpen}
        groups={[]}
      >
        <div/>
      </CreateStaffDialog>
       <CreateBankAccountDialog 
        onAccountCreated={(id) => {
            pendingAccountIdUntilInAccountsListRef.current = id;
            setIsCreateAccountOpen(false);
            form.setValue("accountId", id);
            // Copy-create complete hone par helper hint clear karo.
            setCopyAccountCreateHint("");
            void onRefreshCopyMismatch?.();
        }} 
        isOpen={isCreateAccountOpen} 
        onOpenChange={(open) => {
          setIsCreateAccountOpen(open);
          if (!open) setCopyAccountCreateHint("");
        }}
        contextNote={copyAccountCreateHint || undefined}
      />
       <CreateExpenseAccountDialog 
          isOpen={isCreateExpenseAccountOpen} 
          onOpenChange={(open) => {
            setIsCreateExpenseAccountOpen(open);
            if (!open) setCopyAccountCreateHint("");
          }}
          onExpenseAccountCreated={(id) => {
            setIsCreateExpenseAccountOpen(false);
            if (form.getValues("payeeType") === "other") {
              pendingToAccountIdUntilInListRef.current = id;
              form.setValue("toAccountId", id);
            } else {
              pendingExpenseAccountIdUntilInListRef.current = id;
              form.setValue("expenseAccountId", id);
            }
            // Copy-create complete hone par helper hint clear karo.
            setCopyAccountCreateHint("");
            void onRefreshCopyMismatch?.();
        }} >
          <div/>
        </CreateExpenseAccountDialog>
       <CreateTaxDialog 
        onTaxCreated={(id) => {
          pendingTaxIdUntilInTaxesListRef.current = id;
          setIsCreateTaxOpen(false);
          form.setValue("taxAccountId", id);
          void onRefreshCopyMismatch?.();
        }} 
        isOpen={isCreateTaxOpen} 
        onOpenChange={setIsCreateTaxOpen}
      />
      {voucherType === "payment_out" && partyId && (
        <LinkPaymentToTxnsDialog
          isOpen={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
          variant="payment_out"
          partyId={partyId}
          partyName={processedParties.find((p) => p.id === partyId)?.name ?? "Party"}
          receivedAmount={Number(form.watch("amount")) || 0}
          existingAllocations={allocations}
          paymentOutId={voucher?.id ?? savedVoucherId ?? undefined}
          accountId={form.watch("accountId") || undefined}
          paymentOutVoucherNumber={form.watch("voucherNumber") || undefined}
          paymentOutDate={form.watch("date")}
          partyOpeningBalance={processedParties.find((p) => p.id === partyId)?.openingBalance ?? 0}
          dialogTitle="Link Payment Out to Linkable Cr Txns"
          onDone={(allocs, _amount) => {
            // Link save only on local; server save when user clicks Save on voucher
            setAllocations(allocs);
          }}
        />
      )}
      {voucherType === "payment_out" && staffId && (
        <LinkPaymentOutToSalaryDialog
          isOpen={isLinkToSalaryOpen}
          onOpenChange={setIsLinkToSalaryOpen}
          staffId={staffId}
          staffName={processedStaff.find((s) => s.id === staffId)?.name ?? "Staff"}
          paymentOutId={voucher?.id ?? savedVoucherId ?? null}
          amountPaid={amountPaid}
          existingAllocations={allocations}
          staffOpeningBalance={processedStaff.find((s) => s.id === staffId)?.openingBalance ?? 0}
          paymentOutVoucherNumber={form.watch("voucherNumber") || undefined}
          paymentOutDate={form.watch("date")}
          onDone={setAllocations}
        />
      )}
      {voucherType === "payment_out" && taxAccountId && (
        <Dialog open={isLinkToTaxDialogOpen} onOpenChange={setIsLinkToTaxDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Link payment to tax</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Allocate this payment out to vouchers with outstanding tax for {processedTaxes.find((t) => t.id === taxAccountId)?.name ?? (processedTaxes.find((t) => t.id === taxAccountId) as any)?.label ?? "selected tax"} (e.g. Add Salary tax, sale/purchase tax). This flow mirrors Link to Cr for party.
            </p>
            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setIsLinkToTaxDialogOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {accountId && (voucherType === "payment_out" || voucherType === "direct_expense") && (
        <LinkPaymentInToPaymentOutDialog
          isOpen={isLinkPaymentInDialogOpen}
          onOpenChange={setIsLinkPaymentInDialogOpen}
          accountId={accountId}
          vouchers={allVouchers ?? []}
          selectedIds={linkedPaymentInIds}
          onConfirm={(ids) => setLinkedPaymentInIds([...new Set(ids)])}
          names={paymentInDialogNames}
          requiredAmount={amountPaid}
          currentVoucherId={voucher?.id ?? savedVoucherId ?? undefined}
          currentVoucherLinkedAmounts={
            voucher?.linkedPaymentInAmounts && typeof voucher.linkedPaymentInAmounts === "object"
              ? voucher.linkedPaymentInAmounts
              : {}
          }
          accountName={processedAccounts?.find((a: any) => a.id === accountId)?.accountName ?? undefined}
          accountOpeningBalance={accountOpeningBalance}
          currentVoucherSummary={paymentOutCurrentVoucherSummary}
        />
      )}
      <LinkSectionInfoDialog open={linkSectionInfoOpen} onOpenChange={setLinkSectionInfoOpen} />
      <Dialog open={isAmountMoreThanAccountOpen} onOpenChange={setIsAmountMoreThanAccountOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cannot save voucher</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Amount is more than selected account balance.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}


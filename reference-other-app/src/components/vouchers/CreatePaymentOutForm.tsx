
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
import { runFiscalVoucherPreflight } from "@/lib/fiscalVoucherEditGuards";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
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
import type { DateRange } from "@/components/ui/ad-calendar";
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory, syncBillWiseAllocationsToTargetVouchers } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { useAccountBalance } from "@/hooks/useAccountBalance";
import { useIsMobile } from "@/hooks/use-mobile";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
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

const getVoucherPrefix = (prefixes?: Record<string, string[]>, type?: 'payment_out' | 'direct_expense') => {
    if (type === 'direct_expense') {
        return (prefixes?.direct_expense && prefixes.direct_expense[0]) || "DEXP-";
    }
    return (prefixes?.payment_out && prefixes.payment_out[0]) || "PYMT-";
}
const MAX_FILE_SIZE_MB = 0.5;

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
        return {
            ...voucher,
            payeeType,
            date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date),
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
}) {
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS, dateSystem } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedParties, processedPartiesForSelection, processedStaff, processedTaxes, processedStaffGroups, processedAccounts, expenseAccounts } = useVouchers();
  const { company, companyId, triggerSync } = useCompany();
  const { can, role, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
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
  const [isLinkToTaxDialogOpen, setIsLinkToTaxDialogOpen] = useState(false);
  const [isLinkToSalaryOpen, setIsLinkToSalaryOpen] = useState(false);
  const [linkedPaymentInIds, setLinkedPaymentInIds] = useState<string[]>([]);
  const [isLinkPaymentInDialogOpen, setIsLinkPaymentInDialogOpen] = useState(false);
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
  const isFormDirty = _isFormFieldsDirty || _isFileDirty || _isLinkDirty || _isBillWiseLinkDirty;
  const payeeType = form.watch('payeeType');
  const partyId = form.watch("partyId");
  const staffId = form.watch("staffId");
  const taxAccountId = form.watch("taxAccountId");
  const accountId = form.watch("accountId");
  const { displayBalance: accountBalance } = useAccountBalance(accountId);
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
      if (!accountId) return false;
      const selectedBalance = Number(accountBalance) || 0;
      const effectiveAvailable = selectedBalance + bookedPayFromAmountCreditBack;
      return enteredAmount > effectiveAvailable;
    },
    [accountId, accountBalance, bookedPayFromAmountCreditBack]
  );

  const expenseAccountId = form.watch("expenseAccountId");
  const toAccountId = form.watch("toAccountId");
  
  const voucherType = defaultTab === 'direct_expense' ? 'direct_expense' : 'payment_out';
  const spendWiseEnabled = (company as { spendWiseEnabled?: boolean } | null)?.spendWiseEnabled === true;
  const requirePaymentLink = (() => {
    const byRole = (company as { requirePaymentLinkByRole?: Record<string, boolean | { payment_out?: boolean; contra?: boolean; direct_expense?: boolean }> } | null)?.requirePaymentLinkByRole?.[role];
    if (byRole === undefined) return false;
    if (typeof byRole === "boolean") return byRole;
    return byRole[voucherType] === true;
  })();

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

  /** Report effective has-links to dialog — align with hasPaymentLinks: only positive bill-wise rows / real spend ids; stub rows must not lock edit. */
  useEffect(() => {
    if (!onEffectiveLinksChange) return;
    const hasBill = allocations.some((a) => getAllocationTotal(a) > 0);
    const hasSpend = (linkedPaymentInIds ?? []).some(Boolean);
    onEffectiveLinksChange(hasBill || hasSpend);
  }, [onEffectiveLinksChange, allocations, linkedPaymentInIds]);

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

  /** When Link for Bill Wise is ON: cannot save without bill-wise link if vouchers available to link (party only). */
  const saveDisabledByBillWise =
    !!company?.enableLinkPaymentToTxns && showLinkedSection && payeeType === "party" && billWiseLinkableCount > 0 && linkedToRows.length === 0;
  /** When Require Payment In link (switch ON): compulsory — disable Save until linkable count is 0 (like bill wise). */
  const saveDisabledBySpendWise = requirePaymentLink && spendWiseLinkableCount > 0;
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
    if (voucher?.id) {
        const isSameVoucher = lastResetVoucherIdRef.current === voucher.id;
        // Avoid overwriting user's in-progress edits when liveVoucher updates (same doc from Firestore).
        // Fixes: unlink → change account/amount/files → save (was resetting and losing changes).
        if (isSameVoucher && isFormDirty) return;
        lastResetVoucherIdRef.current = voucher.id;
        const initialValues = getInitialFormValues(voucher);
        if (isEditingAndConverting) {
            initialValues.voucherNumber = "";
        }
        form.reset(initialValues);
        setSavedVoucherId(voucher.id);
        setFiles(voucher.fileUrls || []);
        initialFilesRef.current = voucher.fileUrls || [];
        if (lastSyncedVoucherIdRef.current !== voucher.id) {
          lastSyncedVoucherIdRef.current = voucher.id;
          const allocs = Array.isArray(voucher.allocations) ? voucher.allocations : [];
          setAllocations(allocs);
          initialAllocationsRef.current = allocs.map((a: any) => ({ voucherId: a.voucherId, amount: getAllocationTotal(a) }));
        }
    } else if (defaultVoucherData && !voucher?.id) {
        lastResetVoucherIdRef.current = null;
        // For Gallery -> Unassigned "Attach to ...", preload selected file URL into local files state.
        const initialUrls = defaultVoucherData.unassignedFile?.url ? [defaultVoucherData.unassignedFile.url] : (defaultVoucherData.fileUrls || []);
        setFiles(initialUrls);
        initialFilesRef.current = initialUrls.filter((f: any) => typeof f === 'string');
        if (lastSyncedVoucherIdRef.current !== "new") {
          lastSyncedVoucherIdRef.current = "new";
          const allocs = Array.isArray(defaultVoucherData.allocations) ? defaultVoucherData.allocations : [];
          setAllocations(allocs);
          initialAllocationsRef.current = allocs.map((a: any) => ({ voucherId: a.voucherId, amount: getAllocationTotal(a) }));
        }
    }
}, [voucher, defaultVoucherData, form, isEditingAndConverting, isFormDirty]);

  
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
  
  async function handleFormSubmit(e: React.FormEvent, options: { saveAndNew?: boolean, print?: boolean, approveAfterSave?: boolean } = {}) {
    e?.preventDefault?.();
    const enteredAmount = Number(form.getValues("amount")) || 0;
    if (isAmountExceedingSelectedAccount(enteredAmount)) {
      // Stop save when typed amount is higher than currently selected account balance.
      setIsAmountMoreThanAccountOpen(true);
      return;
    }
    const isValid = await form.trigger();
    if (!isValid) {
      const errors = form.formState.errors;
      const errorMessages: string[] = [];

      if (errors.payeeType) errorMessages.push(`Payee Type: ${errors.payeeType.message}`);
      if (errors.partyId) errorMessages.push(`Party: ${errors.partyId.message}`);
      if (errors.staffId) errorMessages.push(`Staff: ${errors.staffId.message}`);
      if (errors.taxAccountId) errorMessages.push(`Tax Account: ${errors.taxAccountId.message}`);
      if (errors.expenseAccountId) errorMessages.push(`Expense Account: ${errors.expenseAccountId.message}`);
      if (errors.toAccountId) errorMessages.push(`To Account (Other): ${errors.toAccountId.message}`);
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
        const currentId = voucher?.id ?? savedVoucherId;
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
      // Permission check: create or edit
      const isEdit = !!voucher?.id || !!savedVoucherId;
      const voucherDate = data.date instanceof Date ? data.date : new Date(data.date);
      
      let originalVoucherDate: Date = voucherDate;
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

      const fp = runFiscalVoucherPreflight({
        company,
        can,
        isEditing: isEdit,
        recordDate: voucherDate,
        originalVoucherDate: isEdit ? originalVoucherDate : null,
      });
      if (fp.ok === false) {
        if (fp.message) sonnerToast.error("Permission Denied", { description: fp.message });
        return;
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
      // Keep a stable "before save" snapshot so target voucher unlink/remove sync works even when props are stale.
      const previousAllocationsForSync: Allocation[] = initialAllocationsRef.current.map((a) => ({ voucherId: a.voucherId, amount: Number(a.amount) || 0 }));
      const savedDoc = await saveVoucher(
        companyId,
        user.uid,
        sanitizedData,
        originalVoucherIdToDelete ? null : savedVoucherId,
        approveAfterSave && isEdit ? { approvedByUserId: user.uid, approvedByName: approverName } : undefined
      );

      if (savedDoc && savedDoc.id) {
          setSavedVoucherId(savedDoc.id);
          const savedLinkIds = Array.isArray(sanitizedData.linkedPaymentInIds) ? [...sanitizedData.linkedPaymentInIds] : [];
          initialLinkedPaymentInIdsRef.current = savedLinkIds;
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

        if (approveAfterSave && savedDoc?.id) {
          if (!isEdit) {
            await approveVoucherWithHistory(companyId, savedDoc.id, user.uid, approverName);
          }
          sonnerToast.success(isEdit ? "Payment updated and approved." : "Payment saved and approved.", { id: toastId });
        } else {
          sonnerToast.success(
            "Payment Recorded!",
            { id: toastId, description: `Voucher #${data.voucherNumber} has been ${isEdit ? "updated" : "created"}.` }
          );
        }

        triggerSync();

        if (companyId && company) {
          const vid = savedVoucherId || voucher?.id;
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

        if (print && savedDoc?.id && company) {
          // Same in-app PDF preview as Payment In / reports (mobile WebView fix)
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
              voucherId: savedDoc.id,
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
            setSavedVoucherId(null);
            setAllocations([]);
            setLinkedPaymentInIds([]);
            initialLinkedPaymentInIdsRef.current = [];
            await fetchVoucherNumber();
        }

        onSuccess?.();
  
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
        disabled: (Number(a.balance) || 0) <= 0,
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
                                      <Select
                                        onValueChange={(prefix) => fetchVoucherNumber(prefix)}
                                        value={voucherPrefixes.find(p => voucherField.value?.startsWith(normalizePrefix(p)) || voucherField.value?.startsWith(p)) || voucherPrefixes[0]}
                                        disabled={deleteDisabledWhenLinked}
                                      >
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
                                      <Input placeholder="e.g. PYMT-001" {...voucherField} className="h-9 text-xs px-2 min-w-0 max-w-full truncate w-full" disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                                    </FormControl>
                                  </FormItem>
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
                          <div className="flex justify-between items-baseline mb-1 min-w-0">
                            <FormLabel className="text-[10px] text-muted-foreground truncate">From Bank/Cash</FormLabel>
                            {accountBalance !== null && <FormLabel className="text-[10px] text-muted-foreground shrink-0">Bal: {formatCurrency(accountBalance, {noAnimation: true, noSuffix: true})}</FormLabel>}
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
                            <FormLabel className="text-xs">Pay To</FormLabel>
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
                           <div className="flex justify-between items-baseline">
                            <FormLabel className="text-xs text-muted-foreground">From Bank/Cash</FormLabel>
                            {accountBalance !== null && <FormLabel className="text-xs text-muted-foreground">Balance: {formatCurrency(accountBalance)}</FormLabel>}
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
                          <FormLabel>Pay To</FormLabel>
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
                  const hasLinks = allocations.some((a) => getAllocationTotal(a) > 0);
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
              {/* File pehle — link cards ke upar; warna link ke baad attach band ho jata hai */}
              <FormItem>
                <FormLabel>Attach Files (Optional)</FormLabel>
                <RestrictedFileUploader>
                  {/* When linked: no add/remove; existing files view-only (click to open still works). */}
                  <div className={cn("flex flex-wrap gap-4", deleteDisabledWhenLinked && "rounded-md bg-muted/20 p-2")}>
                    {files.map((file, index) => (
                      <FilePreview
                        key={index}
                        file={file}
                        onRemove={allowAttachments && !deleteDisabledWhenLinked && fileAttachmentLimits.maxFileCount > 0 && fileAttachmentLimits.allowDelete ? () => setFiles(prev => prev.filter((_, i) => i !== index)) : undefined}
                        className={!allowAttachments || fileAttachmentLimits.maxFileCount === 0 ? "pointer-events-none opacity-60" : ""}
                      />
                    ))}
                    {allowAttachments && !deleteDisabledWhenLinked && fileAttachmentLimits.maxFileCount > 0 && files.length < fileAttachmentLimits.maxFileCount && (
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
                          disabled={deleteDisabledWhenLinked || !allowAttachments || fileAttachmentLimits.maxFileCount === 0}
                        />
                      </div>
                    )}
                  </div>
                </RestrictedFileUploader>
              </FormItem>
              {(showSpendWiseSection || showLinkedSection) && (
                <>
                <div className={cn(
                  "grid gap-4 min-w-0 max-w-full",
                  showSpendWiseSection && showLinkedSection && voucherType === "payment_out"
                    ? "grid-cols-1"
                    : showSpendWiseSection && showLinkedSection
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1"
                )}>
                  {/* Payment Out: bill wise first, then spend wise below. Direct Expense: spend wise then bill wise side-by-side on PC */}
                  {voucherType === "payment_out" && showLinkedSection && (
                    <div className="space-y-2 rounded-lg border-2 border-border p-3 bg-muted/30 min-w-0 w-full max-w-full overflow-hidden [&_span]:truncate [&_.truncate]:text-ellipsis">
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
                  {(voucherType === "payment_out" || voucherType === "direct_expense") && showSpendWiseSection && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0 w-full">
                      {/* Left: From Voucher — message inside card when Link for Bill Wise is ON */}
                      <div className="space-y-2 rounded-lg border p-3 bg-muted/30 min-w-0 w-full max-w-full overflow-hidden">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 font-medium min-w-0">
                            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">Link for spend wise</span>
                          </div>
                          <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-base font-medium text-blue-700">From Voucher</span>
                        </div>
                        {requirePaymentLink && (
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
                      {/* Right: To Voucher */}
                      <div className="space-y-2 rounded-lg border p-3 bg-muted/30 min-w-0 w-full max-w-full overflow-hidden">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 font-medium min-w-0">
                            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">Link for spend wise</span>
                          </div>
                          <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-base font-medium text-blue-700">To Voucher ( current voucher )</span>
                        </div>
                        {currentVoucherAsOnOppositeRows.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Save the voucher to see how it appears on the opposite voucher.</p>
                        ) : (
                          <div className="overflow-x-auto -mx-1 min-w-0">
                            <table className="w-full text-sm border-collapse min-w-[400px]">
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                                  <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                                  <th className="text-left p-2 font-medium whitespace-nowrap">To</th>
                                  {/* To Voucher: keep compact view (Amount is redundant vs Linked + bottom balance) */}
                                  <th className="text-right p-2 font-medium whitespace-nowrap">Linked</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentVoucherAsOnOppositeRows.map((row) => (
                                  <tr key={row.id} className="border-b last:border-b-0">
                                    <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? (dateSystem === "BS" ? formatDateBS(row.date) : formatDate(row.date)) : "—"}</td>
                                    <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber}</td>
                                    <td className="p-2 whitespace-nowrap">{row.from}</td>
                                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(row.linked, { noSuffix: true, noAnimation: true })} Dr</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {currentVoucherAsOnOppositeRows.length > 0 && (
                          <div className="pt-2 border-t flex justify-end min-w-0">
                            <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                                <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                              </div>
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                                <span className="truncate text-right whitespace-nowrap leading-tight">
                                  {formatCurrency(currentVoucherAsOnOppositeRows[0].linked, { noSuffix: true, noAnimation: true })} Dr
                                </span>
                              </div>
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                                <span className="truncate leading-tight">Balance</span>
                              </div>
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                                <span className={cn("truncate text-right whitespace-nowrap leading-tight", currentVoucherAsOnOppositeRows[0].linked >= currentVoucherAsOnOppositeRows[0].amount && currentVoucherAsOnOppositeRows[0].amount > 0 ? "text-green-600 font-semibold" : "")}>
                                  {currentVoucherAsOnOppositeRows[0].linked >= currentVoucherAsOnOppositeRows[0].amount && currentVoucherAsOnOppositeRows[0].amount > 0
                                    ? "Settled"
                                    : `${formatCurrency(Math.max(0, currentVoucherAsOnOppositeRows[0].amount - currentVoucherAsOnOppositeRows[0].linked), { noSuffix: true, noAnimation: true })} Dr`}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Link Pay In: open same link dialog from current voucher card; Read me to the right of button inside box */}
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
                    </div>
                  )}
                  {voucherType !== "payment_out" && voucherType !== "direct_expense" && showSpendWiseSection && (
                    <div className="space-y-2 rounded-lg border p-3 bg-muted/30 min-w-0 w-full max-w-full overflow-hidden">
                      <div className="flex items-center gap-2 font-medium min-w-0">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">Link for spend wise</span>
                      </div>
                      {requirePaymentLink && (
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
                  {voucherType !== "payment_out" && showLinkedSection && (
                    <div className="space-y-2 rounded-lg border-2 border-border p-3 bg-muted/30 min-w-0 w-full max-w-full overflow-hidden [&_span]:truncate [&_.truncate]:text-ellipsis">
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
              <div className="grid gap-4 min-w-0 max-w-full grid-cols-1">
                {/* When payment linked: only Narration and Link section stay editable; all other fields locked, attach files read-only (attach block upar hai). */}
                <FormField
                  control={form.control}
                  name="narration"
                  render={({ field }: any) => (
                    <FormItem className="min-w-0 max-w-full overflow-hidden">
                      <FormLabel>Narration</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional details..." {...field} className="min-w-0 max-w-full w-full resize-none overflow-hidden text-ellipsis" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                    <Button type="button" onClick={() => { setAllocations(initialAllocationsRef.current.map((a) => ({ voucherId: a.voucherId, amount: a.amount }))); setLinkedPaymentInIds(initialLinkedPaymentInIdsRef.current); onVoucherAction?.('cancelled'); }} className={cn("w-full", BTN_CANCEL_CLASS)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={linkPayOthersDisabled || editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                      {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                    </Button>
                    <Button type="submit" disabled={linkPayOthersDisabled || isLoading || editingDisabled} className={cn("w-full", BTN_SAVE_CLASS)}>
                      {isLoading ? "..." : "Save"}
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
                    <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                      {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                    </Button>
                    <Button type="submit" disabled={isLoading || editingDisabled} className={cn("w-full", BTN_SAVE_CLASS)}>
                      {isLoading ? "..." : "Save"}
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
                      <Button type="submit" disabled={linkPayOthersDisabled || isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
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
                      <Button type="submit" disabled={isLoading || editingDisabled} className={cn("shrink-0 rounded-full", BTN_SAVE_CLASS)}>
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
            if (form.getValues("payeeType") === "other") {
              form.setValue("toAccountId", id);
            } else {
              form.setValue("expenseAccountId", id);
            }
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



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

import { CalendarIcon, Loader2, PlusCircle, Trash2, Printer, Upload, FileText, ArrowDownUp, Wand2, History, CheckCircle, Link2 } from "lucide-react";
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
import { LinkPaymentToTxnsDialog } from "@/components/vouchers/LinkPaymentToTxnsDialog";
import { LinkPaymentInToSalaryDialog } from "@/components/vouchers/LinkPaymentInToSalaryDialog";
import { LinkPaymentOutToSalaryDialog } from "@/components/vouchers/LinkPaymentOutToSalaryDialog";
import usePermissions from "@/hooks/usePermissions";
import { useDeviceLimitContext } from "@/contexts/DeviceLimitContext";
import { assertCan, assertCanPerformBackdated, assertCanEdit, PermissionDeniedError, determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { getAllocationTotal, hasPaymentLinks, OPENING_BALANCE_VOUCHER_ID, getAllocatedByVoucherId, getAllocatedByVoucherIdFromPaymentOuts } from "@/lib/payment-allocation-utils";
import type { Allocation } from "@/lib/payment-allocation-utils";
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
  historyLimitReached = false,
  onSaveBlockedByHistoryLimit,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
  onApprove,
  isApproving = false,
  /** When opening journal in edit mode, auto-select this side’s bill-wise card and blink the matching row (e.g. Dr row). Pass from ledger when user clicks Dr/Cr. */
  initialFocusSide,
}: {
  voucher?: any;
  onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string) => void;
  onOpenHistory?: () => void;
  showHistoryButton?: boolean;
  editingDisabled?: boolean;
  historyLimitReached?: boolean;
  onSaveBlockedByHistoryLimit?: () => void;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  initialFocusSide?: "debit" | "credit" | null;
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
  // Track initial allocations when voucher loads so link/unlink changes are detected for isFormDirty.
  const initialJournalAllocationsRef = useRef<{ debit: Allocation[]; credit: Allocation[] }>({ debit: [], credit: [] });
  /** Skip reset when same voucher updates (liveVoucher) and user has edits — fixes unlink → change fields → save. */
  const lastResetVoucherIdRef = useRef<string | null>(null);
  const processAndSaveRef = useRef<((data: JournalFormValues, saveAndNew: boolean, approveAfterSave?: boolean) => Promise<void>) | null>(null);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [activeInput, setActiveInput] = React.useState<{ index: number, field: string } | null>(null);
  // Track which journal line requested "add new" so we can fill that exact row instead of appending extra rows.
  const [pendingCreateLineIndex, setPendingCreateLineIndex] = useState<number | null>(null);
  // Keep allocations per account/side so debit card (Pashupati) and credit card (Kanhaiya) stay independent.
  const [journalAllocationsBySide, setJournalAllocationsBySide] = useState<{ debit: Allocation[]; credit: Allocation[] }>({
    debit: [],
    credit: [],
  });
  // Track which side card is opening link dialog so debit/credit can use opposite-link behavior.
  const [activeJournalLinkSide, setActiveJournalLinkSide] = useState<"debit" | "credit" | null>(null);
  /** Selected bill-wise card for select feel; jis card pe click kiya usi ka related amount row blink kare. */
  const [selectedBillWiseCard, setSelectedBillWiseCard] = useState<"debit" | "credit" | null>(null);
  /** Tracks whether we already applied initial focus for current voucher so we don’t override user selection. */
  const initialFocusAppliedRef = useRef<string | null>(null);

  const isEditing = !!voucher;
  const isEditingAndConverting = voucher && voucher.type !== 'journal';
  const isFormEditing = !voucher || isEditing;

  const form = useForm<JournalFormValues>({
    resolver: zodResolver(formSchema) as Resolver<JournalFormValues>,
    defaultValues: getInitialFormValues(voucher),
  });

  const { fields, remove, update } = useFieldArray({
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
  const _isAllocationsDirty = (() => {
    const init = initialJournalAllocationsRef.current;
    const norm = (a: Allocation[]) => JSON.stringify((a || []).map((x) => ({ v: x.voucherId, a: x.amount, l: x.linkedAccountId })).sort((p, q) => String(p.v).localeCompare(String(q.v))));
    return norm(journalAllocationsBySide.debit || []) !== norm(init.debit || []) || norm(journalAllocationsBySide.credit || []) !== norm(init.credit || []);
  })();
  const isFormDirty = _isFormFieldsDirty || _isFileDirty || _isAllocationsDirty;
  
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
        const vid = voucher.id;
        const isSameVoucher = lastResetVoucherIdRef.current === vid;
        if (vid && isSameVoucher && isFormDirty) return;
        if (vid) lastResetVoucherIdRef.current = vid;
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
        // Reset local journal allocations when a different voucher opens in edit mode; split by linkedAccountId.
        const raw = Array.isArray((voucher as any)?.allocations) ? ((voucher as any).allocations as Allocation[]) : [];
        const entries = (voucher as any)?.entries ?? [];
        const debitAccIds = new Set((entries as any[]).filter((e: any) => (Number(e?.debit) || 0) > 0).map((e: any) => String(e?.accountId ?? "")));
        const creditAccIds = new Set((entries as any[]).filter((e: any) => (Number(e?.credit) || 0) > 0).map((e: any) => String(e?.accountId ?? "")));
        const debit: Allocation[] = [];
        const credit: Allocation[] = [];
        raw.forEach((a: any) => {
          const lid = String(a?.linkedAccountId ?? "");
          if (lid && debitAccIds.has(lid)) debit.push(a);
          else if (lid && creditAccIds.has(lid)) credit.push(a);
          else if (!lid) debit.push(a);
        });
        setJournalAllocationsBySide({ debit, credit });
        initialJournalAllocationsRef.current = { debit: [...debit], credit: [...credit] };
    } else {
        lastResetVoucherIdRef.current = null;
        setJournalAllocationsBySide({ debit: [], credit: [] });
        initialJournalAllocationsRef.current = { debit: [], credit: [] };
    }
}, [voucher, form, isEditingAndConverting, isFormDirty]);

  
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
  // Keep a single label lookup so bill-wise card can show the exact account row user opened from.
  const accountLabelById = useMemo(() => {
    const map = new Map<string, string>();
    (processedPartiesForSelection || []).forEach((p: any) => map.set(String(p.id), `${p.name} (Party)`));
    (processedStaff || []).forEach((s: any) => map.set(String(s.id), `${s.name} (Staff)`));
    (processedAccounts || []).forEach((a: any) => map.set(String(a.id), `${a.accountName || a.name || "Account"} (Account)`));
    (expenseAccounts || []).forEach((a: any) => map.set(String(a.id), `${a.name || "Expense"} (Expense)`));
    (processedTaxes || []).forEach((t: any) => map.set(String(t.id), `${t.name || "Tax"} (Tax)`));
    return map;
  }, [processedPartiesForSelection, processedStaff, processedAccounts, expenseAccounts, processedTaxes]);
  // Source account id from account-ledger click; used to reduce two-account confusion in journal edit.
  const openedFromAccountId = String((voucher as any)?._openedFromAccountId ?? "");

  // Watch current lines once so bill-wise summary card can react instantly to journal edits.
  const watchedLines = useWatch({ control: form.control, name: "lines" });
  // Build fast lookups so journal bill-wise can support both Party and Staff account rows.
  const partyIdSet = useMemo(
    () => new Set((processedPartiesForSelection || []).map((p: any) => String(p.id))),
    [processedPartiesForSelection]
  );
  // Staff should also be linkable from Journal bill-wise cards (same as user-requested payment flow behavior).
  const staffIdSet = useMemo(
    () => new Set((processedStaff || []).map((s: any) => String(s.id))),
    [processedStaff]
  );
  // Journal link source account can be either party or staff; keep one combined set for row detection.
  const journalLinkableAccountIdSet = useMemo(() => {
    const combined = new Set<string>();
    partyIdSet.forEach((id) => combined.add(id));
    staffIdSet.forEach((id) => combined.add(id));
    return combined;
  }, [partyIdSet, staffIdSet]);
  // Build dedicated bill-wise source lines for both sides so Debit and Credit can each have their own card.
  const journalBillLinesBySide = useMemo(() => {
    const lines = Array.isArray(watchedLines) ? watchedLines : [];
    const findForSide = (side: "debit" | "credit") => {
      // Prefer clicked account row only when it matches side + party + positive amount.
      const preferred = openedFromAccountId
        ? lines.find(
            (l: any) =>
              String(l?.accountId ?? "") === openedFromAccountId &&
              String(l?.type ?? "") === side &&
              journalLinkableAccountIdSet.has(String(l?.accountId ?? "")) &&
              (Number(l?.amount) || 0) > 0
          )
        : null;
      const line =
        preferred ||
        lines.find(
          (l: any) =>
            String(l?.type ?? "") === side &&
            journalLinkableAccountIdSet.has(String(l?.accountId ?? "")) &&
            (Number(l?.amount) || 0) > 0
        );
      if (!line) return null;
      return {
        partyId: String(line.accountId),
        amount: Number(line.amount) || 0,
      };
    };
    return {
      debit: findForSide("debit"),
      credit: findForSide("credit"),
    };
  }, [watchedLines, journalLinkableAccountIdSet, openedFromAccountId]);

  // In edit mode: auto-select Dr card (and blink Dr row) or Cr card when opening journal; once per voucher.
  useEffect(() => {
    const vid = voucher?.id;
    if (!vid || voucher?.type !== "journal") {
      initialFocusAppliedRef.current = null;
      return;
    }
    if (initialFocusAppliedRef.current === vid) return;
    const lines = Array.isArray(watchedLines) ? watchedLines : [];
    const hasDebitLine = lines.some((l: any) => String(l?.type) === "debit" && journalLinkableAccountIdSet.has(String(l?.accountId ?? "")) && (Number(l?.amount) || 0) > 0);
    const hasCreditLine = lines.some((l: any) => String(l?.type) === "credit" && journalLinkableAccountIdSet.has(String(l?.accountId ?? "")) && (Number(l?.amount) || 0) > 0);
    const openedFromDebit = openedFromAccountId && lines.some((l: any) => String(l?.accountId) === openedFromAccountId && String(l?.type) === "debit");
    const side: "debit" | "credit" =
      initialFocusSide ?? (openedFromAccountId && openedFromDebit ? "debit" : openedFromAccountId && !openedFromDebit ? "credit" : "debit");
    if (side === "debit" && hasDebitLine) {
      setSelectedBillWiseCard("debit");
      initialFocusAppliedRef.current = vid;
    } else if (side === "credit" && hasCreditLine) {
      setSelectedBillWiseCard("credit");
      initialFocusAppliedRef.current = vid;
    } else if (hasDebitLine) {
      setSelectedBillWiseCard("debit");
      initialFocusAppliedRef.current = vid;
    } else if (hasCreditLine) {
      setSelectedBillWiseCard("credit");
      initialFocusAppliedRef.current = vid;
    }
  }, [voucher?.id, voucher?.type, watchedLines, initialFocusSide, openedFromAccountId, journalLinkableAccountIdSet]);

  /** Row index that should blink when a bill-wise card is selected (matching type + accountId). */
  const selectedCardRelatedRowIndex = useMemo(() => {
    if (!selectedBillWiseCard) return null;
    const lines = Array.isArray(watchedLines) ? watchedLines : [];
    const partyId = journalBillLinesBySide[selectedBillWiseCard]?.partyId ?? "";
    if (!partyId) return null;
    const idx = lines.findIndex((l: any) => String(l?.type ?? "") === selectedBillWiseCard && String(l?.accountId ?? "") === partyId);
    return idx >= 0 ? idx : null;
  }, [selectedBillWiseCard, watchedLines, journalBillLinesBySide]);
  // Highlight both related party rows so each bill-wise card has a clear matching source row in journal lines.
  const linkedPartyLineIndices = useMemo(() => {
    const lines = Array.isArray(watchedLines) ? watchedLines : [];
    const ids = [
      String(journalBillLinesBySide.debit?.partyId ?? ""),
      String(journalBillLinesBySide.credit?.partyId ?? ""),
    ].filter(Boolean);
    return new Set(
      lines
        .map((l: any, idx: number) => (ids.includes(String(l?.accountId ?? "")) ? idx : -1))
        .filter((idx: number) => idx >= 0)
    );
  }, [watchedLines, journalBillLinesBySide.debit?.partyId, journalBillLinesBySide.credit?.partyId]);
  // Use persisted voucher id when available so the card can show server-linked allocations.
  const journalVoucherId = (savedVoucherId || voucher?.id || "") as string;
  // Resolve current voucher snapshot from live list (fallback to prop voucher while editing).
  const currentJournalVoucher = useMemo(() => {
    if (!journalVoucherId) return voucher || null;
    return (vouchers || []).find((v: any) => String(v?.id ?? "") === String(journalVoucherId)) || voucher || null;
  }, [journalVoucherId, vouchers, voucher]);
  // Incoming links = other vouchers allocating to this journal (status "from").
  const journalLinkedFromRows = useMemo(() => {
    if (!journalVoucherId || !vouchers?.length) return [] as Array<{ voucherId: string; voucherNumber: string; amount: number; date: Date | null; total: number; sourceType: string }>;
    const rows: Array<{ voucherId: string; voucherNumber: string; amount: number; date: Date | null; total: number; sourceType: string }> = [];
    (vouchers as any[]).forEach((v) => {
      if (!v || String(v.id ?? "") === String(journalVoucherId)) return;
      const allocs = (v.allocations as any[] | undefined) || [];
      const linkedAmount = allocs
        .filter((a: any) => String(a?.voucherId ?? "") === String(journalVoucherId))
        .reduce((sum: number, a: any) => sum + getAllocationTotal(a), 0);
      if (linkedAmount <= 0) return;
      const rawDate = (v as any)?.date;
      const parsedDate =
        rawDate && typeof rawDate?.toDate === "function"
          ? rawDate.toDate()
          : rawDate
            ? new Date(rawDate)
            : null;
      rows.push({
        voucherId: String(v.id ?? ""),
        voucherNumber: String(v.voucherNumber ?? v.voucher_number ?? "—"),
        amount: linkedAmount,
        date: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null,
        total: Number((v as any)?.total ?? (v as any)?.amount ?? 0) || 0,
        sourceType: String((v as any)?.type ?? ""),
      });
    });
    return rows;
  }, [journalVoucherId, vouchers]);
  // Merged allocations for save payload; each allocation carries linkedAccountId for per-side restore on load.
  const effectiveJournalAllocations = useMemo(
    () => [...(journalAllocationsBySide.debit || []), ...(journalAllocationsBySide.credit || [])],
    [journalAllocationsBySide]
  );
  // Per-side outgoing rows so debit card shows only Pashupati links, credit card only Kanhaiya links.
  const journalLinkedToRowsBySide = useMemo(() => {
    const buildRows = (allocs: Allocation[]) => {
      const list = Array.isArray(allocs) ? allocs : [];
      if (!list.length) return [] as Array<{ voucherId: string; voucherNumber: string; amount: number; date: Date | null; total: number }>;
      return list
        .filter((a: any) => Number(a?.amount) > 0)
        .map((a: any) => {
          if (String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID) {
            return {
              voucherId: OPENING_BALANCE_VOUCHER_ID,
              voucherNumber: "Opening Balance",
              amount: getAllocationTotal(a),
              date: null,
              total: 0,
            };
          }
          const target = (vouchers || []).find((v: any) => String(v?.id ?? "") === String(a?.voucherId ?? ""));
          const rawDate = (target as any)?.date;
          const parsedDate =
            rawDate && typeof rawDate?.toDate === "function"
              ? rawDate.toDate()
              : rawDate
                ? new Date(rawDate)
                : null;
          return {
            voucherId: String(a?.voucherId ?? ""),
            voucherNumber: String(target?.voucherNumber ?? target?.voucher_number ?? "—"),
            amount: getAllocationTotal(a),
            date: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null,
            total: Number((target as any)?.total ?? (target as any)?.amount ?? 0) || 0,
          };
        });
    };
    return {
      debit: buildRows(journalAllocationsBySide.debit || []),
      credit: buildRows(journalAllocationsBySide.credit || []),
    };
  }, [journalAllocationsBySide, vouchers]);
  // Legacy: flat journalLinkedToRows for any code that still expects it (e.g. journalLinkedOnOthersByVoucherId uses allocs, not rows).
  const journalLinkedToRows = useMemo(() => {
    const allocs = effectiveJournalAllocations as any[];
    if (!allocs.length) return [] as Array<{ voucherId: string; voucherNumber: string; amount: number; date: Date | null; total: number }>;
    return allocs
      .filter((a: any) => Number(a?.amount) > 0)
      .map((a: any) => {
        if (String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID) {
          return {
            voucherId: OPENING_BALANCE_VOUCHER_ID,
            voucherNumber: "Opening Balance",
            amount: getAllocationTotal(a),
            date: null,
            total: 0,
          };
        }
        const target = (vouchers || []).find((v: any) => String(v?.id ?? "") === String(a?.voucherId ?? ""));
        const rawDate = (target as any)?.date;
        const parsedDate =
          rawDate && typeof rawDate?.toDate === "function"
            ? rawDate.toDate()
            : rawDate
              ? new Date(rawDate)
              : null;
        return {
          voucherId: String(a?.voucherId ?? ""),
          voucherNumber: String(target?.voucherNumber ?? target?.voucher_number ?? "—"),
          amount: getAllocationTotal(a),
          date: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null,
          total: Number((target as any)?.total ?? (target as any)?.amount ?? 0) || 0,
        };
      });
  }, [effectiveJournalAllocations, vouchers]);
  // For each row target, show how much already linked by other vouchers (excluding current journal) like payment forms.
  const journalLinkedOnOthersByVoucherId = useMemo(() => {
    const m = new Map<string, number>();
    if (!vouchers?.length) return m;
    (vouchers as any[]).forEach((v) => {
      if (!v || String(v?.id ?? "") === String(journalVoucherId)) return;
      const allocs = (v.allocations as any[] | undefined) || [];
      allocs.forEach((a: any) => {
        const key = String(a?.voucherId ?? "");
        if (!key || key === OPENING_BALANCE_VOUCHER_ID) return;
        m.set(key, (m.get(key) ?? 0) + getAllocationTotal(a));
      });
    });
    return m;
  }, [vouchers, journalVoucherId]);
  // Build side-wise card data so Debit/Credit each get independent bill-wise rows and balances.
  const journalBillWiseBySide = useMemo(() => {
    const getJournalPartyAmount = (voucher: any, accountId: string) => {
      if (voucher?.type !== "journal" || !Array.isArray(voucher?.entries)) return null;
      const partyEntry = voucher.entries.find((e: any) => String(e?.accountId ?? "") === String(accountId));
      if (!partyEntry) return null;
      const debit = Number((partyEntry as any)?.debit) || 0;
      const credit = Number((partyEntry as any)?.credit) || 0;
      const total = credit > 0 ? credit : debit;
      if (total <= 0) return null;
      return { debit, credit, total };
    };
    const debitSourceTypes = new Set(["payment_in", "direct_income"]);
    const creditSourceTypes = new Set(["payment_out", "direct_expense"]);
    const voucherTouchesAccount = (voucherId: string, accountId: string) => {
      const target = (vouchers || []).find((v: any) => String(v?.id ?? "") === String(voucherId));
      if (!target || !accountId) return false;
      return (
        String((target as any)?.partyId ?? "") === String(accountId) ||
        String((target as any)?.staffId ?? "") === String(accountId) ||
        (Array.isArray((target as any)?.entries) &&
          (target as any).entries.some((e: any) => String(e?.accountId ?? "") === String(accountId)))
      );
    };
    const buildSide = (side: "debit" | "credit") => {
      const sideLine = journalBillLinesBySide[side];
      const accountId = String(sideLine?.partyId ?? "");
      const existingAllocations = (journalAllocationsBySide[side] || []) as Allocation[];
      const currentVoucherIdStr = String(journalVoucherId ?? "");
      const isCurrentVoucher = (v: any) => currentVoucherIdStr && String((v as any)?.id ?? "") === currentVoucherIdStr;
      const voucherTouchesAccountFn = (v: any) =>
        String((v as any)?.partyId ?? "") === accountId ||
        String((v as any)?.staffId ?? "") === accountId ||
        (Array.isArray((v as any)?.entries) && (v as any).entries.some((e: any) => String(e?.accountId ?? "") === accountId));
      const hasExistingAlloc = (id: string) => existingAllocations.some((a) => a.voucherId === id && getAllocationTotal(a) > 0);

      // Opening balance for party/staff; used for OB linkable row.
      const getOpeningBalance = () => {
        if (!accountId) return 0;
        if (partyIdSet.has(accountId)) {
          const p = (processedPartiesForSelection || []).find((p: any) => String(p.id) === accountId);
          return Number((p as any)?.openingBalance ?? 0) || 0;
        }
        if (staffIdSet.has(accountId)) {
          const s = (processedStaff || []).find((s: any) => String(s.id) === accountId);
          return Number((s as any)?.openingBalance ?? 0) || 0;
        }
        return 0;
      };
      const partyOB = getOpeningBalance();
      const showOBInPaymentIn = partyOB > 0;
      const showOBInPaymentOut = partyOB < 0;
      const obAmount = partyOB > 0 ? partyOB : Math.abs(partyOB);

      // totalConsumedFromOB: allocations to OB from payments + sale/purchase openingBalanceAllocated.
      const totalConsumedFromOB = (() => {
        if (!accountId || !vouchers?.length) return 0;
        const payType = side === "credit" ? ["payment_in", "direct_income"] : ["payment_out", "direct_expense"];
        let fromPayments = 0;
        (vouchers as any[]).forEach((v) => {
          if (!payType.includes(v.type)) return;
          if (!voucherTouchesAccountFn(v)) return;
          const allocs = (v.allocations as any[] | undefined) || [];
          allocs.forEach((a: any) => {
            if (String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID) fromPayments += getAllocationTotal(a);
          });
        });
        const fromBillwise = (vouchers as any[]).reduce((sum, v) => {
          if (v.type !== "sale" && v.type !== "sale_service" && v.type !== "purchase" && v.type !== "purchase_service") return sum;
          if (!voucherTouchesAccountFn(v)) return sum;
          return sum + (Number((v as any).openingBalanceAllocated) || 0);
        }, 0);
        return fromPayments + fromBillwise;
      })();
      const obOutstandingIn = Math.max(0, obAmount - totalConsumedFromOB);
      const showOB = side === "credit" ? showOBInPaymentIn : showOBInPaymentOut;
      const obOutstanding = showOB ? obOutstandingIn : 0;

      const sourceTypes = side === "debit" ? debitSourceTypes : creditSourceTypes;
      const voucherMatchesJournalSide = (voucherId: string) => {
        const target = (vouchers || []).find((v: any) => String(v?.id ?? "") === String(voucherId));
        if (!target || target.type !== "journal" || !sideLine?.partyId) return false;
        const accountEntry = Array.isArray((target as any)?.entries)
          ? (target as any).entries.find((e: any) => String(e?.accountId ?? "") === String(sideLine.partyId))
          : null;
        if (!accountEntry) return false;
        return side === "debit" ? (Number(accountEntry.debit) || 0) > 0 : (Number(accountEntry.credit) || 0) > 0;
      };
      const filteredIncoming = journalLinkedFromRows.filter((row) =>
        (
          sourceTypes.has(String(row.sourceType || "").toLowerCase()) ||
          String(row.sourceType || "").toLowerCase() === "journal"
        ) &&
        voucherTouchesAccount(row.voucherId, accountId) &&
        (String(row.sourceType || "").toLowerCase() !== "journal" || voucherMatchesJournalSide(row.voucherId))
      );
      const map = new Map<string, { voucherId: string; voucherNumber: string; date: Date | null; total: number; linkedOnCurrent: number }>();
      [...filteredIncoming, ...journalLinkedToRowsBySide[side]].forEach((row) => {
        const key = String(row.voucherId);
        const prev = map.get(key);
        if (prev) {
          prev.linkedOnCurrent += Number(row.amount) || 0;
          if (!prev.date && row.date) prev.date = row.date;
          if (!prev.total && row.total) prev.total = row.total;
        } else {
          map.set(key, {
            voucherId: key,
            voucherNumber: row.voucherNumber,
            date: row.date ?? null,
            total: Number(row.total) || 0,
            linkedOnCurrent: Number(row.amount) || 0,
          });
        }
      });

      // Add linkable vouchers (same logic as LinkPaymentToTxnsDialog) so card shows voucher numbers.
      // Debit card links to Cr -> combinedOutList (purchase, payment_in, journal Cr, OB).
      // Credit card links to Dr -> combinedInList (sale, payment_out, journal Dr, OB).
      if (accountId && vouchers?.length) {
        const payInVouchers = (vouchers as any[]).filter(
          (v) => (v.type === "payment_in" || v.type === "direct_income") && !isCurrentVoucher(v)
        );
        const payOutVouchers = (vouchers as any[]).filter(
          (v) => (v.type === "payment_out" || v.type === "direct_expense") && !isCurrentVoucher(v)
        );
        const allocatedByPaymentIns = getAllocatedByVoucherId(payInVouchers);
        const allocatedByPaymentOuts = getAllocatedByVoucherIdFromPaymentOuts(payOutVouchers);
        const allocatedByBillWiseVouchers = (() => {
          const m = new Map<string, number>();
          for (const v of vouchers as any[]) {
            if (isCurrentVoucher(v)) continue;
            if (
              v.type !== "sale" && v.type !== "sale_service" && v.type !== "purchase" && v.type !== "purchase_service" && v.type !== "journal"
            ) continue;
            const allocations = (v.allocations as Allocation[] | undefined) || [];
            for (const a of allocations) {
              if (!a.voucherId) continue;
              m.set(a.voucherId, (m.get(a.voucherId) ?? 0) + getAllocationTotal(a));
            }
          }
          return m;
        })();
        const totalAllocatedTo = (vid: string) => (allocatedByPaymentIns.get(vid) ?? 0) + (allocatedByBillWiseVouchers.get(vid) ?? 0);
        const totalAllocatedToOut = (vid: string) => (allocatedByPaymentOuts.get(vid) ?? 0) + (allocatedByBillWiseVouchers.get(vid) ?? 0);
        // Other Linked: max(target allocations, sourceSum) + openingBalanceAllocated (Purchase/Sale link to OB via this).
        const getAllocatedToOthersFromTarget = (targetVoucher: any, vid: string): number => {
          const allocs = (targetVoucher?.allocations as Allocation[] | undefined) || [];
          const fromAllocs = allocs.reduce((sum, a) => {
            if (!a.voucherId || String(a.voucherId) === currentVoucherIdStr) return sum;
            if (accountId && (a as any).linkedAccountId && String((a as any).linkedAccountId) !== accountId) return sum;
            return sum + getAllocationTotal(a);
          }, 0);
          const sourceSum = side === "credit" ? totalAllocatedTo(vid) : totalAllocatedToOut(vid);
          const obInAllocs = allocs
            .filter((a) => String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID)
            .reduce((s, a) => s + getAllocationTotal(a), 0);
          const targetObAlloc = Math.max(0, (Number(targetVoucher?.openingBalanceAllocated) || 0) - obInAllocs);
          return Math.max(fromAllocs, sourceSum) + targetObAlloc;
        };
        const safeToDate = (d: unknown): Date | null => {
          if (!d) return null;
          if (d instanceof Date) return d;
          if (typeof (d as { toDate?: () => Date })?.toDate === "function") return (d as { toDate: () => Date }).toDate();
          const p = new Date(d as string | number);
          return isNaN(p.getTime()) ? null : p;
        };

        if (side === "credit") {
          // combinedInList: sale, payment_out, journal Dr, OB (Dr)
          const salesForParty = (vouchers as any[]).filter(
            (v) => !isCurrentVoucher(v) && (v.type === "sale" || v.type === "sale_service") && voucherTouchesAccountFn(v)
          );
          const linkedOnCurrentFor = (vid: string) =>
            existingAllocations.filter((a) => a.voucherId === vid).reduce((s, a) => s + getAllocationTotal(a), 0);
          salesForParty.forEach((v) => {
            const total = Number(v.total ?? v.amount ?? 0);
            const allocatedToOthers = getAllocatedToOthersFromTarget(v, v.id);
            const outstanding = Math.max(0, total - allocatedToOthers);
            if (outstanding <= 0 && !hasExistingAlloc(v.id)) return;
            const key = String(v.id);
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: String((v as any).invoiceNumber ?? (v as any).voucherNumber ?? "—"),
                date: safeToDate(v.date),
                total,
                linkedOnCurrent: linkedOnCurrentFor(v.id),
              });
            }
          });
          const paymentOutsForParty = (vouchers as any[]).filter(
            (v) => !isCurrentVoucher(v) && (v.type === "payment_out" || v.type === "direct_expense") && voucherTouchesAccountFn(v)
          );
          paymentOutsForParty.forEach((v) => {
            const total = Number((v as any).amount ?? (v as any).total ?? 0) || 0;
            const allocatedToOthers = getAllocatedToOthersFromTarget(v, v.id);
            const outstanding = Math.max(0, total - allocatedToOthers);
            if (outstanding <= 0 && !hasExistingAlloc(v.id)) return;
            const key = String(v.id);
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: String((v as any).voucherNumber ?? "—"),
                date: safeToDate(v.date),
                total,
                linkedOnCurrent: linkedOnCurrentFor(v.id),
              });
            }
          });
          const journalDrRows = (vouchers as any[])
            .filter((v) => !isCurrentVoucher(v) && v.type === "journal" && voucherTouchesAccountFn(v))
            .map((v) => {
              const partyAmount = getJournalPartyAmount(v, accountId);
              if (!partyAmount || partyAmount.debit <= 0) return null;
              const allocatedToOthers = getAllocatedToOthersFromTarget(v, v.id);
              const outstanding = Math.max(0, partyAmount.total - allocatedToOthers);
              if (outstanding <= 0 && !hasExistingAlloc(v.id)) return null;
              return { v, id: v.id, total: partyAmount.total, date: v.date };
            })
            .filter((r): r is NonNullable<typeof r> => !!r);
          journalDrRows.forEach(({ v, id, total, date }) => {
            const key = String(id);
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: String((v as any).voucherNumber ?? "—"),
                date: safeToDate(date),
                total,
                linkedOnCurrent: linkedOnCurrentFor(id),
              });
            }
          });
          if (showOBInPaymentIn && (obOutstandingIn > 0 || hasExistingAlloc(OPENING_BALANCE_VOUCHER_ID))) {
            const key = OPENING_BALANCE_VOUCHER_ID;
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: "Opening Balance",
                date: null,
                total: obAmount,
                linkedOnCurrent: linkedOnCurrentFor(key),
              });
            }
          }
        } else {
          // combinedOutList: purchase, payment_in, journal Cr, OB (Cr)
          const linkedOnCurrentForOut = (vid: string) =>
            existingAllocations.filter((a) => a.voucherId === vid).reduce((s, a) => s + getAllocationTotal(a), 0);
          const purchasesForParty = (vouchers as any[]).filter(
            (v) => !isCurrentVoucher(v) && (v.type === "purchase" || v.type === "purchase_service") && voucherTouchesAccountFn(v)
          );
          purchasesForParty.forEach((v) => {
            const total = Number(v.total ?? v.amount ?? 0);
            const allocatedToOthers = getAllocatedToOthersFromTarget(v, v.id);
            const outstanding = Math.max(0, total - allocatedToOthers);
            if (outstanding <= 0 && !hasExistingAlloc(v.id)) return;
            const key = String(v.id);
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: String((v as any).invoiceNumber ?? (v as any).voucherNumber ?? "—"),
                date: safeToDate(v.date),
                total,
                linkedOnCurrent: linkedOnCurrentForOut(v.id),
              });
            }
          });
          const paymentInsForParty = (vouchers as any[]).filter(
            (v) => !isCurrentVoucher(v) && (v.type === "payment_in" || v.type === "direct_income") && voucherTouchesAccountFn(v)
          );
          paymentInsForParty.forEach((v) => {
            const total = Number((v as any).amount ?? (v as any).total ?? 0) || 0;
            const allocatedToOthers = getAllocatedToOthersFromTarget(v, v.id);
            const outstanding = Math.max(0, total - allocatedToOthers);
            if (outstanding <= 0 && !hasExistingAlloc(v.id)) return;
            const key = String(v.id);
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: String((v as any).voucherNumber ?? "—"),
                date: safeToDate(v.date),
                total,
                linkedOnCurrent: linkedOnCurrentForOut(v.id),
              });
            }
          });
          const journalCrRows = (vouchers as any[])
            .filter((v) => !isCurrentVoucher(v) && v.type === "journal" && voucherTouchesAccountFn(v))
            .map((v) => {
              const partyAmount = getJournalPartyAmount(v, accountId);
              if (!partyAmount || partyAmount.credit <= 0) return null;
              const allocatedToOthers = getAllocatedToOthersFromTarget(v, v.id);
              const outstanding = Math.max(0, partyAmount.total - allocatedToOthers);
              if (outstanding <= 0 && !hasExistingAlloc(v.id)) return null;
              return { v, id: v.id, total: partyAmount.total, date: v.date };
            })
            .filter((r): r is NonNullable<typeof r> => !!r);
          journalCrRows.forEach(({ v, id, total, date }) => {
            const key = String(id);
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: String((v as any).voucherNumber ?? "—"),
                date: safeToDate(date),
                total,
                linkedOnCurrent: linkedOnCurrentForOut(id),
              });
            }
          });
          if (showOBInPaymentOut && (obOutstandingIn > 0 || hasExistingAlloc(OPENING_BALANCE_VOUCHER_ID))) {
            const key = OPENING_BALANCE_VOUCHER_ID;
            if (!map.has(key)) {
              map.set(key, {
                voucherId: key,
                voucherNumber: "Opening Balance",
                date: null,
                total: obAmount,
                linkedOnCurrent: linkedOnCurrentForOut(key),
              });
            }
          }
        }
      }

      const rows = Array.from(map.values()).sort((a, b) => {
        const dA = a.date ? new Date(a.date).getTime() : 0;
        const dB = b.date ? new Date(b.date).getTime() : 0;
        return dA - dB;
      });
      const linkedFromTotal = filteredIncoming.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      const linkedToTotal = (journalLinkedToRowsBySide[side] || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const linkableRemaining = Math.max(0, (sideLine?.amount || 0) - linkedToTotal);
      return {
        sideLine,
        rows,
        linkedFromTotal,
        linkedToTotal,
        linkableRemaining,
      };
    };
    return {
      debit: buildSide("debit"),
      credit: buildSide("credit"),
    };
  }, [journalBillLinesBySide, journalLinkedFromRows, journalLinkedToRowsBySide, journalAllocationsBySide, journalVoucherId, vouchers, partyIdSet, staffIdSet, processedPartiesForSelection, processedStaff]);
  // Resolve side-wise source account metadata so each Journal card opens the correct link dialog (Party/Staff).
  const journalLinkContextBySide = useMemo(() => {
    const resolve = (side: "debit" | "credit") => {
      const accountId = String(journalBillWiseBySide[side].sideLine?.partyId ?? "");
      if (!accountId) return { accountId: "", kind: null as "party" | "staff" | null, label: "", openingBalance: 0 };
      if (partyIdSet.has(accountId)) {
        const party = (processedPartiesForSelection || []).find((p: any) => String(p.id) === accountId);
        return {
          accountId,
          kind: "party" as const,
          label: party?.name || accountLabelById.get(accountId) || "Party",
          openingBalance: Number((party as any)?.openingBalance ?? 0) || 0,
        };
      }
      if (staffIdSet.has(accountId)) {
        const staff = (processedStaff || []).find((s: any) => String(s.id) === accountId);
        return {
          accountId,
          kind: "staff" as const,
          label: staff?.name || accountLabelById.get(accountId) || "Staff",
          openingBalance: Number((staff as any)?.openingBalance ?? 0) || 0,
        };
      }
      return { accountId, kind: null as "party" | "staff" | null, label: accountLabelById.get(accountId) || "Account", openingBalance: 0 };
    };
    return {
      debit: resolve("debit"),
      credit: resolve("credit"),
    };
  }, [journalBillWiseBySide, partyIdSet, processedPartiesForSelection, staffIdSet, processedStaff, accountLabelById]);
  // Open side-specific linking dialog so Debit card links to Credit vouchers and Credit card links to Debit vouchers.
  const handleJournalAddLinkClick = useCallback((side: "debit" | "credit") => {
    setSelectedBillWiseCard(side);
    const sideLine = journalBillWiseBySide[side].sideLine;
    if (!sideLine) {
      sonnerToast.info(`Select a ${side} row with amount before linking.`);
      return;
    }
    const ctx = journalLinkContextBySide[side];
    if (!ctx.kind) {
      sonnerToast.info("Only Party/Staff journal rows support bill-wise link from Journal.");
      return;
    }
    setActiveJournalLinkSide(side);
  }, [journalBillWiseBySide, journalLinkContextBySide]);
  // Keep currently opened link-card context in one object so party/staff dialogs can reuse the same source details.
  const activeJournalLinkContext = useMemo(() => {
    if (!activeJournalLinkSide) return null;
    const ctx = journalLinkContextBySide[activeJournalLinkSide];
    const sideAmount = Number(journalBillWiseBySide[activeJournalLinkSide].sideLine?.amount ?? 0) || 0;
    return {
      side: activeJournalLinkSide,
      ...ctx,
      amount: sideAmount,
    };
  }, [activeJournalLinkSide, journalLinkContextBySide, journalBillWiseBySide]);


  const handleFormSubmit = useCallback(async (e: React.FormEvent, options: { saveAndNew?: boolean; print?: boolean; approveAfterSave?: boolean } = {}) => {
    e.preventDefault();
    // block_edit + history full: block everything (no save, no approve)
    if (historyLimitReached) { onSaveBlockedByHistoryLimit?.(); return; }
    // hasLinks only: approve-only — user can approve voucher without saving form changes
    if (options.approveAfterSave && onApprove && editingDisabled) {
      onApprove();
      return;
    }
    if (editingDisabled) return;
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    onVoucherAction?.('saved', options.saveAndNew);
    await processAndSaveRef.current?.(form.getValues(), options.saveAndNew ?? false, options.approveAfterSave);
  }, [form, onVoucherAction, editingDisabled, historyLimitReached, onSaveBlockedByHistoryLimit]);
  
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
      
      const date = data.date instanceof Date ? data.date : new Date((data as any).date);
      // Build payload with only serializable fields (avoid form state carrying Timestamps/id that can break Firestore update)
      const submissionData = {
        type: "journal" as const,
        voucherNumber: (data as any).voucherNumber,
        narration: (data as any).narration ?? "",
        date: date.toISOString(),
        total: totalDebit,
        entries: data.lines.map((line: any) => ({
          accountId: line.accountId,
          debit: line.type === "debit" ? line.amount : 0,
          credit: line.type === "credit" ? line.amount : 0,
        })),
        // Persist links made from Journal debit/credit bill-wise cards.
        allocations: effectiveJournalAllocations,
        fileUrls,
      };

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
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
      } else if (isVoucherLimitError(error)) {
        sonnerToast.error("Voucher limit reached", {
          id: toastId,
          description: error.message,
          action: { label: "Upgrade", onClick: () => window.location.assign("/billing") },
        });
      } else {
        const message = error?.message || (typeof error === "string" ? error : "Unknown error");
        console.error("Error saving journal voucher:", error);
        sonnerToast.error("Error saving voucher.", { id: toastId, description: message });
      }
    } finally {
        if (isMounted.current) setIsLoading(false);
    }
  };

  processAndSaveRef.current = processAndSave;

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

  // Apply newly created account to the requested row to avoid extra debit rows being appended.
  const applyCreatedAccountToPendingRow = useCallback((id: string) => {
    if (pendingCreateLineIndex !== null) {
      form.setValue(`lines.${pendingCreateLineIndex}.accountId`, id, { shouldDirty: true, shouldValidate: true });
      setPendingCreateLineIndex(null);
      return;
    }
    // Add-row flow removed: fallback assigns created account to an existing empty row (or last row) instead of appending.
    const currentLines = form.getValues("lines");
    const emptyRowIndex = currentLines.findIndex((line) => !String(line?.accountId ?? "").trim());
    const targetRowIndex = emptyRowIndex >= 0 ? emptyRowIndex : Math.max(0, currentLines.length - 1);
    form.setValue(`lines.${targetRowIndex}.accountId`, id, { shouldDirty: true, shouldValidate: true });
  }, [form, pendingCreateLineIndex]);
  
  const handleAmountChange = (index: number, value: number) => {
    // Add-row flow removed: rebalance only within the existing journal rows.
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
            <div
              className={cn(
                "space-y-6 min-w-0 max-w-full w-full overflow-x-hidden [&>*]:min-w-0 [&>*]:max-w-full",
                isMobile ? "" : "px-[2px]"
              )}
              onClick={() => setSelectedBillWiseCard(null)}
            >
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
                        <div
                          key={line.id}
                          className={cn(
                            "flex gap-[2px] items-start border px-[2px] py-2 rounded-md",
                            linkedPartyLineIndices.has(index) && (lineType === "debit" ? "bg-green-50/60 border-green-200" : "bg-pink-50/60 border-pink-200"),
                            selectedCardRelatedRowIndex === index && "animate-spend-wise-balance-blink"
                          )}
                        >
                          {/* Account */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.accountId`}
                            render={({ field }: any) => (
                              <FormItem className="flex-1 min-w-0 overflow-hidden">
                                <div className="min-w-0 w-full overflow-hidden [&_button]:h-9 [&_button]:text-xs">
                                  <Combobox
                                    // Match row color: debit=dim green, credit=dim pink.
                                    triggerClassName={cn(
                                      "w-full min-w-0 h-9",
                                      linkedPartyLineIndices.has(index) && (lineType === "debit" ? "bg-green-50 border-green-200" : "bg-pink-50 border-pink-200")
                                    )}
                                    options={allAccounts.map(a => ({ value: a.value, label: a.label }))}
                                    value={field.value}
                                    onChange={(value, newName) => {
                                      if (value === "add-new-party") {
                                        // Remember source row so newly created party binds here, not as extra row.
                                        setPendingCreateLineIndex(index);
                                        handleCreateNew("party", newName);
                                      }
                                      else if (value === "add-new-staff") {
                                        // Remember source row so newly created staff binds here, not as extra row.
                                        setPendingCreateLineIndex(index);
                                        handleCreateNew("staff", newName);
                                      }
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
                                    field.value === "debit" ? "text-blue-600 border-blue-300" : "text-purple-600 border-purple-300",
                                    // Match row color: debit=dim green, credit=dim pink.
                                    linkedPartyLineIndices.has(index) && (field.value === "debit" ? "bg-green-50 border-green-200" : "bg-pink-50 border-pink-200")
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
                                    className={cn(
                                      "h-9 text-xs text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                      linkedPartyLineIndices.has(index) && (lineType === "debit" ? "bg-green-50 border-green-200" : "bg-pink-50 border-pink-200"),
                                      selectedCardRelatedRowIndex === index && "animate-spend-wise-balance-blink"
                                    )}
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
                  {/* Mobile: Totals only; add-row action intentionally removed for journal flow. */}
                  <div className="flex flex-col gap-2 px-[2px]">
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
                      const lineType = form.watch(`lines.${index}.type`);
                      
                      return (
                        <div
                          key={line.id}
                          className={cn(
                            "grid grid-cols-[2fr_auto_auto_1fr_48px] gap-2 items-start border p-2 rounded-md",
                            linkedPartyLineIndices.has(index) && (lineType === "debit" ? "bg-green-50/60 border-green-200" : "bg-pink-50/60 border-pink-200"),
                            selectedCardRelatedRowIndex === index && "animate-spend-wise-balance-blink"
                          )}
                        >
                          {/* Account */}
                          <FormField
                            control={form.control}
                            name={`lines.${index}.accountId`}
                            render={({ field }: any) => (
                              <FormItem>
                                <Combobox
                                  triggerClassName={cn(
                                    "h-9",
                                    linkedPartyLineIndices.has(index) && (lineType === "debit" ? "bg-green-50 border-green-200" : "bg-pink-50 border-pink-200")
                                  )}
                                  options={allAccounts.map(a => ({ value: a.value, label: a.label }))}
                                  value={field.value}
                                  onChange={(value, newName) => {
                                    if (value === "add-new-party") {
                                      // Remember source row so newly created party binds here, not as extra row.
                                      setPendingCreateLineIndex(index);
                                      handleCreateNew("party", newName);
                                    }
                                    else if (value === "add-new-staff") {
                                      // Remember source row so newly created staff binds here, not as extra row.
                                      setPendingCreateLineIndex(index);
                                      handleCreateNew("staff", newName);
                                    }
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
                                    <SelectTrigger
                                      className={cn(
                                        "w-24 h-9 justify-center",
                                        linkedPartyLineIndices.has(index) && (lineType === "debit" ? "bg-green-50 border-green-200" : "bg-pink-50 border-pink-200")
                                      )}
                                    >
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
                                    className={cn(
                                      "h-9 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                      linkedPartyLineIndices.has(index) && (lineType === "debit" ? "bg-green-50 border-green-200" : "bg-pink-50 border-pink-200"),
                                      selectedCardRelatedRowIndex === index && "animate-spend-wise-balance-blink"
                                    )}
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

                  {/* Desktop: Totals only; add-row action intentionally removed for journal flow. */}
                  <div className="flex justify-end items-center mt-3 gap-4">
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
              {/* Attach Files: full width like narration. */}
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
              {/* Link for bill wise: dono side se 5px inset taaki select ring dikhe. */}
              <div className="space-y-3 w-full max-w-full min-w-0 mb-[10px] px-[5px]">
                  {(["debit", "credit"] as const).map((sideKey) => {
                    const sideData = journalBillWiseBySide[sideKey];
                    const sideLabel = sideKey === "debit" ? "debit" : "credit";
                    const sideAccountLabel = sideData.sideLine?.partyId ? (accountLabelById.get(sideData.sideLine.partyId) || "—") : "";
                    const isDebitCard = sideKey === "debit";
                    const cardBg = isDebitCard ? "bg-green-50/40 border-green-200" : "bg-pink-50/40 border-pink-200";
                    const linkAccountBox = isDebitCard ? "border-green-200 bg-green-50/40 text-green-800" : "border-pink-200 bg-pink-50/40 text-pink-800";
                    return (
                      <div
                        key={sideKey}
                        role="button"
                        tabIndex={0}
                        data-billwise-side={sideKey}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Read side from DOM to avoid closure issues; Cr click was incorrectly selecting Dr.
                          const side = (e.currentTarget as HTMLElement).getAttribute("data-billwise-side") as "debit" | "credit" | null;
                          if (side) setSelectedBillWiseCard((prev) => (prev === side ? null : side));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            const side = (e.currentTarget as HTMLElement).getAttribute("data-billwise-side") as "debit" | "credit" | null;
                            if (side) setSelectedBillWiseCard((prev) => (prev === side ? null : side));
                          }
                        }}
                        className={cn(
                          "space-y-2 rounded-lg border-2 p-3 w-full max-w-full min-w-0 overflow-hidden cursor-pointer transition-all",
                          cardBg,
                          selectedBillWiseCard === sideKey && "ring-2 ring-primary/60 ring-offset-2 shadow-md"
                        )}
                      >
                        {/* Side label required by UX: show (debit)/(credit) directly in bill-wise title. */}
                        <div className="flex items-center gap-2 font-semibold border-b border-border/60 pb-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span>Link for bill wise ({sideLabel})</span>
                        </div>
                        <div className={cn("w-fit rounded-md border px-2 py-1 text-xs", linkAccountBox)}>
                          {/* Show selected source account for this side; width fits text length. */}
                          Link account: <span className="font-semibold">{sideAccountLabel || "Select account row"}</span>
                        </div>
                        {!journalVoucherId ? (
                          <p className="text-sm text-blue-600">Save journal 1st to enable bill-wise linking details.</p>
                        ) : !sideData.sideLine ? (
                          <p className="text-sm text-muted-foreground">Select a {sideLabel} party/staff line with amount to show bill-wise link balance.</p>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground">
                              {sideData.rows.length} voucher(s) available to link.{sideData.rows.some((r) => r.linkedOnCurrent > 0) && ` ${sideData.rows.filter((r) => r.linkedOnCurrent > 0).length} linked.`}
                            </p>
                            {/* Table sirf linked vouchers ke liye dikhao; link kiye bina linkable list mat dikhao. */}
                            {!sideData.rows.some((r) => r.linkedOnCurrent > 0) ? null : (
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
                                    {sideData.rows.filter((r) => r.linkedOnCurrent > 0).map((row) => (
                                      <tr key={`${sideKey}-${row.voucherId}`} className="border-b border-border/30 last:border-b-0">
                                        <td className="p-2 text-muted-foreground whitespace-nowrap">{row.voucherNumber === "Opening Balance" ? "—" : (row.date ? formatDate(row.date) : "—")}</td>
                                        <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber}</td>
                                        <td className="p-2 text-right font-medium text-green-600 whitespace-nowrap">
                                          {formatCurrencyForPrint(row.total || row.linkedOnCurrent, { noSuffix: true, noAnimation: true })}
                                        </td>
                                        <td className="p-2 text-right text-muted-foreground whitespace-nowrap">
                                          {formatCurrencyForPrint(journalLinkedOnOthersByVoucherId.get(row.voucherId) ?? 0, { noSuffix: true, noAnimation: true })}
                                        </td>
                                        <td className="p-2 text-right text-muted-foreground whitespace-nowrap">
                                          {formatCurrencyForPrint(row.linkedOnCurrent, { noSuffix: true, noAnimation: true })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="pt-2 border-t flex justify-end">
                              <div className="grid grid-cols-2 gap-1.5 text-sm w-fit min-w-0">
                                <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center">
                                  <span className="text-muted-foreground leading-tight">Total linked</span>
                                </div>
                                <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end">
                                  <span className="text-right whitespace-nowrap leading-tight">
                                    {formatCurrencyForPrint(sideData.linkedToTotal ?? 0, { noSuffix: true, noAnimation: true })}
                                  </span>
                                </div>
                                <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium">
                                  <span className="leading-tight">Balance</span>
                                </div>
                                <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium">
                                  <span className={cn("text-right whitespace-nowrap leading-tight", sideData.linkableRemaining === 0 ? "text-green-600 font-semibold" : "")}>
                                    {sideData.linkableRemaining === 0
                                      ? "Settled"
                                      : formatCurrencyForPrint(sideData.linkableRemaining, { noSuffix: true, noAnimation: true })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {can('add_link') && (
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {/* Card-specific CTA: Debit links to Cr and Credit links to Dr, matching journal opposite-side flow. */}
                                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={(e) => { e.stopPropagation(); handleJournalAddLinkClick(sideKey); }}>
                                  <Link2 className="h-4 w-4 mr-2" />
                                  {sideKey === "debit" ? "Link to Cr" : "Link to Dr"}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                  <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={!showApproveButton || !onApprove || isApproving || historyLimitReached || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
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
                    <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={!showApproveButton || !onApprove || isApproving || historyLimitReached || (!!voucher?.isApproved && !isFormDirty)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
                      {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                      {isFormDirty ? "Save & Approve" : "Approve"}
                    </Button>
                  ) : (
                    <Button type="button" onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })} disabled={!showSaveAndApproveOnCreate || isLoading || (editingDisabled && !historyLimitReached)} className={cn("shrink-0 rounded-full", BTN_APPROVE_CLASS)}>
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
      {/* Party-side Journal linking: "Link Journal Dr to Linkable Cr Txns" → show Cr list. "Link Journal Cr to Linkable Dr Txns" → show Dr list. */}
      <LinkPaymentToTxnsDialog
        isOpen={!!activeJournalLinkContext && activeJournalLinkContext.kind === "party"}
        onOpenChange={(open) => {
          if (!open) setActiveJournalLinkSide(null);
        }}
        variant={activeJournalLinkContext?.side === "debit" ? "payment_out" : "payment_in"}
        isJournalLinkDialog={activeJournalLinkContext?.kind === "party"}
        partyId={activeJournalLinkContext?.kind === "party" ? activeJournalLinkContext.accountId : null}
        partyName={activeJournalLinkContext?.kind === "party" ? activeJournalLinkContext.label : "Party"}
        receivedAmount={Number(activeJournalLinkContext?.amount ?? 0) || 0}
        existingAllocations={activeJournalLinkContext?.side === "debit" ? (journalAllocationsBySide.debit || []) : (journalAllocationsBySide.credit || [])}
        paymentInId={journalVoucherId || null}
        paymentOutId={journalVoucherId || null}
        partyOpeningBalance={Number(activeJournalLinkContext?.openingBalance ?? 0) || 0}
        dialogTitle={activeJournalLinkContext?.side === "debit" ? "Link Journal Dr to Linkable Cr Txns" : "Link Journal Cr to Linkable Dr Txns"}
        paymentInVoucherNumber={String(form.getValues("voucherNumber") || voucher?.voucherNumber || "")}
        paymentOutVoucherNumber={String(form.getValues("voucherNumber") || voucher?.voucherNumber || "")}
        paymentInDate={form.getValues("date")}
        paymentOutDate={form.getValues("date")}
        onDone={(allocations) => {
          const side = activeJournalLinkContext?.side;
          const accountId = activeJournalLinkContext?.accountId ?? "";
          const tagged = (Array.isArray(allocations) ? allocations : []).map((a: any) => ({ ...a, linkedAccountId: accountId }));
          setJournalAllocationsBySide((prev) => ({ ...prev, [side === "debit" ? "debit" : "credit"]: tagged }));
          setActiveJournalLinkSide(null);
        }}
      />
      {/* Staff-side Journal linking for credit card (to Dr sources): uses Payment In → Salary linking behavior. */}
      <LinkPaymentInToSalaryDialog
        isOpen={!!activeJournalLinkContext && activeJournalLinkContext.kind === "staff" && activeJournalLinkContext.side === "credit"}
        onOpenChange={(open) => {
          if (!open) setActiveJournalLinkSide(null);
        }}
        staffId={activeJournalLinkContext?.kind === "staff" ? activeJournalLinkContext.accountId : null}
        staffName={activeJournalLinkContext?.kind === "staff" ? activeJournalLinkContext.label : "Staff"}
        paymentInId={journalVoucherId || null}
        amountReceived={Number(activeJournalLinkContext?.amount ?? 0) || 0}
        existingAllocations={journalAllocationsBySide.credit || []}
        staffOpeningBalance={Number(activeJournalLinkContext?.openingBalance ?? 0) || 0}
        paymentInVoucherNumber={String(form.getValues("voucherNumber") || voucher?.voucherNumber || "")}
        paymentInDate={form.getValues("date")}
        onDone={(allocations) => {
          const accountId = activeJournalLinkContext?.accountId ?? "";
          const tagged = (Array.isArray(allocations) ? allocations : []).map((a: any) => ({ ...a, linkedAccountId: accountId }));
          setJournalAllocationsBySide((prev) => ({ ...prev, credit: tagged }));
          setActiveJournalLinkSide(null);
        }}
      />
      {/* Staff-side Journal linking for debit card (to Cr sources): uses Payment Out → Salary linking behavior. */}
      <LinkPaymentOutToSalaryDialog
        isOpen={!!activeJournalLinkContext && activeJournalLinkContext.kind === "staff" && activeJournalLinkContext.side === "debit"}
        onOpenChange={(open) => {
          if (!open) setActiveJournalLinkSide(null);
        }}
        staffId={activeJournalLinkContext?.kind === "staff" ? activeJournalLinkContext.accountId : null}
        staffName={activeJournalLinkContext?.kind === "staff" ? activeJournalLinkContext.label : "Staff"}
        paymentOutId={journalVoucherId || null}
        amountPaid={Number(activeJournalLinkContext?.amount ?? 0) || 0}
        existingAllocations={journalAllocationsBySide.debit || []}
        staffOpeningBalance={Number(activeJournalLinkContext?.openingBalance ?? 0) || 0}
        paymentOutVoucherNumber={String(form.getValues("voucherNumber") || voucher?.voucherNumber || "")}
        paymentOutDate={form.getValues("date")}
        onDone={(allocations) => {
          const accountId = activeJournalLinkContext?.accountId ?? "";
          const tagged = (Array.isArray(allocations) ? allocations : []).map((a: any) => ({ ...a, linkedAccountId: accountId }));
          setJournalAllocationsBySide((prev) => ({ ...prev, debit: tagged }));
          setActiveJournalLinkSide(null);
        }}
      />
      <CreatePartyDialog onPartyCreated={(id) => { setIsCreatePartyOpen(false); applyCreatedAccountToPendingRow(id); }} isOpen={isCreatePartyOpen} onOpenChange={setIsCreatePartyOpen} />
      <CreateBankAccountDialog onAccountCreated={(id) => { setIsCreateAccountOpen(false); applyCreatedAccountToPendingRow(id); }} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen} />
      <CreateStaffDialog onStaffCreated={(id) => { setIsCreateStaffOpen(false); applyCreatedAccountToPendingRow(id); }} isOpen={isCreateStaffOpen} onOpenChange={setIsCreateStaffOpen} groups={[]} />
      <CreateExpenseAccountDialog onExpenseAccountCreated={(id) => { setIsCreateExpenseOpen(false); applyCreatedAccountToPendingRow(id); }} isOpen={isCreateExpenseOpen} onOpenChange={setIsCreateExpenseOpen} />
      <CreateTaxDialog onTaxCreated={(id) => { setIsCreateTaxOpen(false); applyCreatedAccountToPendingRow(id); }} isOpen={isCreateTaxOpen} onOpenChange={setIsCreateTaxOpen} />
    </>
  );
}


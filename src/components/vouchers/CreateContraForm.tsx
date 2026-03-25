
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
import { CalendarIcon, Loader2, Trash2, PlusCircle, Upload, FileText, Crown, History, CheckCircle, Printer, Link2, Info } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { saveVoucher, isVoucherLimitError, approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { formatVoucherNumber, parseVoucherNumberPart, normalizePrefix } from "@/lib/voucherNumberFormat";
import { sendTransactionAlert, isAmountOverOneLakh, getChangedFieldLabels } from "@/lib/transactionAlerts";
import { RestrictedFileUploader } from "../ui/RestrictedFileUploader";
import { useAccountBalance } from "@/hooks/useAccountBalance";
import { useIsMobile } from "@/hooks/use-mobile";
import { VOUCHER_BUTTONS_CLASS, BTN_HISTORY_CLASS, BTN_PRINT_CLASS, BTN_CANCEL_CLASS, BTN_SAVE_NEW_CLASS, BTN_SAVE_CLASS, BTN_APPROVE_CLASS } from "@/components/vouchers/voucherButtonStyles";
import { hasPaymentLinks } from "@/lib/payment-allocation-utils";
import { LinkPaymentInToPaymentOutDialog } from "@/components/vouchers/LinkPaymentInToPaymentOutDialog";
import { LinkPaymentOutToPaymentInDialog } from "@/components/vouchers/LinkPaymentOutToPaymentInDialog";
import { LinkSectionInfoDialog } from "@/components/vouchers/LinkSectionInfoDialog";
import { allocatePaymentInAmounts } from "@/lib/paymentInAllocation";
import { updateVoucherSpendWiseLinks } from "@/lib/voucherActionsClient";
import { getOpeningBalanceBaseAmount, SPEND_WISE_OPENING_BALANCE_ID } from "@/lib/spendWiseOpeningBalance";

const fileSchema = z.object({
  file: z.custom<File | null>().optional(),
});

const formSchema = z.object({
  fromAccountId: z.string().min(1, "Please select the source account."),
  toAccountId: z.string().min(1, "Please select the destination account."),
  date: z.date({ message: "A date is required." }),
  voucherNumber: z.string().optional(),
  /** From-account leg: e.g. CNTR Out - 001. Treated as voucher number; required. */
  voucherNumberOut: z.string().min(1, "Voucher No. (Out) is required."),
  /** To-account leg: e.g. CNTR In - 001. Treated as voucher number; required. */
  voucherNumberIn: z.string().min(1, "Voucher No. (In) is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  narration: z.string().optional(),
  files: z.array(fileSchema).optional(),
});

type ContraFormValues = z.infer<typeof formSchema>;

const getVoucherPrefix = (prefixes?: Record<string, string[]>) => (prefixes?.contra && prefixes.contra[0]) || "CNTR-";
/** Base prefix for Contra Out/In (e.g. "CNTR-" → "CNTR"). Used to build "CNTR Out - 001" and "CNTR In - 001". */
const getContraBasePrefix = (prefixes?: Record<string, string[]>) => normalizePrefix(getVoucherPrefix(prefixes)) || "CNTR";
const MAX_FILE_SIZE_MB = 0.5;


export function CreateContraForm({
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
  const { toast } = useToast();
  const { user, customUser } = useAuth();
  const { formatCurrency, formatCurrencyForPrint, formatDate, dateSystem } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedAccounts: allProcessedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts } = useVouchers();
  const { company, companyId, triggerSync } = useCompany();
  const { can, role, canPerformBackdatedAction, canEditRecord, canDeleteVoucher, fileAttachmentLimits, allowAttachments } = usePermissions();
  const isMobile = useIsMobile();

  const [isLoading, setIsLoading] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [targetFieldForNewAccount, setTargetFieldForNewAccount] = useState<'fromAccountId' | 'toAccountId' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<(File|string)[]>([]);
  const initialFilesRef = useRef<string[]>([]);
  const processAndSaveRef = useRef<((data: ContraFormValues, saveAndNew: boolean, onSuccess?: () => void, approveAfterSave?: boolean) => Promise<void>) | null>(null);
  const [savedVoucherId, setSavedVoucherId] = useState<string | null>(voucher?.id || null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [linkedPaymentInIds, setLinkedPaymentInIds] = useState<string[]>([]);
  const [isLinkPaymentInDialogOpen, setIsLinkPaymentInDialogOpen] = useState(false);
  /** Keep only one Pay In dialog state so Contra Out linking is always handled from the top-left card. */
  const [isLinkPaymentOutDialogOpen, setIsLinkPaymentOutDialogOpen] = useState(false);
  /** Pending Link Pay Out selection (applied to server only on Save, not on Done). */
  const [pendingLinkedPaymentOut, setPendingLinkedPaymentOut] = useState<{ ids: string[]; amountsByVoucherId: Record<string, number> } | null>(null);
  const [linkSectionInfoOpen, setLinkSectionInfoOpen] = useState(false);
  // Block overspending from selected from-account for all roles (including owner).
  const [isAmountMoreThanAccountOpen, setIsAmountMoreThanAccountOpen] = useState(false);
  // Track last valid amount so invalid keystroke can be reverted immediately.
  const lastValidAmountRef = useRef<number>(Number(voucher?.amount ?? voucher?.total ?? 0) || 0);
  const initialLinkedPaymentInIdsRef = useRef<string[]>([]);
  /** Skip reset when same voucher updates (liveVoucher) and user has edits — fixes unlink → change fields → save. */
  const lastResetVoucherIdRef = useRef<string | null>(null);

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
    resolver: zodResolver(formSchema) as Resolver<ContraFormValues>,
    defaultValues: voucher
      ? { ...voucher, files:[], date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date), voucherNumberOut: voucher.voucherNumberOut ?? "", voucherNumberIn: voucher.voucherNumberIn ?? "" }
      : {
          fromAccountId: "",
          toAccountId: "",
          date: startOfDay(new Date()),
          voucherNumber: "",
          voucherNumberOut: "",
          voucherNumberIn: "",
          amount: 0,
          narration: "",
          files: [],
        },
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
  /** Link Pay Out (spend wise To side) changed in dialog but not saved — show Save & Approve. */
  const _isSpendWiseLinkOutDirty = !!pendingLinkedPaymentOut;
  const isFormDirty = _isFormFieldsDirty || _isFileDirty || _isLinkDirty || _isSpendWiseLinkOutDirty;
  const fromAccountId = form.watch("fromAccountId");
  const toAccountId = form.watch("toAccountId");
  const amount = Number(form.watch("amount")) || 0;
  // Keep edit context aligned with the clicked contra row; add-new defaults to Out leg.
  const selectedContraLeg: 'in' | 'out' = (voucher?._contraLeg === 'in' ? 'in' : 'out');

  useEffect(() => {
    const ids = Array.isArray(voucher?.linkedPaymentInIds) ? [...voucher.linkedPaymentInIds] : [];
    setLinkedPaymentInIds(ids);
    initialLinkedPaymentInIdsRef.current = ids;
  }, [voucher?.id, voucher?.linkedPaymentInIds]);

  const spendWiseEnabled = (company as { spendWiseEnabled?: boolean } | null)?.spendWiseEnabled === true;
  const requirePaymentLink = (() => {
    const byRole = (company as { requirePaymentLinkByRole?: Record<string, boolean | { payment_out?: boolean; contra?: boolean; direct_expense?: boolean }> } | null)?.requirePaymentLinkByRole?.[role];
    if (byRole === undefined) return false;
    if (typeof byRole === "boolean") return byRole;
    return byRole.contra === true;
  })();
  // Rule: Out leg links same-account inflows; In leg links same-account outflows.
  const spendWiseInAccountId = selectedContraLeg === 'in' ? toAccountId : fromAccountId;
  const spendWiseOutAccountId = selectedContraLeg === 'in' ? toAccountId : fromAccountId;
  const spendWiseInAccountOpeningBalance = Number(allProcessedAccounts?.find((a: any) => a.id === spendWiseInAccountId)?.openingBalance ?? 0) || 0;
  const spendWiseOutAccountOpeningBalance = Number(allProcessedAccounts?.find((a: any) => a.id === spendWiseOutAccountId)?.openingBalance ?? 0) || 0;
  const linkedAmountByPaymentInId = useMemo(() => {
    const map = new Map<string, number>();
    // Compute already-linked amounts using the same opposite account used by Link Pay In.
    if (!allVouchers?.length || !spendWiseInAccountId) return map;
    const currentId = voucher?.id ?? savedVoucherId;
    allVouchers
      .filter(
        (v: any) => {
          const isOut =
            (v.type === "payment_out" && v.accountId === spendWiseInAccountId) ||
            (v.type === "direct_expense" && v.accountId === spendWiseInAccountId) ||
            (v.type === "contra" && v.fromAccountId === spendWiseInAccountId);
          return (
            isOut &&
            Array.isArray(v.linkedPaymentInIds) &&
            v.linkedPaymentInIds.length > 0 &&
            v.id !== currentId &&
            !v.isDeleted
          );
        }
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
  }, [allVouchers, spendWiseInAccountId, voucher?.id, savedVoucherId]);
  const linkedPaymentInTotal = useMemo(() => {
    if (!allVouchers?.length || !linkedPaymentInIds?.length || !spendWiseInAccountId) return 0;
    return linkedPaymentInIds.reduce((sum, id) => {
      if (id === SPEND_WISE_OPENING_BALANCE_ID) {
        // Opening balance behaves like spend-wise source row on Dr side for Contra Out linking.
        const base = getOpeningBalanceBaseAmount(spendWiseInAccountOpeningBalance, "dr");
        const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
        return sum + Math.max(0, base - alreadyLinked);
      }
      // Keep amount-matching check aligned with dialog filter (including legacy account fields).
      const v = allVouchers.find((x: any) =>
        x.id === id &&
        (
          ((x.type === "payment_in" || x.type === "direct_income") && ((x.accountId ?? x.toAccountId ?? x.bankAccountId) === spendWiseInAccountId)) ||
          (x.type === "contra" && (x.toAccountId ?? x.accountId) === spendWiseInAccountId)
        )
      );
      const amt = Number(v?.total ?? v?.amount ?? 0) || 0;
      const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
      return sum + Math.max(0, amt - alreadyLinked);
    }, 0);
  }, [allVouchers, linkedPaymentInIds, spendWiseInAccountId, linkedAmountByPaymentInId, spendWiseInAccountOpeningBalance]);
  const amountMatched = amount > 0 && linkedPaymentInTotal >= amount;
  const showLinkPayMode = !!fromAccountId && amount > 0;

  const paymentInDialogNames = useMemo(() => {
    const m: Record<string, string> = {};
    processedParties?.forEach((p: any) => { m[p.id] = p.name ?? ""; });
    processedStaff?.forEach((s: any) => { m[s.id] = s.name ?? ""; });
    processedTaxes?.forEach((t: any) => { m[t.id] = t.name ?? (t as any).label ?? ""; });
    allProcessedAccounts?.forEach((a: any) => { m[a.id] = a.accountName ?? ""; });
    processedExpenseAccounts?.forEach((e: any) => { m[e.id] = e.name ?? ""; });
    return m;
  }, [processedParties, processedStaff, processedTaxes, allProcessedAccounts, processedExpenseAccounts]);

  const showSpendWiseSection = showLinkPayMode;
  const isInVoucherForAccountContra = (x: any, accId: string) =>
    // Legacy safety: some old in-vouchers keep bank account in toAccountId/bankAccountId.
    ((x.type === "payment_in" || x.type === "direct_income") && ((x.accountId ?? x.toAccountId ?? x.bankAccountId) === accId)) ||
    // Contra in side uses destination account.
    (x.type === "contra" && (x.toAccountId ?? x.accountId) === accId);
  const spendWiseDisplayRows = useMemo(() => {
    if (!showSpendWiseSection || !allVouchers?.length || !linkedPaymentInIds?.length || !spendWiseInAccountId) return [];
    const uniqueIds = [...new Set(linkedPaymentInIds)];
    // Allocate using opposite-account inflows to keep Link Pay In behavior consistent.
    const allocated = allocatePaymentInAmounts(amount, linkedPaymentInIds, allVouchers, spendWiseInAccountId, linkedAmountByPaymentInId, spendWiseInAccountOpeningBalance);
    return uniqueIds.map((id) => {
      if (id === SPEND_WISE_OPENING_BALANCE_ID) {
        const amt = getOpeningBalanceBaseAmount(spendWiseInAccountOpeningBalance, "dr");
        const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
        return {
          id,
          voucherNumber: "Opening Balance (Dr)",
          date: null as Date | null,
          amount: amt,
          linked: allocated[id] ?? 0,
          linkedOnOthers: alreadyLinked,
          linkable: Math.max(0, amt - alreadyLinked),
          from: "Opening Balance",
        };
      }
      const v = allVouchers.find((x: any) => x.id === id && isInVoucherForAccountContra(x, spendWiseInAccountId));
      if (!v) return null;
      const date = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      const amt = Number(v.total ?? v.amount ?? 0) || 0;
      const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
      const linkable = Math.max(0, amt - alreadyLinked);
      const linkedFromThis = allocated[id] ?? 0;
      const from =
        v.type === "contra"
          ? (paymentInDialogNames[v.fromAccountId] ?? "—")
          : (paymentInDialogNames[v.partyId] ?? paymentInDialogNames[v.staffId] ?? paymentInDialogNames[v.taxAccountId] ?? paymentInDialogNames[v.incomeAccountId] ?? v.payeeName ?? "—");
      return {
        id,
        voucherNumber: v.voucherNumber ?? "—",
        date,
        amount: amt,
        linked: linkedFromThis,
        linkedOnOthers: alreadyLinked,
        linkable,
        from,
      };
    }).filter(Boolean) as { id: string; voucherNumber: string; date: Date | null; amount: number; linked: number; linkedOnOthers: number; linkable: number; from: string }[];
  }, [showSpendWiseSection, allVouchers, linkedPaymentInIds, spendWiseInAccountId, amount, linkedAmountByPaymentInId, paymentInDialogNames, spendWiseInAccountOpeningBalance]);

  /** Spend wise: count of Payment In / Direct Income / Contra for fromAccountId with linkable amount. Message uses "bcz" spelling. */
  const spendWiseLinkableCount = useMemo(() => {
    if (!spendWiseInAccountId || !allVouchers?.length) return 0;
    const voucherCount = allVouchers.filter((v: any) => {
      if (!isInVoucherForAccountContra(v, spendWiseInAccountId)) return false;
      const amt = Number(v.total ?? v.amount ?? 0) || 0;
      const alreadyLinked = linkedAmountByPaymentInId.get(v.id) ?? 0;
      return amt - alreadyLinked > 0;
    }).length;
    const obBase = getOpeningBalanceBaseAmount(spendWiseInAccountOpeningBalance, "dr");
    const obAlreadyLinked = linkedAmountByPaymentInId.get(SPEND_WISE_OPENING_BALANCE_ID) ?? 0;
    const obCount = obBase - obAlreadyLinked > 0 ? 1 : 0;
    return voucherCount + obCount;
  }, [spendWiseInAccountId, allVouchers, linkedAmountByPaymentInId, spendWiseInAccountOpeningBalance]);

  /** Top-left card (From Voucher): live Total linked and Balance so they update as soon as user links in dialog (add new or edit). */
  const spendWiseFromCardTotalLinked = useMemo(() => spendWiseDisplayRows.reduce((s, r) => s + r.linked, 0), [spendWiseDisplayRows]);
  const spendWiseFromCardBalance = useMemo(() => Math.max(0, amount - spendWiseFromCardTotalLinked), [amount, spendWiseFromCardTotalLinked]);
  const spendWiseFromCardSettled = amount > 0 && spendWiseFromCardTotalLinked >= amount;

  const currentContraVoucherId = voucher?.id ?? savedVoucherId;
  const spendWiseOppositeEditable = (company as { spendWiseOppositeVoucherEditable?: boolean } | null)?.spendWiseOppositeVoucherEditable === true;
  /** Show lower row (Contra voucher in To Other out) in both add new and edit — so user sees spend wise link cards. */
  const showSpendWiseOppositeSection = !!spendWiseOutAccountId;
  const openingBalanceLinkedByOthers = useMemo(() => {
    if (!spendWiseOutAccountId) return 0;
    return (allVouchers ?? [])
      .filter((v: any) => {
        const isInVoucherForAccount =
          ((v.type === "payment_in" || v.type === "direct_income") && (v.accountId ?? v.toAccountId ?? v.bankAccountId) === spendWiseOutAccountId) ||
          (v.type === "contra" && (v.toAccountId ?? v.accountId) === spendWiseOutAccountId);
        return isInVoucherForAccount && v.id !== currentContraVoucherId && !v.isDeleted;
      })
      .reduce((sum: number, v: any) => {
        if ((v.linkedOpeningBalanceAccountId ?? "") !== spendWiseOutAccountId) return sum;
        return sum + (Number(v.linkedOpeningBalanceAmount) || 0);
      }, 0);
  }, [allVouchers, spendWiseOutAccountId, currentContraVoucherId]);
  const spendWiseLinkedToMeRows = useMemo(() => {
    if (!showSpendWiseOppositeSection || !allVouchers?.length || !currentContraVoucherId || !spendWiseOutAccountId) return [];
    const accId = spendWiseOutAccountId;
    const outflows = allVouchers.filter(
      (v: any) =>
        !v.isDeleted &&
        Array.isArray(v.linkedPaymentInIds) &&
        v.linkedPaymentInIds.includes(currentContraVoucherId) &&
        ((v.type === "payment_out" && v.accountId === accId) ||
          (v.type === "direct_expense" && v.accountId === accId) ||
          (v.type === "contra" && v.fromAccountId === accId))
    );
    const rows = outflows.map((v: any) => {
      const date = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
      const amt = Number(v.total ?? v.amount ?? 0) || 0;
      const amounts = v.linkedPaymentInAmounts && typeof v.linkedPaymentInAmounts === "object" ? v.linkedPaymentInAmounts : {};
      const linked = amounts[currentContraVoucherId] != null ? Number(amounts[currentContraVoucherId]) : amt / (v.linkedPaymentInIds?.length || 1);
      const typeLabel = v.type === "payment_out" ? "Payment Out" : v.type === "direct_expense" ? "Direct Expense" : "Contra";
      let from = "—";
      if (v.type === "contra") {
        const acc = allProcessedAccounts?.find((a: any) => a.id === v.fromAccountId);
        from = acc?.accountName ?? "—";
      } else {
        const p = processedParties?.find((x: any) => x.id === v.partyId);
        const s = processedStaff?.find((x: any) => x.id === v.staffId);
        const e = processedExpenseAccounts?.find((x: any) => x.id === v.expenseAccountId || x.id === v.toAccountId);
        from = p?.name ?? s?.name ?? e?.name ?? "—";
      }
      return {
        id: v.id,
        voucherNumber: v.voucherNumber ?? "—",
        date,
        amount: amt,
        linked,
        typeLabel,
        from,
      };
    });
    const openingBase = getOpeningBalanceBaseAmount(spendWiseOutAccountOpeningBalance, "cr");
    const currentLinkedOB = Number((voucher as any)?.linkedOpeningBalanceAccountId === spendWiseOutAccountId ? (voucher as any)?.linkedOpeningBalanceAmount : 0) || 0;
    if (openingBase > 0 && currentLinkedOB > 0) {
      rows.push({
        id: SPEND_WISE_OPENING_BALANCE_ID,
        voucherNumber: "Opening Balance (Cr)",
        date: null,
        amount: openingBase,
        linked: currentLinkedOB,
        typeLabel: "Opening Balance",
        from: "Opening Balance",
      });
    }
    return rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }, [showSpendWiseOppositeSection, allVouchers, currentContraVoucherId, spendWiseOutAccountId, processedParties, processedStaff, allProcessedAccounts, processedExpenseAccounts, spendWiseOutAccountOpeningBalance, voucher]);

  /** Card display: when Done is clicked (pending set), show pending links live; otherwise server data. */
  const displayLinkedToMeRows = useMemo(() => {
    if (!pendingLinkedPaymentOut || !spendWiseOutAccountId || !allVouchers?.length) return spendWiseLinkedToMeRows;
    const accId = spendWiseOutAccountId;
    const rows = pendingLinkedPaymentOut.ids
      .map((id) => {
        if (id === SPEND_WISE_OPENING_BALANCE_ID) {
          const openingBase = getOpeningBalanceBaseAmount(spendWiseOutAccountOpeningBalance, "cr");
          const linked = pendingLinkedPaymentOut.amountsByVoucherId[id] ?? 0;
          return {
            id,
            voucherNumber: "Opening Balance (Cr)",
            date: null as Date | null,
            amount: openingBase,
            linked,
            typeLabel: "Opening Balance",
            from: "Opening Balance",
          };
        }
        const v = allVouchers.find((x: any) => x.id === id);
        if (!v || v.isDeleted) return null;
        const ok = (v.type === "payment_out" && v.accountId === accId) || (v.type === "direct_expense" && v.accountId === accId) || (v.type === "contra" && v.fromAccountId === accId);
        if (!ok) return null;
        const date = v.date?.toDate ? v.date.toDate() : (v.date ? new Date(v.date) : null);
        const amt = Number(v.total ?? v.amount ?? 0) || 0;
        const linked = pendingLinkedPaymentOut.amountsByVoucherId[id] ?? 0;
        let from = "—";
        if (v.type === "contra") {
          const acc = allProcessedAccounts?.find((a: any) => a.id === v.fromAccountId);
          from = acc?.accountName ?? "—";
        } else {
          const p = processedParties?.find((x: any) => x.id === v.partyId);
          const s = processedStaff?.find((x: any) => x.id === v.staffId);
          const e = processedExpenseAccounts?.find((x: any) => x.id === v.expenseAccountId || x.id === v.toAccountId);
          from = p?.name ?? s?.name ?? e?.name ?? "—";
        }
        return { id: v.id, voucherNumber: v.voucherNumber ?? "—", date, amount: amt, linked, typeLabel: v.type === "payment_out" ? "Payment Out" : v.type === "direct_expense" ? "Direct Expense" : "Contra", from };
      })
      .filter(Boolean);
    const typed = rows as { id: string; voucherNumber: string; date: Date | null; amount: number; linked: number; typeLabel: string; from: string }[];
    return typed.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }, [pendingLinkedPaymentOut, spendWiseLinkedToMeRows, allVouchers, spendWiseOutAccountId, allProcessedAccounts, processedParties, processedStaff, processedExpenseAccounts, spendWiseOutAccountOpeningBalance]);

  /** Count must match Link Pay Out dialog's To Voucher rows (linkable + already selected rows). */
  const spendWiseOutDialogRowCount = useMemo(() => {
    if (!spendWiseOutAccountId || !allVouchers?.length) return 0;
    const selectedIds = pendingLinkedPaymentOut ? pendingLinkedPaymentOut.ids : spendWiseLinkedToMeRows.map((r) => r.id);
    const selectedSet = new Set(selectedIds);
    const currentLinkedAmounts = pendingLinkedPaymentOut
      ? pendingLinkedPaymentOut.amountsByVoucherId
      : Object.fromEntries(spendWiseLinkedToMeRows.map((r) => [r.id, r.linked]));
    return allVouchers
      .filter(
        (v: any) =>
          !v.isDeleted &&
          ((v.type === "payment_out" && v.accountId === spendWiseOutAccountId) ||
            (v.type === "direct_expense" && v.accountId === spendWiseOutAccountId) ||
            (v.type === "contra" && v.fromAccountId === spendWiseOutAccountId))
      )
      .map((v: any) => {
        const amount = Number(v.total ?? v.amount ?? 0) || 0;
        const amounts = v.linkedPaymentInAmounts && typeof v.linkedPaymentInAmounts === "object" ? v.linkedPaymentInAmounts : {};
        const alreadyLinked = Object.values(amounts).reduce<number>((s, val) => s + (Number(val) || 0), 0);
        const currentLinked = Number((currentLinkedAmounts as Record<string, number>)[v.id] ?? 0) || 0;
        const linkable = Math.max(0, amount - alreadyLinked + currentLinked);
        return { id: v.id, linkable };
      })
      .concat((() => {
        const openingBase = getOpeningBalanceBaseAmount(spendWiseOutAccountOpeningBalance, "cr");
        if (openingBase <= 0) return [] as { id: string; linkable: number }[];
        const currentLinkedOB = Number((currentLinkedAmounts as Record<string, number>)[SPEND_WISE_OPENING_BALANCE_ID] ?? 0) || 0;
        const obLinkable = Math.max(0, openingBase - openingBalanceLinkedByOthers + currentLinkedOB);
        return [{ id: SPEND_WISE_OPENING_BALANCE_ID, linkable: obLinkable }];
      })())
      .filter((r) => r.linkable > 0 || selectedSet.has(r.id)).length;
  }, [spendWiseOutAccountId, allVouchers, pendingLinkedPaymentOut, spendWiseLinkedToMeRows, spendWiseOutAccountOpeningBalance, openingBalanceLinkedByOthers]);

  // Card count: Contra In follows Pay Out popup count; Contra Out keeps inflow-link count.
  const spendWiseCardAvailableCount = selectedContraLeg === 'in' ? spendWiseOutDialogRowCount : spendWiseLinkableCount;

  /** Total linked from this contra to Payment Out (used by Link Pay Out dialog summary). */
  const lowerCardTotalLinked = useMemo(() => displayLinkedToMeRows.reduce((s, r) => s + r.linked, 0), [displayLinkedToMeRows]);
  // Keep left "From Voucher" card synced with active contra leg.
  const fromCardLinkedTotal = selectedContraLeg === 'in' ? lowerCardTotalLinked : spendWiseFromCardTotalLinked;
  const fromCardBalance = Math.max(0, amount - fromCardLinkedTotal);
  const fromCardSettled = amount > 0 && fromCardLinkedTotal >= amount;
  const fromCardLinkedCount = selectedContraLeg === 'in' ? displayLinkedToMeRows.length : spendWiseDisplayRows.length;

  /** Block Save when link spend wise is ON and upper card (Payment In link) not settled. */
  const saveDisabledByLink =
    requirePaymentLink &&
    ((!linkedPaymentInIds?.length) || (!!linkedPaymentInIds?.length && !amountMatched));
  const linkPayOthersDisabled = saveDisabledByLink;

  const formDate = form.watch("date");
  const currentContraAccountId = selectedContraLeg === 'in' ? toAccountId : fromAccountId;
  const formVoucherNumber = selectedContraLeg === 'in'
    ? (form.watch("voucherNumberIn") || form.watch("voucherNumber") || voucher?.voucherNumberIn || voucher?.voucherNumber || "—")
    : (form.watch("voucherNumberOut") || form.watch("voucherNumber") || voucher?.voucherNumberOut || voucher?.voucherNumber || "—");
  const currentVoucherAsOnOppositeRows = useMemo(() => {
    if (!showSpendWiseSection || !currentContraAccountId) return [];
    const date = formDate;
    const amt = amount;
    const linked = spendWiseDisplayRows.reduce((s, r) => s + r.linked, 0);
    const from = allProcessedAccounts?.find((a: any) => a.id === currentContraAccountId)?.accountName ?? "—";
    return [
      {
        id: "current",
        voucherNumber: formVoucherNumber,
        date: date ? (date instanceof Date ? date : new Date(date)) : null,
        amount: amt,
        linked,
        linkedOnOthers: 0,
        from,
      },
    ];
  }, [showSpendWiseSection, currentContraAccountId, formDate, formVoucherNumber, voucher?.voucherNumber, amount, spendWiseDisplayRows, allProcessedAccounts]);
  // Compute after opposite-row memo so we never read it before initialization.
  const rightCardLinkedTotal = selectedContraLeg === 'in' ? lowerCardTotalLinked : (currentVoucherAsOnOppositeRows[0]?.linked ?? 0);

  const { displayBalance: fromAccountBalance } = useAccountBalance(fromAccountId);
  const { displayBalance: toAccountBalance } = useAccountBalance(toAccountId);
  const isAmountExceedingSelectedFromAccount = useCallback((enteredAmount: number) => {
    if (!fromAccountId) return false;
    const selectedBalance = Number(fromAccountBalance) || 0;
    return enteredAmount > selectedBalance;
  }, [fromAccountId, fromAccountBalance]);

  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.contra ?? true;
  const isVoucherEditingAllowed = company?.allowVoucherNumberEditing?.contra ?? false;
  const isPrefixSelectionEnabled = company?.enableVoucherPrefixSelection?.contra ?? false;

  const fetchVoucherNumber = useCallback(async (selectedPrefix?: string) => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    const prefixes = company?.voucherPrefixes?.contra || [getVoucherPrefix(company.voucherPrefixes as Record<string, string[]> | undefined)];
    const VOUCHER_PREFIX = selectedPrefix || prefixes[0];
    const base = getContraBasePrefix(company.voucherPrefixes as Record<string, string[]> | undefined);

    try {
      const q = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "contra"));
      const querySnapshot = await getDocs(q);
      let maxNum = 0;
      querySnapshot.docs.forEach(doc => {
        const d = doc.data();
        const outStr = d.voucherNumberOut ?? d.voucherNumber;
        const inStr = d.voucherNumberIn ?? d.voucherNumber;
        for (const numStr of [outStr, inStr].filter(Boolean)) {
          const num = parseVoucherNumberPart(numStr, VOUCHER_PREFIX) || parseVoucherNumberPart(numStr, base + " Out") || parseVoucherNumberPart(numStr, base + " In");
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });

      const nextNum = maxNum + 1;
      form.setValue("voucherNumber", formatVoucherNumber(VOUCHER_PREFIX, nextNum));
      form.setValue("voucherNumberOut", formatVoucherNumber(`${base} Out`, nextNum));
      form.setValue("voucherNumberIn", formatVoucherNumber(`${base} In`, nextNum));
    } catch (error) {
      console.error("Error fetching voucher count: ", error);
    }
  }, [companyId, company, form, isAutoVoucherEnabled]);

  useEffect(() => {
    if (voucher) {
      const vid = voucher.id;
      const isSameVoucher = lastResetVoucherIdRef.current === vid;
      if (vid && isSameVoucher && isFormDirty) return;
      if (vid) lastResetVoucherIdRef.current = vid;
      const initialValues: any = { ...voucher, files:[], date: voucher.date?.toDate ? voucher.date.toDate() : new Date(voucher.date) };
      if (isEditingAndConverting) {
          initialValues.voucherNumber = "";
      }
      // Contra Out/In: use stored values or derive from voucherNumber for old vouchers
      const base = getContraBasePrefix(company?.voucherPrefixes as Record<string, string[]> | undefined);
      const prefix = getVoucherPrefix(company?.voucherPrefixes as Record<string, string[]> | undefined);
      if (initialValues.voucherNumberOut == null || initialValues.voucherNumberOut === "") {
        const num = parseVoucherNumberPart(initialValues.voucherNumber || "", prefix);
        initialValues.voucherNumberOut = !isNaN(num) ? formatVoucherNumber(`${base} Out`, num) : (initialValues.voucherNumber || "");
      }
      if (initialValues.voucherNumberIn == null || initialValues.voucherNumberIn === "") {
        const num = parseVoucherNumberPart(initialValues.voucherNumber || "", prefix);
        initialValues.voucherNumberIn = !isNaN(num) ? formatVoucherNumber(`${base} In`, num) : (initialValues.voucherNumber || "");
      }
      form.reset(initialValues);
      setSavedVoucherId(voucher.id);
      setFiles(voucher.fileUrls || []);
      initialFilesRef.current = voucher.fileUrls || [];
    } else {
      lastResetVoucherIdRef.current = null;
    }
}, [voucher, form, isEditingAndConverting, company?.voucherPrefixes, isFormDirty]);

  
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

  const handleFormSubmit = useCallback(async (e: React.FormEvent, options: { saveAndNew?: boolean; print?: boolean; approveAfterSave?: boolean } = {}) => {
    e?.preventDefault?.();
    const enteredAmount = Number(form.getValues("amount")) || 0;
    if (isAmountExceedingSelectedFromAccount(enteredAmount)) {
      // Stop save when typed amount is higher than selected from-account balance.
      setIsAmountMoreThanAccountOpen(true);
      return;
    }
    const isValid = await form.trigger();
    if (!isValid) {
      sonnerToast.error("Validation Failed", { description: "Please check all fields and try again." });
      return;
    }
    onVoucherAction?.('saved', options.saveAndNew);
    await processAndSaveRef.current?.(form.getValues(), options.saveAndNew ?? false, options.approveAfterSave ? onApprove : undefined, options.approveAfterSave ?? false);
  }, [form, onVoucherAction, isAmountExceedingSelectedFromAccount]);
  
  async function processAndSave(data: ContraFormValues, saveAndNew: boolean = false, onSuccess?: () => void, approveAfterSave?: boolean) {
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
    if (amount > 0 && requirePaymentLink) {
      if (!linkedPaymentInIds?.length) {
        sonnerToast.error("Select Payment In", { description: "Linking is required for this role. Please choose at least one Payment In to link this contra to." });
        return;
      }
      if (linkedPaymentInIds?.length) {
        // Save-time validation must match the same pay-from account used in Link Pay In dialog.
        const spendWiseAccountForSave = (data as any).fromAccountId;
        const linkedTotal = linkedPaymentInIds.reduce((sum, id) => {
          if (id === SPEND_WISE_OPENING_BALANCE_ID) {
            // Include Opening Balance row in save-time spend-wise validation.
            const base = getOpeningBalanceBaseAmount(spendWiseInAccountOpeningBalance, "dr");
            const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
            return sum + Math.max(0, base - alreadyLinked);
          }
          // Use same compatibility matcher as dialog so save-validation doesn't hide valid legacy vouchers.
          const v = allVouchers?.find((x: any) =>
            x.id === id &&
            (
              ((x.type === "payment_in" || x.type === "direct_income") && ((x.accountId ?? x.toAccountId ?? x.bankAccountId) === spendWiseAccountForSave)) ||
              (x.type === "contra" && (x.toAccountId ?? x.accountId) === spendWiseAccountForSave)
            )
          );
          const amt = Number(v?.total ?? v?.amount ?? 0) || 0;
          const alreadyLinked = linkedAmountByPaymentInId.get(id) ?? 0;
          return sum + Math.max(0, amt - alreadyLinked);
        }, 0);
        if (linkedTotal < amount) {
          sonnerToast.error("Link amount too low", { description: "Selected Payment In linkable total must match or exceed the amount." });
          return;
        }
      }
    }

    const toastId = sonnerToast.loading("Saving contra entry...");
    setIsLoading(true);

    // Contra: primary number for duplicate check and save (Out/In treated as voucher numbers).
    const effectiveVoucherNumber = (data as any).voucherNumberOut ?? (data as any).voucherNumber;

    try {
      if (!savedVoucherId || effectiveVoucherNumber !== (voucher?.voucherNumberOut ?? voucher?.voucherNumber)) {
        const q = query(
          collection(firestore, `companies/${companyId}/vouchers`),
          where("voucherNumber", "==", effectiveVoucherNumber),
          where("type", "==", "contra")
        );
        const existingVoucherSnap = await getDocs(q);
        if (!existingVoucherSnap.empty && existingVoucherSnap.docs[0].id !== savedVoucherId) {
          sonnerToast.error("Duplicate Voucher Number", { id: toastId, description: "This voucher number is already in use." });
          setIsLoading(false);
          return;
        }
      }
      
      const date = data.date instanceof Date ? data.date : new Date((data as any).date);
      const amount = Number((data as any).amount || 0);
      // Build payload with only serializable fields (avoid form state carrying Timestamps/id that can break Firestore update)
      const submissionData: any = {
        fromAccountId: (data as any).fromAccountId,
        toAccountId: (data as any).toAccountId,
        voucherNumber: effectiveVoucherNumber,
        voucherNumberOut: (data as any).voucherNumberOut ?? (data as any).voucherNumber,
        voucherNumberIn: (data as any).voucherNumberIn ?? (data as any).voucherNumber,
        narration: (data as any).narration ?? '',
        date: date.toISOString(),
        amount,
        total: amount,
        fileUrls: files.filter((f): f is string => typeof f === 'string'),
        type: 'contra',
      };
      const linkIds = linkedPaymentInIds ?? [];
      submissionData.linkedPaymentInIds = linkIds;
      submissionData.linkedPaymentInAmounts =
        linkIds.length > 0
          // Persist spend-wise allocations against the same pay-from account used in Link Pay In dialog.
          ? allocatePaymentInAmounts(amount, linkIds, allVouchers ?? [], (data as any).fromAccountId, linkedAmountByPaymentInId, spendWiseInAccountOpeningBalance)
          : {};
      
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
          if (submissionData.fileUrls.length >= fileAttachmentLimits.maxFileCount) break;
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
          setSavedVoucherId(savedDoc.id);
          const savedLinkIds = Array.isArray(submissionData.linkedPaymentInIds) ? [...submissionData.linkedPaymentInIds] : [];
          initialLinkedPaymentInIdsRef.current = savedLinkIds;
          if (originalVoucherIdToDelete) {
               await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, originalVoucherIdToDelete), {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                convertedToType: 'contra',
                convertedToVoucherNumber: submissionData.voucherNumber,
            });
          }
          if (pendingLinkedPaymentOut && user?.uid) {
            const contraId = savedDoc.id;
            const previouslyLinkedIds = new Set(spendWiseLinkedToMeRows.map((r) => r.id));
            const allToUpdate = new Set([...previouslyLinkedIds, ...pendingLinkedPaymentOut.ids]);
            for (const poId of allToUpdate) {
              if (poId === SPEND_WISE_OPENING_BALANCE_ID) continue;
              const v = allVouchers?.find((x: any) => x.id === poId);
              if (!v) continue;
              const existingIds = Array.isArray(v.linkedPaymentInIds) ? [...v.linkedPaymentInIds] : [];
              const existingAmounts = v.linkedPaymentInAmounts && typeof v.linkedPaymentInAmounts === "object" ? { ...v.linkedPaymentInAmounts } : {};
              const newIds = existingIds.filter((id) => id !== contraId);
              delete existingAmounts[contraId];
              if (pendingLinkedPaymentOut.ids.includes(poId)) {
                const amt = pendingLinkedPaymentOut.amountsByVoucherId[poId] ?? 0;
                if (amt > 0) {
                  newIds.push(contraId);
                  existingAmounts[contraId] = amt;
                }
              }
              await updateVoucherSpendWiseLinks(companyId, poId, newIds, existingAmounts, user.uid);
            }
            const openingLinked = Number(pendingLinkedPaymentOut.amountsByVoucherId[SPEND_WISE_OPENING_BALANCE_ID] ?? 0) || 0;
            // Persist Opening Balance spend-wise link on current contra (In leg) so it remains visible after save/reopen.
            await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, contraId), {
              linkedOpeningBalanceAmount: openingLinked,
              linkedOpeningBalanceAccountId: openingLinked > 0 ? spendWiseOutAccountId : null,
            });
            setPendingLinkedPaymentOut(null);
          }
      } else {
          throw new Error("Failed to save voucher and get ID.");
      }

        if (approveAfterSave && savedDoc?.id) {
          if (!isEdit) {
            await approveVoucherWithHistory(companyId, savedDoc.id, user.uid, approverName);
          }
          sonnerToast.success(isEdit ? "Contra updated and approved." : "Contra saved and approved.", { id: toastId });
        } else {
          sonnerToast.success(isEdit ? "Contra updated!" : "Contra entry created!", { id: toastId });
        }
        triggerSync();

        if (companyId && company) {
          const isEdit = !!voucher?.id;
          const amount = Number(submissionData.amount) || 0;
          const vid = savedVoucherId || voucher?.id;
          if (isEdit) {
            const oldV = voucher as any;
            const changes = getChangedFieldLabels(
              { amount: oldV?.amount, narration: oldV?.narration, date: oldV?.date, voucherNumber: oldV?.voucherNumber, voucherNumberOut: oldV?.voucherNumberOut, voucherNumberIn: oldV?.voucherNumberIn, fromAccountId: oldV?.fromAccountId, toAccountId: oldV?.toAccountId },
              { amount: submissionData.amount, narration: submissionData.narration, date: submissionData.date, voucherNumber: submissionData.voucherNumber, voucherNumberOut: submissionData.voucherNumberOut, voucherNumberIn: submissionData.voucherNumberIn, fromAccountId: submissionData.fromAccountId, toAccountId: submissionData.toAccountId },
              [
                { key: "amount", label: "Amount" },
                { key: "narration", label: "Narration" },
                { key: "date", label: "Date" },
                { key: "voucherNumber", label: "Voucher number" },
                { key: "voucherNumberOut", label: "Voucher No. (Out)" },
                { key: "voucherNumberIn", label: "Voucher No. (In)" },
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
            form.reset({ fromAccountId: "", toAccountId: "", date: startOfDay(new Date()), voucherNumber: "", voucherNumberOut: "", voucherNumberIn: "", amount: 0, narration: "" });
            setFiles([]);
            setSavedVoucherId(null);
            await fetchVoucherNumber();
        }

        if (approveAfterSave && voucher?.id) onSuccess?.();
        else if (!approveAfterSave) onSuccess?.();
  
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        sonnerToast.error("Permission Denied", { id: toastId, description: error.message });
      } else if (isVoucherLimitError(error)) {
        sonnerToast.error("Voucher limit reached", { id: toastId, description: error.message, action: { label: "Upgrade", onClick: () => window.location.assign("/billing") } });
      } else {
        const message = error?.message || (typeof error === 'string' ? error : 'Unknown error');
        console.error("Error saving contra voucher:", error);
        sonnerToast.error("Error saving voucher.", { id: toastId, description: message });
      }
    } finally {
        setIsLoading(false);
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
  // Contra out (from account): show balance in option label and block non-positive balances.
  const fromBankCashAccountOptions = useMemo(
    () =>
      availableFromAccounts.map((a: any) => ({
        value: a.id,
        // Keep selected field clean (without balance); show balance only in dropdown list rows.
        triggerLabel: `${a.accountName} (${a.accountType})`,
        // Keep list balance short as requested: "2,000.00 Dr" (no "Balance:" / no currency prefix).
        label: `${a.accountName} (${a.accountType}) — ${formatCurrencyForPrint(Number(a.balance) || 0, { showDrCr: true, noSuffix: true, noAnimation: true })}`,
        isSpecial: a.isSpecial,
        disabled: (Number(a.balance) || 0) <= 0,
      })),
    [availableFromAccounts, formatCurrencyForPrint]
  );

  const voucherPrefixes = useMemo(() => company?.voucherPrefixes?.contra || [getVoucherPrefix()], [company]);
  

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
                  {/* Mobile: Date top-left only (old Voucher No. removed; Out/In are voucher numbers). */}
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field: dateField }: any) => (
                      <>
                        <div className="grid gap-2 w-full min-w-0 grid-cols-1 sm:grid-cols-2">
                          {(dateSystem === 'BS' || dateSystem === 'Both') && (
                            <FormItem className="min-w-0 w-full overflow-hidden">
                              <FormLabel className="text-xs truncate">Date (BS)</FormLabel>
                              <BsDatePicker valueAD={dateField.value} onChangeAD={(d) => { if (d) d.setHours(12, 0, 0, 0); dateField.onChange(d as Date); setIsCalendarOpen(false); }} isRange={false} transactionDates={transactionDates} className="h-9 text-xs w-full" disabled={deleteDisabledWhenLinked} />
                            </FormItem>
                          )}
                          {(dateSystem === 'AD' || dateSystem === 'Both') && (
                            <FormItem className="min-w-0 w-full overflow-hidden">
                              <FormLabel className="text-xs truncate">Date</FormLabel>
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button variant="outline" className={cn("h-9 pl-2 pr-2 text-left font-normal text-xs w-full min-w-0 max-w-full truncate", !dateField.value && "text-muted-foreground")} disabled={deleteDisabledWhenLinked}>
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
                  {/* Mobile: Contra Out and Contra In above From/To account — width responsive */}
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <FormField control={form.control} name="voucherNumberOut" render={({ field }: any) => (
                      <FormItem className="min-w-0">
                        <FormLabel className="text-xs truncate">Voucher No. (Out)</FormLabel>
                        <FormControl>
                          <Input placeholder="CNTR Out - 001" {...field} value={field.value ?? ""} className="h-9 text-xs w-full min-w-0" disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="voucherNumberIn" render={({ field }: any) => (
                      <FormItem className="min-w-0">
                        <FormLabel className="text-xs truncate">Voucher No. (In)</FormLabel>
                        <FormControl>
                          <Input placeholder="CNTR In - 001" {...field} value={field.value ?? ""} className="h-9 text-xs w-full min-w-0" disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  {/* Mobile: From Account and To Account - grid-cols-2 so fields fit inside dialog */}
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <FormField 
                      control={form.control} 
                      name="fromAccountId" 
                      render={({ field }: any) => (
                        <FormItem className="min-w-0">
                          <div className="flex justify-between items-baseline mb-1 min-w-0">
                            <FormLabel className="text-xs truncate">Pay from (From account)</FormLabel>
                            {fromAccountBalance !== null && <FormLabel className="text-[10px] text-muted-foreground shrink-0">Bal: {formatCurrencyForPrint(fromAccountBalance, { noSuffix: true, noAnimation: true })}</FormLabel>}
                          </div>
                          <div className="min-w-0 w-full overflow-hidden">
                            <Combobox 
                              triggerClassName="w-full min-w-0"
                              options={fromBankCashAccountOptions}
                              value={field.value} 
                              onChange={(value, newName) => { 
                                if (value === "add-new") openCreateAccountDialog('fromAccountId', newName); 
                                else field.onChange(value); 
                              }} 
                              // Keep placeholder short and consistent across voucher forms.
                              placeholder="Select account" 
                              addNewLabel="+ Add New Account" 
                              // Emphasize balance text in green inside dropdown options.
                              highlightBalanceInOptions
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
                        <FormItem className="min-w-0">
                          <div className="flex justify-between items-baseline mb-1 min-w-0">
                            <FormLabel className="text-xs truncate">To Account</FormLabel>
                            {toAccountBalance !== null && <FormLabel className="text-[10px] text-muted-foreground shrink-0">Bal: {formatCurrencyForPrint(toAccountBalance, { noSuffix: true, noAnimation: true })}</FormLabel>}
                          </div>
                          <div className="min-w-0 w-full overflow-hidden">
                            <Combobox 
                              triggerClassName="w-full min-w-0"
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
                  {/* PC View: Date top-left (old Voucher No. field removed; Out/In treated as voucher numbers). */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:justify-start md:items-end">
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
                              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
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
                  {/* PC View: Contra Out (above From account) and Contra In (above To account) — width like date, responsive */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="voucherNumberOut"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>Voucher No. (Out)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. CNTR Out - 001" {...field} value={field.value ?? ""} className={cn("w-full max-w-[14rem] md:max-w-[12rem]")} disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="voucherNumberIn"
                      render={({ field }: any) => (
                        <FormItem>
                          <FormLabel>Voucher No. (In)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. CNTR In - 001" {...field} value={field.value ?? ""} className={cn("w-full max-w-[14rem] md:max-w-[12rem]")} disabled={deleteDisabledWhenLinked || (isAutoVoucherEnabled && (!isVoucherEditingAllowed || !can('edit_voucher_numbers')))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* PC View: From Account and To Account */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="fromAccountId" render={({ field }: any) => (<FormItem>
                        <div className="flex justify-between items-baseline">
                            <FormLabel>Pay from (From account)</FormLabel>
                            {fromAccountBalance !== null && <FormLabel className={cn("text-xs font-semibold", fromAccountBalance >= 0 ? 'text-green-600' : 'text-red-600')}>{`Balance: ${formatCurrencyForPrint(fromAccountBalance, { showDrCr: true, noAnimation: true })}`}</FormLabel>}
                        </div>
                        {/* Keep desktop placeholder text aligned with mobile to avoid mixed wording. */}
                        <Combobox options={fromBankCashAccountOptions} value={field.value} onChange={(value, newName) => { if (value === "add-new") openCreateAccountDialog('fromAccountId', newName); else field.onChange(value); }} placeholder="Select account" addNewLabel="+ Add New Account" highlightBalanceInOptions disabled={deleteDisabledWhenLinked} /><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="toAccountId" render={({ field }: any) => (<FormItem>
                         <div className="flex justify-between items-baseline">
                            <FormLabel>To Account (Debit)</FormLabel>
                            {toAccountBalance !== null && <FormLabel className={cn("text-xs font-semibold", toAccountBalance >= 0 ? 'text-green-600' : 'text-red-600')}>{`Balance: ${formatCurrencyForPrint(toAccountBalance, { showDrCr: true, noAnimation: true })}`}</FormLabel>}
                        </div>
                        <Combobox options={availableToAccounts.map(a => ({ value: a.id, label: `${a.accountName} (${a.accountType})`, isSpecial: a.isSpecial }))} value={field.value} onChange={(value, newName) => { if (value === "add-new") openCreateAccountDialog('toAccountId', newName); else field.onChange(value); }} placeholder="Select destination account" addNewLabel="+ Add New Account" disabled={deleteDisabledWhenLinked} /><FormMessage /></FormItem>)}/>
                  </div>
                </>
              )}
              <FormField control={form.control} name="amount" render={({ field }: any) => (<FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="number" placeholder="Enter amount" {...field} value={field.value ?? ""} onChange={(e) => {
                const nextAmount = e.target.value === "" ? 0 : Number(e.target.value);
                // If entered amount exceeds selected from-account balance, keep previous valid value.
                if (isAmountExceedingSelectedFromAccount(nextAmount)) {
                  field.onChange(lastValidAmountRef.current);
                  setIsAmountMoreThanAccountOpen(true);
                  return;
                }
                field.onChange(nextAmount);
                // Persist last valid value so next invalid keystroke can rollback cleanly.
                lastValidAmountRef.current = nextAmount;
                if (isAmountExceedingSelectedFromAccount(nextAmount)) {
                  // Show immediate popup feedback while typing if amount crosses selected account balance.
                  setIsAmountMoreThanAccountOpen(true);
                }
              }} disabled={deleteDisabledWhenLinked} /></FormControl><FormMessage /></FormItem>)}/>
              {/* File pehle — link cards ke upar; warna link ke baad attach band ho jata hai */}
              <FormItem>
                <FormLabel>Attach Files (Optional)</FormLabel>
                <RestrictedFileUploader>
                  {/* When linked: add/remove disabled; existing files remain clickable to open */}
                  <div className="flex flex-wrap gap-4">
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
              {showSpendWiseSection && (
                <div className="space-y-4 min-w-0 w-full">
                  {/* Upper row: single main container for To Voucher + To Voucher (current) */}
                  <div className="min-w-0 w-full rounded-xl border-4 border-foreground/40 bg-muted/20 p-4">
                    <div className="flex justify-center mb-3">
                    <span className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 text-center">
                      {/* Show opposite account name so user knows which inflow side is being linked. */}
                      Other voucher in To Contra out{spendWiseInAccountId ? ` ( account ${allProcessedAccounts?.find((a: any) => a.id === spendWiseInAccountId)?.accountName ?? "—"} )` : ""}
                    </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0 w-full items-stretch">
                  {/* Top left: From Voucher — message inside card when Link for Bill Wise is ON */}
                  <div className="flex flex-col h-full min-h-0 space-y-2 rounded-lg border border-green-200 p-3 bg-green-50/80 min-w-0 w-full max-w-full overflow-hidden">
                    <div className="flex items-center justify-between gap-2 min-w-0 shrink-0">
                      <div className="flex items-center gap-2 font-medium min-w-0">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">Link for spend wise</span>
                      </div>
                      <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-base font-medium text-blue-700">From Voucher</span>
                    </div>
                    {requirePaymentLink && (
                      <p className="text-sm text-blue-600">
                        {spendWiseCardAvailableCount > 0
                            ? `${spendWiseCardAvailableCount} voucher${spendWiseCardAvailableCount === 1 ? "" : "s"} available to link, so link 1st to save.`
                            : "You can save this voucher without linking, bcz no voucher to link."}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {spendWiseCardAvailableCount} voucher(s) available to link.{fromCardLinkedCount > 0 && ` ${fromCardLinkedCount} linked.`}
                    </p>
                    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                    {!showSpendWiseSection ? (
                      <p className="text-sm text-muted-foreground">Select From account to link Payment In / Direct Income / Contra.</p>
                    ) : (selectedContraLeg === 'in' ? displayLinkedToMeRows.length === 0 : spendWiseDisplayRows.length === 0) ? null : (
                      <div className="overflow-x-auto -mx-1 min-w-0">
                        <table className="w-full text-sm border-collapse min-w-[400px]">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-2 font-medium whitespace-nowrap">Date</th>
                              <th className="text-left p-2 font-medium whitespace-nowrap">Voucher No.</th>
                              <th className="text-left p-2 font-medium whitespace-nowrap">{selectedContraLeg === 'in' ? 'To' : 'From'}</th>
                              <th className="text-right p-2 font-medium whitespace-nowrap">Amount</th>
                              {selectedContraLeg !== 'in' && <th className="text-right p-2 font-medium whitespace-nowrap">Linked on others</th>}
                              <th className="text-right p-2 font-medium whitespace-nowrap">Linked on current</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedContraLeg === 'in' ? displayLinkedToMeRows : spendWiseDisplayRows).map((row: any) => (
                              <tr key={row.id} className="border-b last:border-b-0">
                                <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? formatDate(row.date) : "—"}</td>
                                <td className="p-2 font-medium whitespace-nowrap">{row.voucherNumber}</td>
                                <td className="p-2 whitespace-nowrap">{row.from}</td>
                                <td className={cn("p-2 text-right font-medium whitespace-nowrap", selectedContraLeg === 'in' ? "text-red-600" : "text-green-600")}>
                                  {formatCurrency(row.amount, { noSuffix: true, noAnimation: true })} {selectedContraLeg === 'in' ? 'Cr' : 'Dr'}
                                </td>
                                {selectedContraLeg !== 'in' && (
                                  <td className="p-2 text-right text-muted-foreground whitespace-nowrap">{formatCurrency(row.linkedOnOthers ?? 0, { noSuffix: true, noAnimation: true })} Dr</td>
                                )}
                                <td className={cn("p-2 text-right whitespace-nowrap", selectedContraLeg === 'in' ? "text-red-600" : "text-muted-foreground")}>
                                  {formatCurrency(row.linked, { noSuffix: true, noAnimation: true })} {selectedContraLeg === 'in' ? 'Cr' : 'Dr'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    </div>
                    {showSpendWiseSection && (
                        <div className="pt-2 border-t space-y-2 shrink-0">
                          <div className="flex justify-end min-w-0">
                            <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                                <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                              </div>
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                                <span className="truncate text-right whitespace-nowrap leading-tight">
                                  {formatCurrency(fromCardLinkedTotal, { noSuffix: true, noAnimation: true })} {selectedContraLeg === 'in' ? 'Cr' : 'Dr'}
                                </span>
                              </div>
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                                <span className="truncate leading-tight">Balance</span>
                              </div>
                              <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                                <span className={cn("truncate text-right whitespace-nowrap leading-tight", fromCardSettled ? "text-green-600 font-semibold" : "")}>
                                  {fromCardSettled ? "Settled" : `${formatCurrency(fromCardBalance, { noSuffix: true, noAnimation: true })} ${selectedContraLeg === 'in' ? 'Cr' : 'Dr'}`}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            {/* Contra In should behave like Payment In: open outflow linker; Contra Out keeps inflow linker. */}
                            <Button
                              type="button"
                              onClick={() => selectedContraLeg === 'in' ? setIsLinkPaymentOutDialogOpen(true) : setIsLinkPaymentInDialogOpen(true)}
                              className={cn("w-fit", BTN_SAVE_CLASS)}
                            >
                              <Link2 className="h-4 w-4 mr-2" />
                              {selectedContraLeg === 'in' ? 'Link Pay Out' : 'Link Pay In'}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setLinkSectionInfoOpen(true)} aria-label="Link section information">
                              <Info className="h-4 w-4 shrink-0" />
                              Read me
                            </Button>
                          </div>
                        </div>
                    )}
                  </div>
                  {/* Top right: To Voucher ( current voucher ) — light blue */}
                  <div className="flex flex-col h-full min-h-0 space-y-2 rounded-lg border border-sky-200 p-3 bg-sky-50/80 min-w-0 w-full max-w-full overflow-hidden">
                    <div className="flex items-center justify-between gap-2 min-w-0 shrink-0">
                      <div className="flex items-center gap-2 font-medium min-w-0">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">Link for spend wise</span>
                      </div>
                      <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-base font-medium text-blue-700">To Voucher ( current voucher )</span>
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                    {currentVoucherAsOnOppositeRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Save the voucher to see how it appears on the opposite voucher.</p>
                    ) : (
                      <div className="overflow-x-auto -mx-1 min-w-0">
                        <table className="w-full text-sm border-collapse min-w-[400px]">
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
                            {currentVoucherAsOnOppositeRows.map((row) => (
                              <tr key={row.id} className="border-b last:border-b-0">
                                <td className="p-2 text-muted-foreground whitespace-nowrap">{row.date ? formatDate(row.date) : "—"}</td>
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
                    </div>
                    <div className="pt-2 border-t space-y-2 shrink-0">
                      {currentVoucherAsOnOppositeRows.length > 0 && (
                        <div className="flex justify-end min-w-0">
                          <div className="grid grid-cols-2 gap-1.5 text-sm w-fit">
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center min-h-0 min-w-0 overflow-hidden">
                              <span className="text-muted-foreground truncate leading-tight">Total linked</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end min-h-0 min-w-0 overflow-hidden">
                                <span className="truncate text-right whitespace-nowrap leading-tight">
                                  {formatCurrency(rightCardLinkedTotal, { noSuffix: true, noAnimation: true })} Dr
                              </span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-center font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className="truncate leading-tight">Balance</span>
                            </div>
                            <div className="rounded border border-border/60 bg-muted/40 px-1.5 py-px flex items-center justify-end font-medium min-h-0 min-w-0 overflow-hidden">
                              <span className={cn("truncate text-right whitespace-nowrap leading-tight", rightCardLinkedTotal >= currentVoucherAsOnOppositeRows[0].amount && currentVoucherAsOnOppositeRows[0].amount > 0 ? "text-green-600 font-semibold" : "")}>
                                {rightCardLinkedTotal >= currentVoucherAsOnOppositeRows[0].amount && currentVoucherAsOnOppositeRows[0].amount > 0
                                  ? "Settled"
                                  : `${formatCurrency(Math.max(0, currentVoucherAsOnOppositeRows[0].amount - rightCardLinkedTotal), { noSuffix: true, noAnimation: true })} Dr`}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 items-center">
                        {/* Current-voucher card should be read-only for linking action; keep only guidance/help action here. */}
                        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setLinkSectionInfoOpen(true)} aria-label="Link section information">
                          <Info className="h-4 w-4 shrink-0" />
                          Read me
                        </Button>
                      </div>
                    </div>
                  </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                <FormField control={form.control} name="narration" render={({ field }: any) => (<FormItem><FormLabel>Narration</FormLabel><FormControl><Textarea placeholder="e.g., Cash deposited to bank" {...field} /></FormControl><FormMessage /></FormItem>)}/>
              </div>
            </div>
          </ScrollArea>

          <div className={cn(
            "border-t min-w-0 max-w-full overflow-x-hidden",
            isMobile ? "mt-[3px] pt-[3px] pb-[3px]" : "pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4"
          )}>
            {isMobile ? (
              <div className={cn("grid grid-cols-3 gap-2 w-full", VOUCHER_BUTTONS_CLASS)}>
                {/* Row 0: Delete (left) | History (middle) | Save & Print (right) */}
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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
                <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || linkPayOthersDisabled || !showHistoryButton || !onOpenHistory} className={cn("w-full", BTN_HISTORY_CLASS)}>
                  History
                </Button>
                <Button type="button" onClick={(e) => handleFormSubmit(e, { print: true })} disabled={linkPayOthersDisabled || isLoading || editingDisabled} className={cn("w-full", BTN_PRINT_CLASS)}>
                  Save & Print
                </Button>
                {/* Row 1: Cancel | Approve or Save & Approve (when can approve) | Link Pay (when Spend Wise) | Save */}
                <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("w-full", BTN_CANCEL_CLASS)}>
                  Cancel
                </Button>
                {voucher?.id ? (
                  <Button type="button" onClick={async (e) => { e.preventDefault(); if (isFormDirty) await handleFormSubmit(e, { approveAfterSave: true }); else onApprove?.(); }} disabled={linkPayOthersDisabled || editingDisabled || !showApproveButton || !onApprove || isApproving || (!!voucher?.isApproved && !isFormDirty)} className={cn("w-full", BTN_APPROVE_CLASS)}>
                    {isApproving ? "..." : isFormDirty ? "Save & Approve" : "Approve"}
                  </Button>
                ) : showSaveAndApproveOnCreate ? (
                  <Button type="button" onClick={(e) => handleFormSubmit(e, { approveAfterSave: true })} disabled={linkPayOthersDisabled || isLoading || editingDisabled} className={cn("w-full", BTN_APPROVE_CLASS)}>
                    {isLoading ? "..." : "Save & Approve"}
                  </Button>
                ) : (
                  <Button type="button" disabled className="w-full bg-muted text-muted-foreground border-0 opacity-50">—</Button>
                )}
                {showLinkPayMode && (
                  <Button
                    type="button"
                    onClick={() => selectedContraLeg === 'in' ? setIsLinkPaymentOutDialogOpen(true) : setIsLinkPaymentInDialogOpen(true)}
                    className={cn("w-full", BTN_SAVE_CLASS)}
                  >
                    <Link2 className="mr-2 h-4 w-4" /> {selectedContraLeg === 'in' ? 'Link Pay Out' : 'Link Pay In'}
                  </Button>
                )}
                <Button type="submit" disabled={linkPayOthersDisabled || isLoading || editingDisabled} className={cn("w-full", BTN_SAVE_CLASS)}>
                  {isLoading ? "..." : "Save"}
                </Button>
              </div>
            ) : (
              <>
                <div className={cn("flex justify-center md:justify-start gap-2 flex-wrap", VOUCHER_BUTTONS_CLASS)}>
                  <Button type="button" onClick={onOpenHistory ?? (() => {})} disabled={!voucher?.id || !onOpenHistory} className={cn("shrink-0 rounded-full", BTN_HISTORY_CLASS)}>
                    <History className="mr-2 h-4 w-4" /> History
                  </Button>
                  <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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
                  <Button type="button" onClick={() => onVoucherAction?.('cancelled')} className={cn("shrink-0 rounded-full", BTN_CANCEL_CLASS)}>
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
            )}
          </div>
        </form>
      </Form>
      <CreateBankAccountDialog onAccountCreated={handleAccountCreated} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen} />
      {/* Link Pay In dialog uses same pay-from account so only relevant in-vouchers are listed. */}
      {/* Open in-voucher picker only for Contra Out leg; Contra In uses outflow picker (payment_in-like behavior). */}
      {isLinkPaymentInDialogOpen && selectedContraLeg === 'out' && spendWiseInAccountId && (
        <LinkPaymentInToPaymentOutDialog
          isOpen={isLinkPaymentInDialogOpen}
          onOpenChange={setIsLinkPaymentInDialogOpen}
          // Same-account mapping: CNTR Out -> same account's Payment In/Direct Income/Contra In.
          accountId={spendWiseInAccountId}
          vouchers={allVouchers ?? []}
          selectedIds={linkedPaymentInIds}
          onConfirm={(ids) => setLinkedPaymentInIds([...new Set(ids)])}
          names={paymentInDialogNames}
          requiredAmount={amount}
          currentVoucherId={voucher?.id ?? savedVoucherId ?? undefined}
          currentVoucherLinkedAmounts={
            voucher?.linkedPaymentInAmounts && typeof voucher.linkedPaymentInAmounts === "object"
              ? voucher.linkedPaymentInAmounts
              : {}
          }
          // Show current contra row in Link Pay In dialog so layout mirrors Link Pay Out dialog.
          currentVoucherSummary={{
            voucherNumber: formVoucherNumber,
            date: formDate ? (formDate instanceof Date ? formDate : new Date(formDate)) : null,
            from: allProcessedAccounts?.find((a: any) => a.id === spendWiseInAccountId)?.accountName ?? "—",
            amount,
            linkedTotal: spendWiseFromCardTotalLinked,
          }}
          accountName={allProcessedAccounts?.find((a: any) => a.id === spendWiseInAccountId)?.accountName ?? undefined}
          accountOpeningBalance={spendWiseInAccountOpeningBalance}
        />
      )}
      {/* Bottom-right: Link Pay Out — always show same-account out vouchers of current contra leg. */}
      {/* Outflow picker is used by both right card and Contra In left-card behavior. */}
      {spendWiseOutAccountId && currentContraVoucherId && (
        <LinkPaymentOutToPaymentInDialog
          isOpen={isLinkPaymentOutDialogOpen}
          onOpenChange={setIsLinkPaymentOutDialogOpen}
          accountId={spendWiseOutAccountId}
          currentPaymentInId={currentContraVoucherId}
          vouchers={allVouchers ?? []}
          selectedIds={pendingLinkedPaymentOut ? pendingLinkedPaymentOut.ids : spendWiseLinkedToMeRows.map((r) => r.id)}
          names={paymentInDialogNames}
          requiredAmount={amount}
          accountName={allProcessedAccounts?.find((a: any) => a.id === spendWiseOutAccountId)?.accountName ?? undefined}
          accountOpeningBalance={spendWiseOutAccountOpeningBalance}
          currentVoucherLinkedAmounts={pendingLinkedPaymentOut ? pendingLinkedPaymentOut.amountsByVoucherId : Object.fromEntries(spendWiseLinkedToMeRows.map((r) => [r.id, r.linked]))}
          currentVoucherSummary={{ voucherNumber: formVoucherNumber, date: formDate ? (formDate instanceof Date ? formDate : new Date(formDate)) : null, from: allProcessedAccounts?.find((a: any) => a.id === currentContraAccountId)?.accountName ?? "—", amount, linkedTotal: lowerCardTotalLinked }}
          onConfirm={(selectedIds, amountsByVoucherId) => {
            setPendingLinkedPaymentOut({ ids: selectedIds, amountsByVoucherId });
            setIsLinkPaymentOutDialogOpen(false);
          }}
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



"use client";

import * as React from "react";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import type { Account } from "@/components/bank-cash/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Edit,
  Printer,
  Landmark,
  Calendar as CalendarIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FilePlus,
  FileText,
  XCircle,
  MoreVertical,
  ArrowLeft,
  Search,
  Wrench,
  Crown,
  Columns3,
  ChevronDown,
  Info,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { DateRange } from "@/components/ui/ad-calendar";
import { format, startOfDay, endOfDay, isSameDay } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerDescription as MobileDialogDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import AdCalendar from "@/components/ui/ad-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDate } from "@/hooks/useDate";
import { EntityLedgerOpeningHints } from "@/components/common/EntityLedgerOpeningHints";
import { ScrollArea } from "../ui/scroll-area";
import { EditAccountDialog } from "../bank-cash/EditAccountDialog";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { FilePreview } from "../vouchers/FilePreview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "../ui/input";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { useTransactionVisibleColumns, COLUMN_LABELS, useSpendWiseBlinkMode, useShowNotes } from "../vouchers/transactionColumnVisibility";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import { SpendWiseBlinkInfoDialog } from "../vouchers/SpendWiseBlinkInfoDialog";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Checkbox } from "../ui/checkbox";
import { useTransactions } from "@/hooks/use-transactions";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";
import { Badge } from "../ui/badge";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getOpeningBalanceBaseAmount, getOpeningBalanceVoucherLabel, SPEND_WISE_OPENING_BALANCE_ID } from "@/lib/spendWiseOpeningBalance";
import {
  attachSpendWisePageEdgeFlags,
  buildSpendWiseDisplayBlocks,
  packFlatListByDataLineBudgetFromEnd,
} from "@/lib/spendWisePagination";

interface AccountDetailsProps {
  account: Account;
  onAccountUpdated: (updatedAccount: Partial<Account>) => void;
  onAccountDeleted: (deletedId: string) => void;
  dateRange?: DateRange | undefined;
  onDateRangeChange: (value: DateRange | undefined) => void;
  onBack?: () => void;
  allAccounts?: any[];
  userNames?: Record<string, string>;
  transactions?: any[];
  /** Master-detail mobile: "Showing x of y" title row me — set ho to niche duplicate row nahi */
  onMobileVoucherListStatsChange?: (stats: { showing: number; total: number } | null) => void;
}

export function AccountDetails({
  account: initialAccount,
  onAccountUpdated,
  onAccountDeleted,
  dateRange,
  onDateRangeChange,
  onBack,
  allAccounts,
  userNames,
  transactions,
  onMobileVoucherListStatsChange,
}: AccountDetailsProps) {
  const { company, companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS, formatCurrency, formatRunning } =
    useDate();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { vouchers, processedParties, processedStaff, processedExpenseAccounts, journalAccountNames } = useVouchers();
  const { user } = useAuth();
  const { can } = usePermissions();
  const effectiveBalanceMode = "statement" as const;

  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { spendWiseBlinkMode, setSpendWiseBlinkMode, toggleSpendWiseBlinkMode } = useSpendWiseBlinkMode();
  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const [blinkInfoOpen, setBlinkInfoOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "contra">(null);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [isDateSearchMode, setIsDateSearchMode] = useState(false);
  const BANK_SPEND_WISE_VIEW_KEY = "bank-cash-spendWiseView";
  const [spendWiseView, setSpendWiseViewState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(BANK_SPEND_WISE_VIEW_KEY) === "true";
    } catch {
      return false;
    }
  });
  const setSpendWiseView = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setSpendWiseViewState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(BANK_SPEND_WISE_VIEW_KEY, next ? "true" : "false");
      } catch {}
      return next;
    });
  }, []);
  const openingModalRef = useRef(false);

  // Desktop Calendar State
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  
  // Local State for Calendar Buffer
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);

  // Sync tempDateRange when prop changes
  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  const canViewSpecialBalance = can('view_special_account_balance');
  const showMaskedBalance = initialAccount.isSpecial && !canViewSpecialBalance;

  const account = useMemo(() => {
    if (!allAccounts) return initialAccount;
    return allAccounts.find(p => p.id === initialAccount.id) || initialAccount;
  }, [allAccounts, initialAccount]);

  const mobileSearchNames = useMemo(
    () => ({ ...journalAccountNames, ...(userNames || {}) }),
    [journalAccountNames, userNames]
  );

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    vouchers.forEach((v) => {
        const isRelevant =
            v.accountId === account.id ||
            v.toAccountId === account.id ||
            v.fromAccountId === account.id ||
            (v.entries && v.entries.some((e: any) => e.accountId === account.id));

        if (isRelevant) {
            const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
            if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
                dates.add(startOfDay(dateValue).getTime());
            }
        }
    });
    return Array.from(dates).map(d => new Date(d));
  }, [vouchers, account.id]);

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen =
    isMobile &&
    (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen || isEditAccountDialogOpen);

  const openModalInUrl = useCallback(() => {
    if (!isMobile || !pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("modal", "1");
    params.set("modalts", String(Date.now()));
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);

  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("modal");
    params.delete("modalts");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, searchParams, router]);

  const modalParam = searchParams.get("modal");
  const urlModalOpen = isMobile && modalParam === "1" && anyMobilePopupOpen;
  const closeUrlModal = useCallback(() => {
    setMobileFooterDialogOpen(null);
    setIsCalendarOpen(false);
    setIsVoucherDialogOpen(false);
    setSelectedVoucher(null);
    setIsNoteOpen(false);
    setIsEditAccountDialogOpen(false);
    closeModalInUrl();
  }, [closeModalInUrl]);
  useUrlModalBack(urlModalOpen, closeUrlModal);

  useEffect(() => {
    if (!isMobile) return;
    if (modalParam === "1") openingModalRef.current = false;
    if (modalParam !== "1" && anyMobilePopupOpen && !openingModalRef.current) {
      setMobileFooterDialogOpen(null);
      setIsCalendarOpen(false);
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      setIsNoteOpen(false);
      setIsEditAccountDialogOpen(false);
      closeModalInUrl();
    }
  }, [isMobile, modalParam, anyMobilePopupOpen, closeModalInUrl]);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const handleEditVoucher = (voucher: any) => {
    // Resolve synthetic spend-wise row ids back to real voucher id before opening edit.
    const rawId = typeof voucher?.id === "string" ? voucher.id : "";
    const resolvedId =
      voucher?._baseVoucherId ??
      (rawId.includes("-in-") ? rawId.substring(0, rawId.indexOf("-in-")) :
      rawId.endsWith("-ob-link") ? rawId.substring(0, rawId.length - "-ob-link".length) :
      rawId);
    if (voucher?.type === "opening_balance" || resolvedId === "__opening_balance_group__") {
      // Opening group header is synthetic; it should not open voucher edit dialog.
      return;
    }
    openingModalRef.current = true;
    setSelectedVoucher({ ...voucher, id: resolvedId });
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  };

  const handleTransactionOpen = useCallback((voucher: any) => {
    handleEditVoucher(voucher);
  }, [handleEditVoucher]);
  
  let { processedTransactions, openingBalanceForPeriod, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions(account, 'account', dateRange, undefined, allAccounts, transactions, undefined, filters, undefined, undefined, userNames);

  // If special account and user can't see balance, filter transactions to only show their own.
  if (account.isSpecial && !canViewSpecialBalance) {
      processedTransactions = processedTransactions.filter(t => t.userId === user?.uid);
      openingBalanceForPeriod = 0; // Don't show opening balance
      periodDr = processedTransactions.reduce((sum, t) => sum + (t.debit || 0), 0);
      periodCr = processedTransactions.reduce((sum, t) => sum + (t.credit || 0), 0);
      closingBalance = periodDr - periodCr;
  }

  // Spend Wise: never show notes. Statement: PC preference / mobile hamesha notes (includeNotesInTable).
  const baseTransactions = useMemo(() => {
    if (spendWiseView) return processedTransactions.filter((t: any) => t.type !== "note");
    return includeNotesInTable ? processedTransactions : processedTransactions.filter((t: any) => t.type !== "note");
  }, [processedTransactions, spendWiseView, includeNotesInTable]);
  const displayTransactions = useMemo(() => {
    if (!spendWiseView || !vouchers?.length) return baseTransactions;
    const byId = new Map(baseTransactions.map((t: any) => [t.id, t]));
    const inRangeIds = new Set(baseTransactions.map((t: any) => t.id));
    const accountId = account.id;
    const isInVoucher = (v: any) =>
      (v.type === "payment_in" && v.accountId === accountId) ||
      (v.type === "direct_income" && v.accountId === accountId) ||
      (v.type === "contra" && v.toAccountId === accountId);
    const linkedOutFilter = (v: any, inId: string) => {
      const hasAccount =
        (v.type === "payment_out" && v.accountId === accountId) ||
        (v.type === "direct_expense" && v.accountId === accountId) ||
        (v.type === "contra" && v.fromAccountId === accountId);
      return hasAccount && Array.isArray(v.linkedPaymentInIds) && v.linkedPaymentInIds.includes(inId);
    };
    // Keep opening-linked inflows near Opening Balance by rendering them in a dedicated group.
    const openingLinkedInIds = new Set(
      vouchers
        .filter((v: any) =>
          !v.isDeleted &&
          isInVoucher(v) &&
          (v.linkedOpeningBalanceAccountId ?? "") === accountId &&
          (Number(v.linkedOpeningBalanceAmount) || 0) > 0 &&
          inRangeIds.has(v.id)
        )
        .map((v: any) => v.id)
    );
    const openingLinkedOutIds = new Set(
      vouchers
        .filter((v: any) => !v.isDeleted && linkedOutFilter(v, SPEND_WISE_OPENING_BALANCE_ID) && inRangeIds.has(v.id))
        .map((v: any) => v.id)
    );
    const inVouchers = vouchers
      .filter((v: any) => {
        if (!isInVoucher(v) || v.isDeleted) return false;
        // Opening-linked inflow rows are shown beside Opening Balance group instead of normal stream.
        if (openingLinkedInIds.has(v.id)) return false;
        if (inRangeIds.has(v.id)) return true;
        return vouchers.some((o: any) => linkedOutFilter(o, v.id) && inRangeIds.has(o.id));
      })
      .sort((a: any, b: any) => {
        const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const db = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return da.getTime() - db.getTime();
      });
    const voucherToInRow = (v: any) => {
      const existing = byId.get(v.id);
      if (existing) return existing;
      const amount = Number(v.amount ?? v.total ?? 0) || 0;
      const voucherNo = v.type === "contra" && accountId === v.toAccountId ? (v.voucherNumberIn ?? v.voucherNumber) : v.voucherNumber;
      return { id: v.id, date: v.date, type: v.type, voucherNumber: voucherNo, debit: amount, credit: 0, userId: v.userId, narration: v.narration, accountId: v.accountId, ...v };
    };
    const voucherToOutRow = (v: any) => {
      const existing = byId.get(v.id);
      if (existing) return existing;
      const amount = Number(v.total ?? v.amount ?? 0) || 0;
      const voucherNo = v.type === "contra" && accountId === v.fromAccountId ? (v.voucherNumberOut ?? v.voucherNumber) : v.voucherNumber;
      return {
        id: v.id, date: v.date, type: v.type, voucherNumber: voucherNo,
        debit: 0, credit: amount,
        userId: v.userId, narration: v.narration, accountId: v.accountId, ...v,
      };
    };
    const rows: any[] = [];
    let groupColorIndex = 0;
    let rowKeySeed = 0;
    const nextColor = () => (groupColorIndex++) % 4;
    const nextRowKey = () => `r-${rowKeySeed++}`;
    /** Per payment-out id: total amount already shown in linked groups (so we can show remainder as separate row). */
    const linkedAmountByOutId = new Map<string, number>();
    // Track inflow amount already shown under Opening group so remainder can still appear as separate row.
    const linkedAmountByInId = new Map<string, number>();

    inVouchers.forEach((pi: any) => {
      const t = voucherToInRow(pi);
      const linkedOuts = vouchers.filter((v: any) => linkedOutFilter(v, pi.id));
      const hasLinkedGroup = linkedOuts.length > 0;
      const colorIdx = nextColor();
      const spendWiseGroupId = `sw-group-in-${pi.id}`;
      const groupRunning = (t.debit || 0) - (t.credit || 0);
      if (hasLinkedGroup) {
        rows.push({
          ...t,
          _rowKey: nextRowKey(),
          _spendWiseGroupId: spendWiseGroupId,
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: false,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
      } else {
        rows.push({
          ...t,
          _rowKey: nextRowKey(),
          _spendWiseGroupId: spendWiseGroupId,
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: true,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
        rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-pi-${pi.id}`, _rowKey: nextRowKey() });
      }
      linkedOuts.forEach((po: any, idx: number) => {
        const outRow = voucherToOutRow(po);
        const prevRunning = rows.length > 0 ? (rows[rows.length - 1] as any)._spendWiseRunningBalance : 0;
        const fullAmount = Number(po.total ?? po.amount ?? 0) || Math.abs((outRow.debit || 0) - (outRow.credit || 0)) || 0;
        const linkedAmounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
        const linkedAmount = linkedAmounts?.[pi.id] != null ? Number(linkedAmounts[pi.id]) : fullAmount / (po.linkedPaymentInIds?.length || 1);
        linkedAmountByOutId.set(po.id, (linkedAmountByOutId.get(po.id) ?? 0) + linkedAmount);
        const amountDelta = (outRow.credit || 0) > (outRow.debit || 0) ? -linkedAmount : linkedAmount;
        const nextRunning = typeof prevRunning === "number" ? prevRunning + amountDelta : prevRunning;
        rows.push({
          ...outRow,
          id: `${po.id}-in-${pi.id}`,
          _rowKey: nextRowKey(),
          _spendWiseGroupId: spendWiseGroupId,
          _spendWiseChild: true,
          _spendWiseGroupFirst: false,
          _spendWiseGroupLast: idx === linkedOuts.length - 1,
          _spendWiseRunningBalance: nextRunning,
          _spendWiseGroupColorIndex: colorIdx,
          _spendWiseLinkedAmount: linkedAmount,
        });
      });
      if (hasLinkedGroup) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-in-${pi.id}`, _rowKey: nextRowKey() });
    });
    // Build Opening Balance group and place linked inflows right under it.
    const openingSide = openingBalanceForPeriod >= 0 ? "dr" : "cr";
    const openingBase = getOpeningBalanceBaseAmount(openingBalanceForPeriod, openingSide);
    if (openingBase > 0 && ((openingSide === "cr" && openingLinkedInIds.size > 0) || (openingSide === "dr" && openingLinkedOutIds.size > 0))) {
      const colorIdx = nextColor();
      const spendWiseGroupId = "sw-group-opening-balance";
      const openingIsCr = openingSide === "cr";
      let openingRunning = openingIsCr ? -openingBase : openingBase;
      rows.push({
        id: "__opening_balance_group__",
        _rowKey: nextRowKey(),
        _spendWiseGroupId: spendWiseGroupId,
        type: "opening_balance",
        voucherNumber: getOpeningBalanceVoucherLabel(openingSide),
        date: undefined,
        debit: openingIsCr ? 0 : openingBase,
        credit: openingIsCr ? openingBase : 0,
        narration: "",
        _spendWiseGroupFirst: true,
        _spendWiseGroupLast: false,
        _spendWiseRunningBalance: openingRunning,
        _spendWiseGroupColorIndex: colorIdx,
      });
      const openingLinkedRows = vouchers
        .filter((v: any) => (openingIsCr ? openingLinkedInIds.has(v.id) : openingLinkedOutIds.has(v.id)))
        .sort((a: any, b: any) => {
          const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
          const db = b.date?.toDate ? b.date.toDate() : new Date(b.date);
          return da.getTime() - db.getTime();
        });
      openingLinkedRows.forEach((v: any, idx: number) => {
        const rowSource = openingIsCr ? voucherToInRow(v) : voucherToOutRow(v);
        const baseAmount = Math.abs((rowSource.debit || 0) - (rowSource.credit || 0));
        const linkedAmount = openingIsCr
          ? Math.max(0, Math.min(baseAmount, Number(v.linkedOpeningBalanceAmount) || 0))
          : Math.max(0, Math.min(baseAmount, Number((v.linkedPaymentInAmounts && typeof v.linkedPaymentInAmounts === "object")
              ? v.linkedPaymentInAmounts[SPEND_WISE_OPENING_BALANCE_ID]
              : 0) || (baseAmount / (v.linkedPaymentInIds?.length || 1))));
        if (openingIsCr) linkedAmountByInId.set(v.id, linkedAmount);
        else linkedAmountByOutId.set(v.id, (linkedAmountByOutId.get(v.id) ?? 0) + linkedAmount);
        openingRunning = openingIsCr ? (openingRunning + linkedAmount) : (openingRunning - linkedAmount);
        rows.push({
          ...rowSource,
          // Keep linked fragment separate; remainder of same voucher can still render below.
          id: `${v.id}-ob-link`,
          debit: openingIsCr ? linkedAmount : 0,
          credit: openingIsCr ? 0 : linkedAmount,
          _rowKey: nextRowKey(),
          _spendWiseGroupId: spendWiseGroupId,
          _spendWiseChild: true,
          _spendWiseGroupFirst: false,
          _spendWiseGroupLast: idx === openingLinkedRows.length - 1,
          _spendWiseRunningBalance: openingRunning,
          _spendWiseGroupColorIndex: colorIdx,
          _spendWiseLinkedAmount: linkedAmount,
        });
      });
      rows.push({ _spendWiseSpacer: true, id: "spend-wise-spacer-opening", _rowKey: nextRowKey() });
    }
    // Keep opening-balance group visually anchored at the top of spend-wise table.
    const openingStart = rows.findIndex((r: any) => r.id === "__opening_balance_group__");
    if (openingStart > 0) {
      let openingEnd = openingStart + 1;
      while (openingEnd < rows.length) {
        const cur = rows[openingEnd] as any;
        if (cur?._spendWiseGroupLast === true) {
          openingEnd++;
          if (openingEnd < rows.length && (rows[openingEnd] as any)?._spendWiseSpacer) openingEnd++;
          break;
        }
        openingEnd++;
      }
      const openingChunk = rows.splice(openingStart, openingEnd - openingStart);
      rows.unshift(...openingChunk);
    }
    const addedIds = new Set(rows.filter((r: any) => r.id && !(r as any)._spendWiseSpacer).map((r: any) => r.id));
    const unlinked = baseTransactions.filter((t: any) => !addedIds.has(t.id));
    unlinked.forEach((t: any, idx: number) => {
      const fullAmount = Math.abs((t.debit || 0) - (t.credit || 0));
      const alreadyShown = (linkedAmountByOutId.get(t.id) ?? 0) + (linkedAmountByInId.get(t.id) ?? 0);
      const remainder = fullAmount - alreadyShown;
      if (remainder <= 0) return;
      const colorIdx = nextColor();
      const spendWiseGroupId = `sw-group-unlinked-${t.id}`;
      const isOutflow = (t.credit || 0) > (t.debit || 0);
      const remainderRow = {
        ...voucherToOutRow(t),
        id: t.id,
        _rowKey: nextRowKey(),
        _spendWiseGroupId: spendWiseGroupId,
        debit: isOutflow ? 0 : remainder,
        credit: isOutflow ? remainder : 0,
        _spendWiseGroupFirst: true,
        _spendWiseGroupLast: true,
        _spendWiseRunningBalance: isOutflow ? -remainder : remainder,
        _spendWiseGroupColorIndex: colorIdx,
      };
      rows.push(remainderRow);
      if (idx < unlinked.length - 1) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-unlinked-${t.id}`, _rowKey: nextRowKey() });
    });
    return rows.length ? rows : baseTransactions;
  }, [spendWiseView, baseTransactions, vouchers, account.id, openingBalanceForPeriod]);

  // Sort only in statement view; spend-wise keeps group order
  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(DEFAULT_TRANSACTION_SORT_ORDER);
  const sortedTransactions = useMemo(() => {
    if (spendWiseView) return displayTransactions;
    return recomputeRunningBalanceTopToBottom(
      sortTransactionsWithFiscalMergeForCompany(displayTransactions, sortBy, sortOrder, undefined, company),
      openingBalanceForPeriod
    );
  }, [displayTransactions, spendWiseView, sortBy, sortOrder, openingBalanceForPeriod, company]);

  const displayTransactionCount = useMemo(
    () => sortedTransactions.filter((t: any) => !(t as any)._spendWiseSpacer).length,
    [sortedTransactions]
  );

  /** One row per block in statement; spend-wise: groups + spacers (used for search + pagination). */
  const displayBlocks = useMemo(
    () => buildSpendWiseDisplayBlocks(sortedTransactions, spendWiseView),
    [sortedTransactions, spendWiseView]
  );

  // Statement: one block/row. Spend-wise: paginate by **data line count** (non-spacer) with contiguous list slices
  // so a large group can show 10+10+5; page-edge flags on each row for split-group box borders in TransactionRow.
  const { totalPages, paginatedTransactions } = useMemo(() => {
    if (rowsPerPage <= 0) {
      return { totalPages: 1, paginatedTransactions: sortedTransactions };
    }
    if (!spendWiseView) {
      const blocks = displayBlocks;
      const n = blocks.length;
      if (n === 0) return { totalPages: 1, paginatedTransactions: [] as any[] };
      const totalPages = Math.max(1, Math.ceil(n / rowsPerPage));
      const safePage = Math.min(Math.max(1, currentPage), totalPages);
      const endB = n - (safePage - 1) * rowsPerPage;
      const startB = Math.max(0, endB - rowsPerPage);
      return { totalPages, paginatedTransactions: blocks.slice(startB, endB).flat() as any[] };
    }
    const full = sortedTransactions as any[];
    const pageRanges = packFlatListByDataLineBudgetFromEnd(full, rowsPerPage);
    if (pageRanges.length === 0) {
      return { totalPages: 1, paginatedTransactions: [] as any[] };
    }
    const totalPages = pageRanges.length;
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const { start, end } = pageRanges[safePage - 1]!;
    const { list } = attachSpendWisePageEdgeFlags(full, start, end);
    return { totalPages, paginatedTransactions: list as any[] };
  }, [sortedTransactions, displayBlocks, spendWiseView, rowsPerPage, currentPage]);
  // Page-break dynamic opening: first visible txn se pehle ka running balance opening row me dikhana.
  const desktopPageLedgerStats = useMemo(() => {
    const pageRows = (paginatedTransactions as any[]).filter((t: any) => !(t as any)?._spendWiseSpacer);
    let openingForPage = openingBalanceForPeriod;
    const firstTxn = pageRows[0] as any;
    if (firstTxn?.id) {
      const firstIdx = (sortedTransactions as any[]).findIndex((t: any) => t?.id === firstTxn.id);
      if (firstIdx > 0) {
        for (let i = firstIdx - 1; i >= 0; i--) {
          const prev = (sortedTransactions as any[])[i] as any;
          if (!prev || prev._spendWiseSpacer) continue;
          const prevBal =
            typeof prev.balance === "number"
              ? prev.balance
              : typeof prev.runningBalance === "number"
                ? prev.runningBalance
                : undefined;
          if (typeof prevBal === "number" && !Number.isNaN(prevBal)) {
            openingForPage = prevBal;
          }
          break;
        }
      }
    }
    const periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
    };
  }, [paginatedTransactions, sortedTransactions, openingBalanceForPeriod]);

  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v);
  // Books opening + (date par filter) view-start: table ke opening row se align
  const hasLedgerDateFilter = Boolean(dateRange?.from != null || dateRange?.to != null);
  const masterAccountOpening = Number(account.openingBalance) || 0;

  const clearFilters = () => {
    if(onDateRangeChange) {
      onDateRangeChange(undefined);
    }
    setFilters({});
  };

  const buildDateRangeText = () => {
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;
      if (dateSystem === "AD") dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    return dateRangeText;
  };

  const handlePrintStatement = async () => {
    if (!company) return;
    const toastId = toast.loading("Preparing print...");
    // Keep print synced with current view (statement/spend-wise), shown columns, and notes toggle.
    const printVisibleColumns = visibleColumns;
    const printTransactions = sortedTransactions.filter((t: any) => !(t as any)._spendWiseSpacer);
    try {
      await openPrintDirect({
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
        title: spendWiseView
          ? `Spend Wise Account Statement: ${account.accountName}`
          : `Account Statement: ${account.accountName}`,
        context: "account",
        contextId: account.id,
        dateSystem: dateSystem,
        dateRangeText: buildDateRangeText(),
        vouchersCount: printTransactions.length,
        openingBalance: openingBalanceForPeriod,
        openingBalanceDate: (account as any).openingBalanceDate,
        openingBalanceNarration: (account as any).openingBalanceNarration ?? null,
        transactions: printTransactions,
        showNarration: showNarration,
        includeNotes: includeNotesInTable,
        visibleColumns: printVisibleColumns,
        userNames: userNames,
        preserveOrder: spendWiseView,
        spendWise: Boolean(spendWiseView),
        billWise: false,
      }, true);
      toast.dismiss(toastId);
    } catch (e) {
      toast.dismiss(toastId);
      console.error("Print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };

  const handlePrintBillWise = async () => {
    if (!company) return;
    const toastId = toast.loading("Preparing print...");
    // Bill-wise print keeps Status column visible by design.
    const printVisibleColumns = { ...visibleColumns, status: true };
    const printTransactions = sortedTransactions.filter((t: any) => !(t as any)._spendWiseSpacer);
    try {
      await openPrintDirect({
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
        title: `Bill Wise Account Statement: ${account.accountName}`,
        context: "account",
        contextId: account.id,
        dateSystem: dateSystem,
        dateRangeText: buildDateRangeText(),
        vouchersCount: printTransactions.length,
        openingBalance: openingBalanceForPeriod,
        openingBalanceDate: (account as any).openingBalanceDate,
        openingBalanceNarration: (account as any).openingBalanceNarration ?? null,
        transactions: printTransactions,
        showNarration: showNarration,
        includeNotes: includeNotesInTable,
        visibleColumns: printVisibleColumns,
        userNames: userNames,
        preserveOrder: spendWiseView,
        billWise: true,
        openingBalanceOutstanding: showMaskedBalance ? undefined : openingBalanceOutstanding,
        openingBalanceLinkedVoucherNos: showMaskedBalance ? undefined : openingBalanceLinkedVoucherNos,
      }, true);
      toast.dismiss(toastId);
    } catch (e) {
      toast.dismiss(toastId);
      console.error("Print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };
  
  const balanceText = useMemo(() => {
    if (closingBalance === 0) return "Settled";
    return closingBalance >= 0 ? "Dr" : "Cr";
  }, [closingBalance]);
  
  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    const range = dateRange;
    if (!onDateRangeChange) return;
    if (!range?.from || (range.from && range.to)) {
      if (onDateRangeChange) onDateRangeChange({ from: adDate, to: undefined });
    } else if (adDate < range.from) {
      if (onDateRangeChange) onDateRangeChange({ from: adDate, to: range.from });
      setIsCalendarOpen(false);
    } else {
      if (onDateRangeChange) onDateRangeChange({ from: range.from, to: adDate });
      setIsCalendarOpen(false);
    }
  };
  
  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return sortedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    const rowMatches = (t: any) => {
      if ((t as any)._spendWiseSpacer) return false;
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "account", account.id).includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0).toLowerCase().includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    };
    // Spend wise: keep groups intact — if any row in a group matches, show the whole group
    if (spendWiseView && displayBlocks.length > 0) {
      const included = new Set<number>();
      for (let i = 0; i < displayBlocks.length; i++) {
        const block = displayBlocks[i];
        const isSpacerBlock = block.length === 1 && (block[0] as any)._spendWiseSpacer;
        if (isSpacerBlock) continue;
        if (block.some((r: any) => rowMatches(r))) included.add(i);
      }
      for (let i = 0; i < displayBlocks.length; i++) {
        const block = displayBlocks[i];
        const isSpacerBlock = block.length === 1 && (block[0] as any)._spendWiseSpacer;
        if (isSpacerBlock && (included.has(i - 1) || included.has(i + 1))) included.add(i);
      }
      return ([] as any[]).concat(...displayBlocks.filter((_, i) => included.has(i)));
    }
    return sortedTransactions.filter(t => rowMatches(t));
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS, spendWiseView, displayBlocks, mobileSearchNames, account.id]);

  const mobileFilterBlocks = useMemo(
    () => buildSpendWiseDisplayBlocks(filteredMobileTransactions, spendWiseView),
    [filteredMobileTransactions, spendWiseView]
  );

  // Mobile: latest-first paging (page 1 = newest). Spend-wise uses same data-line budget + edge flags as desktop.
  const mobileTransactionsToShow = useMemo(() => {
    const list = filteredMobileTransactions;
    if (rowsPerPage <= 0) return list;
    if (spendWiseView) {
      const pageRanges = packFlatListByDataLineBudgetFromEnd(list as any[], rowsPerPage);
      if (pageRanges.length === 0) return [] as any[];
      const totalPagesLocal = pageRanges.length;
      const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
      const { start, end } = pageRanges[safePage - 1]!;
      const { list: withFlags } = attachSpendWisePageEdgeFlags(list as any[], start, end);
      return withFlags;
    }
    const blocks = mobileFilterBlocks;
    const n = blocks.length;
    const totalPagesLocal = Math.max(1, Math.ceil(n / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const endB = n - (safePage - 1) * rowsPerPage;
    const startB = Math.max(0, endB - rowsPerPage);
    return blocks.slice(startB, endB).flat();
  }, [filteredMobileTransactions, mobileFilterBlocks, spendWiseView, currentPage, rowsPerPage]);
  const mobilePagerEdgeCounts = useMemo(() => {
    const list = filteredMobileTransactions;
    if (rowsPerPage <= 0) return { before: 0, after: 0 };
    if (spendWiseView) {
      const pageRanges = packFlatListByDataLineBudgetFromEnd(list as any[], rowsPerPage);
      if (pageRanges.length === 0) return { before: 0, after: 0 };
      const totalPagesLocal = pageRanges.length;
      const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
      const { start, end } = pageRanges[safePage - 1]!;
      return { before: start, after: Math.max(0, list.length - end) };
    }
    const blocks = mobileFilterBlocks;
    const n = blocks.length;
    const totalPagesLocal = Math.max(1, Math.ceil(n / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const endB = n - (safePage - 1) * rowsPerPage;
    const startB = Math.max(0, endB - rowsPerPage);
    const before = startB > 0 ? blocks.slice(0, startB).reduce((acc, b) => acc + b.length, 0) : 0;
    const pageLen = blocks.slice(startB, endB).reduce((acc, b) => acc + b.length, 0);
    return { before, after: Math.max(0, list.length - before - pageLen) };
  }, [filteredMobileTransactions, mobileFilterBlocks, spendWiseView, currentPage, rowsPerPage]);
  const mobilePageLedgerStats = useMemo(() => {
    const list = filteredMobileTransactions as any[];
    if (rowsPerPage <= 0) {
      const pageRows = list.filter((t: any) => !(t as any)?._spendWiseSpacer);
      const pageDr = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
      const pageCr = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
      return {
        openingForPage: openingBalanceForPeriod,
        periodDrForPage: pageDr,
        periodCrForPage: pageCr,
        closingForPage: openingBalanceForPeriod + pageDr - pageCr,
      };
    }
    if (spendWiseView) {
      const pageRanges = packFlatListByDataLineBudgetFromEnd(list, rowsPerPage);
      if (pageRanges.length === 0) {
        return {
          openingForPage: openingBalanceForPeriod,
          periodDrForPage: 0,
          periodCrForPage: 0,
          closingForPage: openingBalanceForPeriod,
        };
      }
      const totalPagesLocal = pageRanges.length;
      const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
      const { start, end } = pageRanges[safePage - 1]!;
      const pageSlice = list.slice(start, end);
      const pageRows = pageSlice.filter((t: any) => !t?._spendWiseSpacer);
      let openingForPage = openingBalanceForPeriod;
      const previousTx = start > 0 ? (list[start - 1] as any) : null;
      const previousRunningBalance =
        previousTx != null
          ? (typeof previousTx.balance === "number"
              ? previousTx.balance
              : typeof previousTx.runningBalance === "number"
                ? previousTx.runningBalance
                : undefined)
          : undefined;
      if (typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)) {
        openingForPage = previousRunningBalance;
      }
      const periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
      const periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
      return {
        openingForPage,
        periodDrForPage,
        periodCrForPage,
        closingForPage: openingForPage + periodDrForPage - periodCrForPage,
      };
    }
    const blocks = mobileFilterBlocks;
    const n = blocks.length;
    const totalPagesLocal = Math.max(1, Math.ceil(n / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const endB = n - (safePage - 1) * rowsPerPage;
    const startB = Math.max(0, endB - rowsPerPage);
    const pageSlice = blocks.slice(startB, endB).flat();
    const start = startB > 0 ? blocks.slice(0, startB).reduce((acc, b) => acc + b.length, 0) : 0;
    const pageRows = pageSlice.filter((t: any) => !(t as any)?._spendWiseSpacer);
    let openingForPage = openingBalanceForPeriod;
    const previousTx = start > 0 ? (list[start - 1] as any) : null;
    const previousRunningBalance =
      previousTx != null
        ? (typeof previousTx.balance === "number"
            ? previousTx.balance
            : typeof previousTx.runningBalance === "number"
              ? previousTx.runningBalance
              : undefined)
        : undefined;
    if (typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)) {
      openingForPage = previousRunningBalance;
    }
    const periodDrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageRows.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
    };
  }, [filteredMobileTransactions, mobileFilterBlocks, spendWiseView, rowsPerPage, currentPage, openingBalanceForPeriod]);

  const effectivePageCount = useMemo(() => {
    if (rowsPerPage <= 0) return 1;
    if (isMobile) {
      if (spendWiseView) {
        const p = packFlatListByDataLineBudgetFromEnd(filteredMobileTransactions as any[], rowsPerPage);
        return Math.max(1, p.length);
      }
      return Math.max(1, Math.ceil(mobileFilterBlocks.length / rowsPerPage));
    }
    if (spendWiseView) {
      const p = packFlatListByDataLineBudgetFromEnd(sortedTransactions as any[], rowsPerPage);
      return Math.max(1, p.length);
    }
    return Math.max(1, Math.ceil(displayBlocks.length / rowsPerPage));
  }, [
    rowsPerPage,
    isMobile,
    spendWiseView,
    filteredMobileTransactions,
    mobileFilterBlocks.length,
    sortedTransactions,
    displayBlocks.length,
  ]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), effectivePageCount));
  }, [dateRange, effectivePageCount, account.id, sortedTransactions.length, filteredMobileTransactions.length, mobileSearchTerm]);

  useEffect(() => {
    if (!onMobileVoucherListStatsChange) return;
    if (!isMobile) {
      onMobileVoucherListStatsChange(null);
      return;
    }
    onMobileVoucherListStatsChange({
      showing: mobileTransactionsToShow.length,
      total: filteredMobileTransactions.length,
    });
    return () => onMobileVoucherListStatsChange(null);
  }, [
    isMobile,
    onMobileVoucherListStatsChange,
    mobileTransactionsToShow.length,
    filteredMobileTransactions.length,
  ]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange || (dateRange.from == null && dateRange.to == null)) {
      return rowsPerPage > 0 ? `Last ${rowsPerPage} Txns` : "All Txns";
    }
    return buildDateRangeText();
  }, [dateRange, dateSystem, formatDateBS, rowsPerPage]);

  const accountNamesMap = useMemo(
    () => ({
      ...Object.fromEntries((allAccounts || []).map((a) => [a.id, a.accountName])),
      ...Object.fromEntries((processedParties || []).map((p) => [p.id, p.name])),
      ...Object.fromEntries((processedStaff || []).map((s) => [s.id, s.name])),
      ...Object.fromEntries((processedExpenseAccounts || []).map((e) => [e.id, e.name])),
    }),
    [allAccounts, processedParties, processedStaff, processedExpenseAccounts]
  );

  const handleMobileBack = useCallback(() => {
    if (mobileFooterDialogOpen) {
      setMobileFooterDialogOpen(null);
      closeModalInUrl();
      return;
    }
    if (isCalendarOpen) {
      setIsCalendarOpen(false);
      closeModalInUrl();
      return;
    }
    if (isVoucherDialogOpen) {
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      closeModalInUrl();
      return;
    }
    if (isEditAccountDialogOpen) {
      setIsEditAccountDialogOpen(false);
      closeModalInUrl();
      return;
    }
    if (isNoteOpen) {
      setIsNoteOpen(false);
      setNoteEntityId(null);
      closeModalInUrl();
      return;
    }
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isEditAccountDialogOpen, isNoteOpen, closeModalInUrl, onBack]);

  const renderMobileView = () => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
      {/* No pb-24 here: scroll area extends to footer; inner content has pb-24 so last row clears footer */}
      {/* Master-detail flow: count upar title row me; yahan sirf `/bank-cash/[id]` jaisa standalone — back + count */}
      {onMobileVoucherListStatsChange ? null : (
        <div className="px-2 py-1.5 border-b flex items-center gap-2 flex-shrink-0">
          {onBack ? (
            <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={handleMobileBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
      {/* Last 10 Txns / date range label */}
      <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
        <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
        {dateRange != null && (dateRange.from != null || dateRange.to != null) && onDateRangeChange && (
          <button
            type="button"
            onClick={() => onDateRangeChange(undefined)}
            className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Clear date filter"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Balance row */}
      <div className="px-3 py-2 border-b flex-shrink-0">
        <p className={cn("text-2xl font-bold flex justify-center items-baseline gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
          {showMaskedBalance ? (
            "*****"
          ) : closingBalance === 0 ? (
            "Settled"
          ) : (
            <>
              <span>{formatCurrency(Math.abs(closingBalance), { noSuffix: true })}</span>
              <span className="text-lg">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
            </>
          )}
        </p>
      </div>
      {/* Account dropdown + Edit icon + Search - same size (equal width & height) */}
      <div className="p-2 border-b flex-shrink-0">
        <div className="flex items-stretch gap-2">
          {allAccounts && allAccounts.length > 0 && (
            <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
              <Combobox
                options={allAccounts.map((p) => ({ value: p.id, label: p.accountName }))}
                value={account?.id || ""}
                onChange={(value) => {
                  if (!value || value === account.id) return;
                  // `/bank-cash/[id]` par chale jane se master-detail + "Bank & Cash · name" header tut jata tha — `?selected=` par hi rakho
                  router.replace(`/bank-cash?selected=${encodeURIComponent(value)}`, { scroll: false });
                }}
                placeholder="Select an account"
              />
            </div>
          )}
          {account.id !== "all" && (!account.isSpecial || can("manage_special_bank_accounts")) && (
            <EditAccountDialog
              account={account}
              allAccounts={allAccounts}
              onAccountUpdated={onAccountUpdated}
              onAccountDeleted={onAccountDeleted}
              hasTransactions={processedTransactions.length > 0}
              isOpen={isEditAccountDialogOpen}
              onOpenChange={(open) => {
                setIsEditAccountDialogOpen(open);
                if (open) {
                  openingModalRef.current = true;
                  openModalInUrl();
                } else {
                  closeModalInUrl();
                }
              }}
            >
              <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                <Edit className="h-4 w-4" />
              </Button>
            </EditAccountDialog>
          )}
          <div className="flex-1 min-w-0 h-9 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
            <Input
              placeholder="Search transactions"
              className="pl-8 h-9 text-sm w-full min-w-0"
              value={mobileSearchTerm}
              onChange={(e) => {
                setMobileSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      </div>
      {/* Transaction list - fills to footer line; inner pb-24 so last row scrolls above fixed footer */}
      {/* scroll-touch + inline style for APK/WebView touch scroll */}
      <div
        className={cn("flex-1 min-h-0 overflow-auto scroll-touch", spendWiseView && "p-[2px]")}
        style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div className="pb-24">
          {/* Bank/Cash pages use their own Statement/Spend-wise toggle, so keep the shared bill-wise mode from taking over here. */}
          <TransactionsTable
            transactions={mobileTransactionsToShow}
            context="account"
            contextId={account.id}
            forceBalanceMode="statement"
            openingBalance={showMaskedBalance ? 0 : mobilePageLedgerStats.openingForPage}
            openingBalanceOutstanding={showMaskedBalance ? undefined : openingBalanceOutstanding}
            openingBalanceLinkedVoucherNos={showMaskedBalance ? undefined : openingBalanceLinkedVoucherNos}
            openingBalanceNarration={(account as any).openingBalanceNarration}
            openingBalanceAttachmentUrls={account.documentFileUrls}
            /* entity form "As on" — TransactionsTable date column opening row */
            openingBalanceDate={(account as any).openingBalanceDate}
            showNarration={showNarration}
            visibleColumns={visibleColumns}
            journalAccountNames={journalAccountNames}
            userNames={userNames}
            accountNames={accountNamesMap}
            onRowClick={handleTransactionOpen}
            filters={filters}
            setFilters={setFilters}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            periodDr={showMaskedBalance ? undefined : mobilePageLedgerStats.periodDrForPage}
            periodCr={showMaskedBalance ? undefined : mobilePageLedgerStats.periodCrForPage}
            closingBalance={showMaskedBalance ? undefined : mobilePageLedgerStats.closingForPage}
            isBalanceMasked={showMaskedBalance}
            scrollOnlyTransactions
            blinkMode={spendWiseBlinkMode}
          />
        </div>
      </div>
      <MobileTransactionsPager
        className="flex-shrink-0 mb-12"
        currentPage={currentPage}
        totalItems={filteredMobileTransactions.length}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(nextRows) => {
          setRowsPerPage(nextRows);
          setCurrentPage(1);
        }}
        onPageChange={setCurrentPage}
        edgeCounts={rowsPerPage > 0 ? mobilePagerEdgeCounts : undefined}
      />
      
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
             <Button
               type="button"
               variant={spendWiseView ? "default" : "outline"}
               size="sm"
               className={cn(
                 "flex-1 h-6 min-w-0 rounded-md text-xs font-medium shrink-0",
                 !spendWiseView && "bg-violet-600 hover:bg-violet-700 text-white border-0"
               )}
               onClick={() => setSpendWiseView(!spendWiseView)}
             >
               {spendWiseView ? "Statement" : "Spend wise"}
             </Button>
             <Button
               className="flex-1 h-6 min-w-0 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
               onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_in"); openModalInUrl(); }}
             >
               Receive
             </Button>
             <Button
               className="flex-1 h-6 min-w-0 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
               onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_out"); openModalInUrl(); }}
             >
               Pay
             </Button>
             <Button
               className="flex-1 h-6 min-w-0 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
               onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("contra"); openModalInUrl(); }}
             >
               Contra
             </Button>
            <Drawer
              open={isCalendarOpen}
              onOpenChange={(open) => {
                if (open) {
                  openingModalRef.current = true;
                  openModalInUrl();
                } else {
                  closeModalInUrl();
                }
                setIsCalendarOpen(open);
              }}
            >
              <DrawerTrigger asChild>
                <Button className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium px-1 bg-pink-600 hover:bg-pink-700 text-white"><CalendarIcon className="h-3.5 w-3.5 shrink-0" /></Button>
              </DrawerTrigger>
              <DrawerContent>
                 <DrawerHeader className="p-4 text-left">
                    <DrawerTitle>Select Date Range</DrawerTitle>
                    <MobileDialogDescription>
                        Select a starting and ending date for the transaction list.
                    </MobileDialogDescription>
                </DrawerHeader>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                    {(dateSystem === 'BS' || dateSystem === 'Both') && (
                       <NepaliCalendar
                          rangePresetSlot={
                            <DateRangePresetRow
                              country={company?.country}
                              onApply={(r) => {
                                onDateRangeChange?.(r);
                                setIsCalendarOpen(false);
                              }}
                            />
                          }
                          onSelect={handleNepaliSelect}
                          valueAD={dateRange}
                          isRange={true}
                          numberOfMonths={calendarMonths}
                        />
                    )}
                    {(dateSystem === 'AD' || dateSystem === 'Both') && (
                      <div className="flex-1 w-full min-w-0">
                        <AdCalendar
                          rangePresetSlot={
                            <DateRangePresetRow
                              country={company?.country}
                              onApply={(r) => {
                                onDateRangeChange?.(r);
                                setIsCalendarOpen(false);
                              }}
                            />
                          }
                          valueAD={dateRange}
                          isRange
                          numberOfMonths={calendarMonths}
                          transactionDates={transactionDates}
                          onSelect={(adDate) => {
                            const range = dateRange;
                            if (!range?.from || (range.from && range.to)) {
                              onDateRangeChange?.({ from: adDate, to: undefined });
                            } else if (adDate < range.from) {
                              onDateRangeChange?.({ from: adDate, to: range.from });
                              setIsCalendarOpen(false);
                            } else {
                              onDateRangeChange?.({ from: range.from, to: adDate });
                              setIsCalendarOpen(false);
                            }
                          }}
                        />
                      </div>
                    )}
                 </div>
                 <DrawerFooter className="p-4 pt-2">
                    <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
        </div>
    </div>
  );

  const renderDesktopView = () => {
    return (
     <div className="h-full flex flex-col">
        {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
              <EntityFileAttachmentHover fileUrl={account.fileUrl} triggerClassName="inline-flex shrink-0 rounded-full">
                <ResolvedEntityAvatar
                  className="h-12 w-12 text-lg flex-shrink-0 border"
                  src={account.fileUrl}
                  alt={account.accountName}
                  fallbackSlot={
                    account.isSpecial ? (
                      <Crown className="h-6 w-6 text-amber-500" />
                    ) : (
                      <Landmark className="h-6 w-6 text-muted-foreground" />
                    )
                  }
                />
              </EntityFileAttachmentHover>
              <div className="flex flex-col min-w-0 gap-0.5">
                <div className="flex items-center gap-2 flex-nowrap min-w-0">
                  <h2 className="text-xl font-semibold truncate">{account.accountName}</h2>
                  {account.id !== 'all' && (!account.isSpecial || can('manage_special_bank_accounts')) && (
                    <EditAccountDialog
                      account={account}
                      allAccounts={allAccounts}
                      onAccountUpdated={onAccountUpdated}
                      onAccountDeleted={onAccountDeleted}
                      hasTransactions={processedTransactions.length > 0}
                    >
                      <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" data-theme-detail="edit">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </EditAccountDialog>
                  )}
                  <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0 flex justify-center items-baseline gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                    {showMaskedBalance ? (
                      "*****"
                    ) : closingBalance === 0 ? (
                      "Settled"
                    ) : (
                      <>
                        <span>{formatCurrency(Math.abs(closingBalance), { showDrCr: false })}</span>
                        <span className="text-sm">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
                      </>
                    )}
                  </div>
                </div>
                {!showMaskedBalance && (
                  <EntityLedgerOpeningHints
                    masterOpening={masterAccountOpening}
                    periodOpeningBroughtForward={openingBalanceForPeriod}
                    hasDateFilter={hasLedgerDateFilter}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={onDateRangeChange}
                  transactionDates={transactionDates}
                  className="w-auto"
                />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <Popover open={isDesktopCalendarOpen} onOpenChange={setIsDesktopCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn("justify-start text-left font-normal h-10 px-2 w-auto flex-shrink-0", !dateRange && "text-muted-foreground")}
                      data-theme-detail="date-range"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} -{" "}
                            {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <AdCalendar
                      rangePresetSlot={
                        <DateRangePresetRow
                          country={company?.country}
                          onApply={(r) => {
                            setTempDateRange(r);
                            onDateRangeChange(r);
                            setIsDesktopCalendarOpen(false);
                          }}
                        />
                      }
                      valueAD={tempDateRange}
                      isRange
                      numberOfMonths={calendarMonths}
                      transactionDates={transactionDates}
                      onSelect={(adDate) => {
                        const range = tempDateRange;
                        if (!range?.from || (range.from && range.to)) {
                          setTempDateRange({ from: adDate, to: undefined });
                        } else if (adDate < range.from) {
                          const next = { from: adDate, to: range.from };
                          setTempDateRange(next);
                          onDateRangeChange(next);
                          setIsDesktopCalendarOpen(false);
                        } else {
                          const next = { from: range.from, to: adDate };
                          setTempDateRange(next);
                          onDateRangeChange(next);
                          setIsDesktopCalendarOpen(false);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {isFilterActive && (
                <Button variant="ghost" size="icon" onClick={clearFilters} className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear date filter">
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant={spendWiseView ? "default" : "outline"}
                size="sm"
                onClick={() => setSpendWiseView(!spendWiseView)}
                className="flex-shrink-0 h-10"
              >
                {spendWiseView ? "Statement" : "Spend wise"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsNoteOpen(true)} className="flex-shrink-0 h-10" data-theme-detail="add-note">
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
              </Button>
              <Button variant="outline" size="icon" onClick={handlePrintStatement} className="flex-shrink-0 h-10 w-10" data-theme-detail="print">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        {/* Bank account PDF/images — party Details jaisa preview strip */}
        {account.documentFileUrls && account.documentFileUrls.length > 0 && account.id !== "all" && (
          <div className="border-b px-3 py-2 flex flex-wrap gap-2 items-start bg-muted/15">
            <span className="text-xs font-medium text-muted-foreground pt-1">Documents:</span>
            <div className="flex flex-wrap gap-2">
              {account.documentFileUrls.map((url, i) => (
                <FilePreview key={`${url}-${i}`} file={url} size={56} />
              ))}
            </div>
          </div>
        )}

        {/* TABLE AREA - Statement = running balance; Bill wise = per-row outstanding (same as PartyDetails) */}
        <div className="flex-1 flex flex-col min-h-0 overflow-x-auto scrollbar-slim-dim">
          <div className={cn("py-4 flex-1 flex flex-col min-h-0 min-w-0", spendWiseView && "p-[2px]")}>
            {/* Bank/Cash pages use their own Statement/Spend-wise toggle, so keep the shared bill-wise mode from taking over here. */}
            <TransactionsTable
              key={`account-${account.id}-${effectiveBalanceMode}`}
              transactions={paginatedTransactions}
              context="account"
              contextId={account.id}
              forceBalanceMode="statement"
              openingBalance={showMaskedBalance ? 0 : desktopPageLedgerStats.openingForPage}
              openingBalanceOutstanding={showMaskedBalance ? undefined : openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={showMaskedBalance ? undefined : openingBalanceLinkedVoucherNos}
              openingBalanceNarration={(account as any).openingBalanceNarration}
              openingBalanceAttachmentUrls={account.documentFileUrls}
              openingBalanceDate={(account as any).openingBalanceDate}
              openingBalanceActions={
                account.id !== "all" && (!account.isSpecial || can("manage_special_bank_accounts")) ? (
                  <EditAccountDialog
                    account={account}
                    allAccounts={allAccounts}
                    onAccountUpdated={onAccountUpdated}
                    onAccountDeleted={onAccountDeleted}
                    hasTransactions={processedTransactions.length > 0}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </EditAccountDialog>
                ) : null
              }
              showNarration={showNarration}
              visibleColumns={visibleColumns}
              journalAccountNames={journalAccountNames}
              userNames={userNames}
              accountNames={accountNamesMap}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={showMaskedBalance ? undefined : desktopPageLedgerStats.periodDrForPage}
              periodCr={showMaskedBalance ? undefined : desktopPageLedgerStats.periodCrForPage}
              closingBalance={showMaskedBalance ? undefined : desktopPageLedgerStats.closingForPage}
              isBalanceMasked={showMaskedBalance}
              scrollOnlyTransactions
              blinkMode={spendWiseBlinkMode}
            />
          </div>
        </div>
        {/* Footer: Part 1 (count, narration) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox id="show-narration-account" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
                <label htmlFor="show-narration-account" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 flex-shrink-0">
                    <Columns3 className="h-4 w-4" />
                    Columns
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 p-2">
                  {(Object.keys(COLUMN_LABELS) as TransactionColumnKey[])
                    .filter((key) => key !== "status")
                    .map((key) => (
                      <DropdownMenuItem
                        key={key}
                        onSelect={(e) => e.preventDefault()}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox
                          id={`col-${key}-account`}
                          checked={visibleColumns[key] !== false}
                          onCheckedChange={(c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-account`} className="text-sm font-medium flex-1 cursor-pointer">
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {!spendWiseView && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Checkbox id="show-notes-account" checked={includeNotesInTable} disabled={notesPreferenceLockedOnMobile} onCheckedChange={(c) => setShowNotes(Boolean(c))} />
                  <label htmlFor="show-notes-account" className="text-sm font-medium leading-none whitespace-nowrap cursor-pointer">Note</label>
                </div>
              )}
              {spendWiseView && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1 flex-shrink-0 min-w-0">
                      {/* Keep trigger text concise while supporting multi-select blink modes. */}
                      <span className="truncate">
                        {spendWiseBlinkMode.length === 0
                          ? "Off"
                          : spendWiseBlinkMode.length === 1
                            ? spendWiseBlinkMode[0] === "all"
                              ? "Blink all"
                              : spendWiseBlinkMode[0] === "group"
                                ? "Blink group"
                                : "Blink row"
                            : `${spendWiseBlinkMode.length} selected`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 p-2">
                    {/* Prevent menu close on each toggle so user can multi-select quickly. */}
                    <DropdownMenuCheckboxItem
                      checked={spendWiseBlinkMode.includes("all")}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) => toggleSpendWiseBlinkMode("all", checked === true)}
                    >
                      Blink all
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={spendWiseBlinkMode.includes("group")}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) => toggleSpendWiseBlinkMode("group", checked === true)}
                    >
                      Blink group
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={spendWiseBlinkMode.includes("row")}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) => toggleSpendWiseBlinkMode("row", checked === true)}
                    >
                      Blink row
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={spendWiseBlinkMode.length === 0}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) => { if (checked === true) setSpendWiseBlinkMode([]); }}
                    >
                      Off
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuItem onSelect={() => setBlinkInfoOpen(true)} className="flex items-center gap-2">
                      <Info className="h-4 w-4 shrink-0" />
                      About
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {spendWiseView && <SpendWiseBlinkInfoDialog open={blinkInfoOpen} onOpenChange={setBlinkInfoOpen} />}
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <TransactionTableSortDropdown
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); }}
                viewMode={spendWiseView ? "spend_wise" : "statement"}
              />
              <p className="text-sm font-medium flex-shrink-0">
                Page {currentPage} of {totalPages}
              </p>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select
                value={`${rowsPerPage}`}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value) || 0);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={`${rowsPerPage}`} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>
                  ))}
                  <SelectItem value="0">All</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
              <p className="text-sm font-medium flex-shrink-0 tabular-nums">Total Trxn {displayTransactionCount}</p>
            </div>
          </div>
        </div>
      </div>
  );
  }

  return (
    <>
      <div className={cn("h-full", isMobile && "flex flex-col min-h-0")}>
        {isMobile ? renderMobileView() : renderDesktopView()}
      </div>
      <Dialog
        open={isNoteOpen}
        onOpenChange={(open) => {
          setIsNoteOpen(open);
          if (!open) {
            setNoteEntityId(null);
            closeModalInUrl();
          } else if (isMobile) {
            openingModalRef.current = true;
            openModalInUrl();
          }
        }}
      >
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for {account.accountName}</DialogTitle>
            <DialogDescription>
              Record a new note associated with this account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <CreateNoteForm
              onVoucherAction={() => {
                onAccountUpdated(account);
                setIsNoteOpen(false);
              }}
              initialContext="Bank/Cash"
              initialEntityId={account.id}
              // Role-wise: only users with approve permission get Save & Approve in account-linked note modal.
              showSaveAndApproveOnCreate={can("approve_transactions")}
              compactFooter
            />
          </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        defaultTab={mobileFooterDialogOpen ?? "payment_in"}
        isOpen={mobileFooterDialogOpen !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setMobileFooterDialogOpen(null);
            closeModalInUrl();
          }
        }}
      />
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open: boolean) => {
          setIsVoucherDialogOpen(!!open);
          if (!open) {
            setSelectedVoucher(null);
            if (isMobile) closeModalInUrl();
          }
        }}
        voucher={selectedVoucher}
        onVoucherUpdated={() => setSelectedVoucher(null)}
      />
    </>
  );
}

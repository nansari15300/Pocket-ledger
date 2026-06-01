
"use client";

import * as React from "react";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import { Button } from "@/components/ui/button";
import { LedgerViewModePills, LedgerViewModeToggleButton } from "@/components/ui/LedgerViewModePills";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Edit, Printer, Users, Calendar as CalendarIcon, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FilePlus, XCircle, MoreVertical, ArrowLeft, Scroll, DollarSign, ChevronDown, Crown, Columns3, Search, Info } from "lucide-react";
import { TransactionsTable, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { useTransactionVisibleColumns, COLUMN_LABELS, useSpendWiseBlinkMode, useShowNotes } from "../vouchers/transactionColumnVisibility";
import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";
import { LedgerFooterCheckboxPill } from "@/components/vouchers/ledgerFooterChrome";
import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";
import { LedgerDesktopFooter } from "@/components/vouchers/LedgerDesktopFooter";
import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";
import { useLedgerUnapprovedOnlyFilter } from "@/hooks/useLedgerUnapprovedOnlyFilter";
import { LedgerUnapprovedFilterButton } from "@/components/vouchers/LedgerUnapprovedFilterButton";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { SpendWiseBlinkInfoDialog } from "../vouchers/SpendWiseBlinkInfoDialog";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";
import { mdc } from "@/lib/mobileDetailChrome";
import { MobileDetailSummaryCollapsible } from "@/components/layout/MobileDetailSummaryCollapsible";
import {
  clearPlModalParentQueryBackup,
  pathnameForModalRouterReplace,
  patchMasterDetailUrlAfterModalClose,
  persistPlModalParentQuery,
  searchParamsStringAfterClosingModal,
  searchParamsStringForModalClose,
} from "@/lib/modalUrlSync";
import { startOfDay, endOfDay, format } from "date-fns";
import AdCalendar from "../ui/ad-calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { perfDebugLog, perfNow } from "@/lib/perfDebug";
import BsDatePicker from "@/components/ui/BsDatePicker";
import {
  LEDGER_HEADER_PILL_CN,
  LEDGER_HEADER_PILL_ICON_CN,
  LEDGER_HEADER_PILL_ICON_SIZE_CN,
} from "@/lib/ledgerHeaderChrome";
import { useCompany } from "@/hooks/useCompany";
import { EditAccountGroupDialog } from "@/components/bank-cash/EditAccountGroupDialog";
import { AccountFilterDropdown } from "@/components/bank-cash/AccountFilterDropdown";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import { useTransactions } from "@/hooks/use-transactions";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { useVouchers } from "@/hooks/useVouchers";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Input } from "../ui/input";
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
  computeStatementFooterCountsFromPage,
  packFlatListByDataLineBudgetFromEnd,
  reorderSpendWiseRowsByDate,
} from "@/lib/spendWisePagination";
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from "@/lib/firebase";
import usePermissions from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "../ui/combobox";
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
import NepaliCalendar from "../ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";


const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

export function AccountGroupDetails({ 
  group,
  allGroups,
  accounts,
  onGroupUpdated, 
  onGroupDeleted,
  onAccountUpdated,
  dateRange,
  onDateRangeChange,
  onBack,
  userNames,
}: { 
  group: AccountGroup, 
  allGroups: AccountGroup[],
  accounts: Account[],
  onGroupUpdated: () => void, 
  onGroupDeleted: () => void,
  onAccountUpdated: () => void,
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames?: Record<string, string>;
  onBack?: () => void;
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { company, companyId } = useCompany();
  const { vouchers, processedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts, journalAccountNames } = useVouchers();
  const { can } = usePermissions();
  const { user } = useAuth();
  const spendWiseEnabled = (company as { spendWiseEnabled?: boolean } | null)?.spendWiseEnabled === true;
  const BANK_GROUP_SPEND_WISE_VIEW_KEY = "bank-group-spendWiseView";
  const [spendWiseView, setSpendWiseViewState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem(BANK_GROUP_SPEND_WISE_VIEW_KEY);
      return stored === "true";
    } catch {
      return false;
    }
  });
  const setSpendWiseView = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setSpendWiseViewState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(BANK_GROUP_SPEND_WISE_VIEW_KEY, next ? "true" : "false");
      } catch {}
      return next;
    });
  }, []);

  // When toggling Spend wise / Statement, disable layout animation for that transition so list doesn't animate.
  const [disableTableLayoutAnimation, setDisableTableLayoutAnimation] = useState(false);
  const handleSpendWiseViewToggle = useCallback(() => {
    setDisableTableLayoutAnimation(true);
    setSpendWiseView((prev) => !prev);
  }, [setSpendWiseView]);
  useEffect(() => {
    if (!disableTableLayoutAnimation) return;
    const id = requestAnimationFrame(() => {
      setDisableTableLayoutAnimation(false);
    });
    return () => cancelAnimationFrame(id);
  }, [disableTableLayoutAnimation]);
  const accountsInGroup = useMemo(() => {
    if (group.id === "ungrouped") {
      // Ungrouped should include both empty groupId and persisted ungrouped id rows.
      return accounts.filter((a) => !a.groupId || a.groupId === "ungrouped_account");
    }
    return accounts.filter((a) => a.groupId === group.id);
  }, [accounts, group.id]);
  const accountIdsInGroup = useMemo(() => accountsInGroup.map((a) => a.id), [accountsInGroup]);
  const childGroups = useMemo(() => allGroups.filter((g) => (g as any).parentId === group.id), [allGroups, group.id]);

  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [group.id]);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const { visibleColumns, handleColumnVisibilityChange } = useTransactionVisibleColumns();
  const { spendWiseBlinkMode, setSpendWiseBlinkMode, toggleSpendWiseBlinkMode } = useSpendWiseBlinkMode();
  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const [blinkInfoOpen, setBlinkInfoOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  // dateRange object har render par naya ref ho sakta hai â€” effect deps me sirf primitive timestamps (infinite loop avoid).
  const dateRangeFromMs = dateRange?.from?.getTime();
  const dateRangeToMs = dateRange?.to?.getTime();
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "contra">(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const openingModalRef = useRef(false);

  // Radix Select: value list me na ho to ref/setState loop â€” sirf maujood option strings pass karo.
  const ROWS_PER_PAGE_SELECT_OPTIONS = [10, 20, 30, 50] as const;
  const rowsPerPageSelectValue = useMemo(() => {
    if (rowsPerPage === 0) return "0";
    if ((ROWS_PER_PAGE_SELECT_OPTIONS as readonly number[]).includes(rowsPerPage)) return `${rowsPerPage}`;
    return "10";
  }, [rowsPerPage]);
  const handleRowsPerPageChange = useCallback(
    (value: string) => {
      setRowsPerPage(Number(value) || 0);
      setCurrentPage(1);
    },
    [setRowsPerPage, setCurrentPage]
  );
  const handleBsDateRangeChange = useCallback(
    (range?: DateRange) => {
      onDateRangeChange(range);
    },
    [onDateRangeChange]
  );
  const handleGroupComboboxChange = useCallback(
    (value: string) => {
      if (value && value !== group.id) router.push(`/bank-cash/group/${value}`);
    },
    [group.id, router]
  );

  const containsSpecialAccount = useMemo(() => accounts.some(acc => acc.isSpecial), [accounts]);
  const canViewSpecialBalance = can('view_special_account_balance');
  const isBalanceMasked = containsSpecialAccount && !canViewSpecialBalance;


  useEffect(() => {
    setTempDateRange((prev) => {
      if (prev?.from?.getTime() === dateRangeFromMs && prev?.to?.getTime() === dateRangeToMs) return prev;
      return dateRange;
    });
  }, [dateRangeFromMs, dateRangeToMs, dateRange]);

  // useTransactions ko har render par naya `{...group, items}` mat do â€” sirf group/accounts badle tab.
  const groupTransactionEntity = useMemo(
    () => ({ ...group, items: accounts }),
    [group, accounts]
  );

  let { openingBalanceForPeriod, processedTransactions, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions(groupTransactionEntity, "group", dateRange, undefined, processedAccounts, undefined, undefined, filters, undefined, undefined, userNames);

  // If special account and user can't see balance, filter transactions to only show their own.
  if (containsSpecialAccount && !canViewSpecialBalance) {
      processedTransactions = processedTransactions.filter(t => t.userId === user?.uid);
      openingBalanceForPeriod = 0; // Don't show opening balance
      periodDr = processedTransactions.reduce((sum, t) => sum + (t.debit || 0), 0);
      periodCr = processedTransactions.reduce((sum, t) => sum + (t.credit || 0), 0);
      closingBalance = periodDr - periodCr;
  }

  // Spend Wise: never show notes. Statement: PC preference / mobile hamesha notes (includeNotesInTable).
  const baseTransactions = useMemo(() => {
    const perfStart = perfNow();
    const result = spendWiseView
      ? processedTransactions.filter((t: any) => t.type !== "note")
      : includeNotesInTable
        ? processedTransactions
        : processedTransactions.filter((t: any) => t.type !== "note");
    // Perf debug: group base transaction shaping cost trace.
    perfDebugLog("bank.groupDetails.baseTransactions", perfStart, {
      processedCount: processedTransactions.length,
      resultCount: result.length,
      spendWiseView,
      includeNotesInTable,
    });
    return result;
  }, [processedTransactions, spendWiseView, includeNotesInTable]);
  const displayTransactions = useMemo(() => {
    const perfStart = perfNow();
    if (!spendWiseView || !vouchers?.length) return baseTransactions;
    // Date range overwrite: if any transaction in a group is in range, show full group (all linked rows)
    const inRangeIds = new Set(baseTransactions.map((t: any) => t.id));
    const byId = new Map(baseTransactions.map((t: any) => [t.id, t]));
    const accountIdSet = new Set(accountIdsInGroup);
    const isInVoucher = (v: any) =>
      (v.type === "payment_in" && accountIdSet.has(v.accountId)) ||
      (v.type === "direct_income" && accountIdSet.has(v.accountId)) ||
      (v.type === "contra" && accountIdSet.has(v.toAccountId));
    const linkedOutFilter = (v: any, inId: string) => {
      const hasAccount =
        (v.type === "payment_out" && accountIdSet.has(v.accountId)) ||
        (v.type === "direct_expense" && accountIdSet.has(v.accountId)) ||
        (v.type === "contra" && accountIdSet.has(v.fromAccountId));
      return hasAccount && Array.isArray(v.linkedPaymentInIds) && v.linkedPaymentInIds.includes(inId);
    };
    /** Match account details: each inflow shows all its linked outflows (same outflow can appear under multiple inflows). */
    const getDateMs = (v: any) => {
      const d = v.date?.toDate ? v.date.toDate() : new Date(v.date);
      return d.getTime();
    };
    /** Include group if any row (payment_in or linked payment_out) is in date range â€” then show full group. */
    // Keep opening-linked inflows near Opening Balance by rendering them in a dedicated group.
    const openingLinkedInIds = new Set(
      vouchers
        .filter((v: any) =>
          !v.isDeleted &&
          isInVoucher(v) &&
          accountIdSet.has(v.linkedOpeningBalanceAccountId) &&
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
      .sort((a: any, b: any) => getDateMs(a) - getDateMs(b));
    const rows: any[] = [];
    let groupColorIndex = 0;
    const nextColor = () => (groupColorIndex++) % 4;
    /** Per payment-out id: total amount already shown in linked groups (so remainder can show as separate row). */
    const linkedAmountByOutId = new Map<string, number>();
    // Track inflow amount already shown under Opening group so remainder can still appear as separate row.
    const linkedAmountByInId = new Map<string, number>();

    const voucherToInRow = (v: any) => {
      const existing = byId.get(v.id);
      if (existing) return existing;
      const amount = Number(v.amount ?? v.total ?? 0) || 0;
      const voucherNo = v.type === "contra" ? (v.voucherNumberIn ?? v.voucherNumber) : v.voucherNumber;
      return { id: v.id, date: v.date, type: v.type, voucherNumber: voucherNo, debit: amount, credit: 0, userId: v.userId, narration: v.narration, accountId: v.accountId, ...v };
    };
    const voucherToRow = (po: any) => {
      const existing = byId.get(po.id);
      if (existing) return existing;
      const amount = Number(po.total ?? po.amount ?? 0) || 0;
      const voucherNo = po.type === "contra" ? (po.voucherNumberOut ?? po.voucherNumber) : po.voucherNumber;
      return {
        id: po.id,
        date: po.date,
        type: po.type,
        voucherNumber: voucherNo,
        debit: 0,
        credit: amount,
        userId: po.userId,
        narration: po.narration,
        accountId: po.accountId,
        ...po,
      };
    };

    inVouchers.forEach((pi: any) => {
      const groupId = pi.id;
      let rowIndexInGroup = 0;
      const t = voucherToInRow(pi);
      const linkedOuts = vouchers
        .filter((v: any) => linkedOutFilter(v, pi.id))
        .sort((a: any, b: any) => getDateMs(a) - getDateMs(b));
      const hasLinkedGroup = linkedOuts.length > 0;
      const colorIdx = nextColor();
      const groupRunning = (t.debit || 0) - (t.credit || 0);
      if (hasLinkedGroup) {
        rows.push({
          ...t,
          _rowKey: `grp-${groupId}-${rowIndexInGroup++}`,
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: false,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
      } else {
        rows.push({
          ...t,
          _rowKey: `grp-${groupId}-${rowIndexInGroup++}`,
          _spendWiseGroupFirst: true,
          _spendWiseGroupLast: true,
          _spendWiseRunningBalance: groupRunning,
          _spendWiseGroupColorIndex: colorIdx,
        });
        rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-pi-${pi.id}`, _rowKey: `grp-spacer-${groupId}` });
      }
      linkedOuts.forEach((po: any, idx: number) => {
        const outRow = voucherToRow(po);
        const prevRunning = rows.length > 0 ? (rows[rows.length - 1] as any)._spendWiseRunningBalance : 0;
        const fullAmount = Number(po.total ?? po.amount ?? 0) || Math.abs((outRow.debit || 0) - (outRow.credit || 0)) || 0;
        const linkedAmounts = po.linkedPaymentInAmounts && typeof po.linkedPaymentInAmounts === "object" ? po.linkedPaymentInAmounts : null;
        const linkedAmount = linkedAmounts?.[pi.id] != null ? Number(linkedAmounts[pi.id]) : fullAmount / (po.linkedPaymentInIds?.length || 1);
        linkedAmountByOutId.set(po.id, (linkedAmountByOutId.get(po.id) ?? 0) + linkedAmount);
        // Linked row is always an outflow for this group: subtract from running balance (Dr âˆ’ Cr). Do not use outRow.debit/credit â€” byId row can have contra/other shape and give wrong sign.
        const amountDelta = -linkedAmount;
        const nextRunning = typeof prevRunning === "number" ? prevRunning + amountDelta : prevRunning;
        const isLastOutInThisGroup = idx === linkedOuts.length - 1;
        rows.push({
          ...outRow,
          id: `${po.id}-in-${pi.id}`,
          _rowKey: `grp-${groupId}-${rowIndexInGroup++}`,
          _spendWiseChild: true,
          _spendWiseGroupFirst: false,
          _spendWiseGroupLast: isLastOutInThisGroup,
          _spendWiseRunningBalance: nextRunning,
          _spendWiseGroupColorIndex: colorIdx,
          _spendWiseLinkedAmount: linkedAmount,
        });
      });
      if (hasLinkedGroup) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-in-${pi.id}`, _rowKey: `grp-spacer-end-${groupId}` });
    });
    // Build Opening Balance group and place linked inflows right under it.
    const openingSide = openingBalanceForPeriod >= 0 ? "dr" : "cr";
    const openingBase = getOpeningBalanceBaseAmount(openingBalanceForPeriod, openingSide);
    if (openingBase > 0 && ((openingSide === "cr" && openingLinkedInIds.size > 0) || (openingSide === "dr" && openingLinkedOutIds.size > 0))) {
      const openingGroupId = "__opening_balance_group__";
      let rowIndexInGroup = 0;
      const colorIdx = nextColor();
      const openingIsCr = openingSide === "cr";
      let openingRunning = openingIsCr ? -openingBase : openingBase;
      rows.push({
        id: openingGroupId,
        _rowKey: `grp-${openingGroupId}-${rowIndexInGroup++}`,
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
        .sort((a: any, b: any) => getDateMs(a) - getDateMs(b));
      openingLinkedRows.forEach((v: any, idx: number) => {
        const rowSource = openingIsCr ? voucherToInRow(v) : voucherToRow(v);
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
          _rowKey: `grp-${openingGroupId}-${rowIndexInGroup++}`,
          _spendWiseChild: true,
          _spendWiseGroupFirst: false,
          _spendWiseGroupLast: idx === openingLinkedRows.length - 1,
          _spendWiseRunningBalance: openingRunning,
          _spendWiseGroupColorIndex: colorIdx,
          _spendWiseLinkedAmount: linkedAmount,
        });
      });
      rows.push({ _spendWiseSpacer: true, id: "spend-wise-spacer-opening", _rowKey: `grp-spacer-end-${openingGroupId}` });
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
    const unlinked = baseTransactions
      .filter((t: any) => !addedIds.has(t.id))
      .sort((a: any, b: any) => getDateMs(a) - getDateMs(b));
    unlinked.forEach((t: any, idx: number) => {
      const fullAmount = Math.abs((t.debit || 0) - (t.credit || 0));
      const alreadyShown = (linkedAmountByOutId.get(t.id) ?? 0) + (linkedAmountByInId.get(t.id) ?? 0);
      const remainder = fullAmount - alreadyShown;
      if (remainder <= 0) return;
      const colorIdx = nextColor();
      const isOutflow = (t.credit || 0) > (t.debit || 0);
      const remainderRow = {
        ...voucherToRow(t),
        id: t.id,
        _rowKey: alreadyShown > 0 ? `unlinked-${t.id}-remainder` : `unlinked-${t.id}`,
        debit: isOutflow ? 0 : remainder,
        credit: isOutflow ? remainder : 0,
        _spendWiseGroupFirst: true,
        _spendWiseGroupLast: true,
        _spendWiseRunningBalance: isOutflow ? -remainder : remainder,
        _spendWiseGroupColorIndex: colorIdx,
      };
      rows.push(remainderRow);
      if (idx < unlinked.length - 1) rows.push({ _spendWiseSpacer: true, id: `spend-wise-spacer-unlinked-${t.id}`, _rowKey: `spacer-unlinked-${t.id}` });
    });
    const result = rows.length ? reorderSpendWiseRowsByDate(rows) : baseTransactions;
    // Perf debug: group spend-wise builder duration + row expansion visibility.
    perfDebugLog("bank.groupDetails.displayTransactions", perfStart, {
      vouchersCount: vouchers.length,
      baseCount: baseTransactions.length,
      resultCount: result.length,
      spendWiseView,
    });
    return result;
  }, [spendWiseView, baseTransactions, vouchers, accountIdsInGroup, openingBalanceForPeriod]);

  const {
    unapprovedOnly,
    toggleUnapprovedOnly,
    filterByUnapprovedOnly,
    onDateRangeChangeWithUnapprovedReset,
  } = useLedgerUnapprovedOnlyFilter({
    onDateRangeChange,
    setCurrentPage,
    setFilters,
    setActiveFilter,
  });

  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(DEFAULT_TRANSACTION_SORT_ORDER);
  const sortedTransactions = useMemo(() => {
    const rows = filterByUnapprovedOnly(displayTransactions);
    if (spendWiseView) return rows;
    return recomputeRunningBalanceTopToBottom(
      sortTransactionsWithFiscalMergeForCompany(rows, sortBy, sortOrder, undefined, company),
      openingBalanceForPeriod
    );
  }, [displayTransactions, filterByUnapprovedOnly, spendWiseView, sortBy, sortOrder, openingBalanceForPeriod, company]);

  /** Statement: one row per block; spend-wise: blocks for search â€” pagination uses @/lib/spendWisePagination (data-line budget + split borders). */
  const displayBlocks = useMemo(
    () => buildSpendWiseDisplayBlocks(sortedTransactions, spendWiseView),
    [sortedTransactions, spendWiseView]
  );

  // Statement check mode + desktop tail paging â€” sirf statement view (spend-wise alag pager)
  const statementCheckPaging = useStatementLedgerCheckModePaging({
    companyId: companyId ?? undefined,
    context: "group",
    contextId: group?.id,
    viewMode: spendWiseView ? "bill_wise" : "statement",
    searchFilteredTransactions: sortedTransactions,
    rowsPerPage,
    currentPage,
    ledgerOpeningForRunning: openingBalanceForPeriod,
  });

  const spendWisePaging = useMemo(() => {
    if (rowsPerPage <= 0) {
      return {
        totalPages: 1,
        paginatedTransactions: sortedTransactions,
        desktopLedgerSliceFlatStart: 0,
      };
    }
    if (spendWiseView) {
      const full = sortedTransactions as any[];
      const pageRanges = packFlatListByDataLineBudgetFromEnd(full, rowsPerPage);
      if (pageRanges.length === 0) {
        return { totalPages: 1, paginatedTransactions: [] as any[], desktopLedgerSliceFlatStart: 0 };
      }
      const totalPages = pageRanges.length;
      const safePage = Math.min(Math.max(1, currentPage), totalPages);
      const { start, end } = pageRanges[safePage - 1]!;
      const { list } = attachSpendWisePageEdgeFlags(full, start, end);
      return {
        totalPages,
        paginatedTransactions: list as any[],
        desktopLedgerSliceFlatStart: start,
      };
    }
    const total = sortedTransactions.length;
    const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return {
      totalPages,
      paginatedTransactions: sortedTransactions.slice(start, Math.max(start, end)),
      desktopLedgerSliceFlatStart: start,
    };
  }, [sortedTransactions, spendWiseView, rowsPerPage, currentPage]);

  const totalPages = spendWiseView ? spendWisePaging.totalPages : statementCheckPaging.totalPages;
  const paginatedTransactions = spendWiseView
    ? spendWisePaging.paginatedTransactions
    : statementCheckPaging.paginatedTransactions;
  const desktopLedgerSliceFlatStart = spendWiseView
    ? spendWisePaging.desktopLedgerSliceFlatStart
    : (statementCheckPaging.desktopPaginationMeta.sliceStart ?? 0);
  const { statementCheck } = statementCheckPaging;

  // Footer counts statement voucher list se — spend-wise expanded rows ko alag mat gino
  const statementListForCounts = useMemo(() => {
    if (!spendWiseView) return statementCheckPaging.ledgerListForPaging as any[];
    const rows = filterByUnapprovedOnly(baseTransactions);
    const sorted = sortTransactionsWithFiscalMergeForCompany(rows, sortBy, sortOrder, undefined, company);
    const filtered = statementCheck.filterTransactions([...sorted]);
    if (statementCheck.checkModeActive) {
      return recomputeRunningBalanceTopToBottom(filtered, openingBalanceForPeriod);
    }
    return filtered;
  }, [
    spendWiseView,
    statementCheckPaging.ledgerListForPaging,
    baseTransactions,
    filterByUnapprovedOnly,
    sortBy,
    sortOrder,
    company,
    openingBalanceForPeriod,
    statementCheck.filterTransactions,
    statementCheck.checkModeActive,
  ]);

  const ledgerFooterPagingCounts = useMemo(() => {
    const pageRows = (paginatedTransactions as any[]).filter((t: any) => !(t as any)?._spendWiseSpacer);
    return computeStatementFooterCountsFromPage(statementListForCounts as any[], pageRows);
  }, [statementListForCounts, paginatedTransactions]);

  // Page-break opening: first visible data row + pehle non-spacer ka running balance (AccountDetails jaisa).
  const spendWiseDesktopPageLedgerStats = useMemo(() => {
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
    const closingForPage = openingForPage + periodDrForPage - periodCrForPage;
    return {
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage,
    };
  }, [
    paginatedTransactions,
    sortedTransactions,
    openingBalanceForPeriod,
  ]);

  const desktopPageLedgerStats = spendWiseView
    ? spendWiseDesktopPageLedgerStats
    : statementCheckPaging.desktopPaginationMeta;

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    processedTransactions.forEach((v: any) => {
        const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
            dates.add(startOfDay(dateValue).getTime());
        }
    });
    return Array.from(dates).map(d => new Date(d));
  }, [processedTransactions]);

  const isFilterActive = dateRange !== undefined || Object.values(filters).some(v => v);
  /** Party/bank ledger: dated opening row ke liye range-from. */
  const hasLedgerDateFilter = Boolean(dateRange?.from != null || dateRange?.to != null);
  const booksOpeningForAccountGroup = Number((group as any).openingBalance) || 0;
  
  const clearFilters = () => {
    onDateRangeChange(undefined);
    setTempDateRange(undefined);
    setFilters({});
  };

  const handleEditVoucher = (voucher: any) => {
    openingModalRef.current = true;
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
    const voucherToOpen = { ...voucher, id: resolvedId };
    setSelectedVoucher(voucherToOpen);
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  };

  const handleTransactionOpen = useCallback((voucher: any) => {
    handleEditVoucher(voucher);
  }, [handleEditVoucher]);

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen =
    isMobile &&
    (!!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen);

  const openModalInUrl = useCallback(() => {
    if (!isMobile || !pathname) return;
    persistPlModalParentQuery(searchParams.toString());
    const params = new URLSearchParams(searchParamsStringForModalClose(searchParams.toString()));
    params.set("modal", "1");
    params.set("modalts", String(Date.now()));
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);

  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const raw = searchParamsStringAfterClosingModal(searchParams.toString());
    const params = new URLSearchParams(raw);
    params.delete("modal");
    params.delete("modalts");
    patchMasterDetailUrlAfterModalClose(params, { entityId: group.id, groupsTab: true });
    const q = params.toString();
    const basePath = pathnameForModalRouterReplace(pathname);
    router.replace(q ? `${basePath}?${q}` : basePath, { scroll: false });
    clearPlModalParentQueryBackup();
  }, [pathname, searchParams, router, group.id]);

  const modalParam = searchParams.get("modal");
  const urlModalOpen = isMobile && modalParam === "1" && anyMobilePopupOpen;
  const closeUrlModal = useCallback(() => {
    setMobileFooterDialogOpen(null);
    setIsCalendarOpen(false);
    setIsVoucherDialogOpen(false);
    setSelectedVoucher(null);
    setIsNoteOpen(false);
    setNoteEntityId(null);
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
      setNoteEntityId(null);
      // `closeModalInUrl()` yahan mat â€” AccountDetails jaisa: stale `searchParams` se `?selected=` / `?view=` drop avoid.
    }
  }, [isMobile, modalParam, anyMobilePopupOpen]);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const buildDateRangeText = () => {
    const from = dateRange?.from;
    const to = dateRange?.to;
    if (!from) return "All Time";
    const fromBS = formatDateBS(from);
    const toBS = to ? formatDateBS(to) : fromBS;
    const fromAD = formatDate(from);
    const toAD = to ? formatDate(to) : fromAD;
    if (dateSystem === "AD") return `AD: ${fromAD} to ${toAD}`;
    if (dateSystem === "BS") return `BS: ${fromBS} to ${toBS}`;
    return `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
  };

  const accountNamesMap = useMemo(
    () => ({
      ...Object.fromEntries((processedAccounts || []).map((a) => [a.id, a.accountName])),
      ...Object.fromEntries((processedParties || []).map((p) => [p.id, p.name])),
      ...Object.fromEntries((processedStaff || []).map((s) => [s.id, s.name])),
      ...Object.fromEntries((processedTaxes || []).map((t) => [t.id, t.name])),
      ...Object.fromEntries((processedExpenseAccounts || []).map((e) => [e.id, e.name])),
    }),
    [processedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts]
  );
  const mobileSearchNames = useMemo(
    () => ({ ...accountNamesMap, ...journalAccountNames, ...(userNames || {}) }),
    [accountNamesMap, journalAccountNames, userNames]
  );

  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return sortedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    const rowMatches = (t: any) => {
      if ((t as any)._spendWiseSpacer) return false;
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "group", group.id, "account").includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0).toLowerCase().includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    };
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
    return sortedTransactions.filter((t) => rowMatches(t));
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS, spendWiseView, displayBlocks, mobileSearchNames, group.id]);

  const mobileFilterBlocks = useMemo(
    () => buildSpendWiseDisplayBlocks(filteredMobileTransactions, spendWiseView),
    [filteredMobileTransactions, spendWiseView]
  );

  const { mobileTransactionsToShow, mobileLedgerSliceFlatStart } = useMemo(() => {
    const list = filteredMobileTransactions;
    if (rowsPerPage <= 0) {
      return { mobileTransactionsToShow: list, mobileLedgerSliceFlatStart: 0 };
    }
    if (spendWiseView) {
      const pageRanges = packFlatListByDataLineBudgetFromEnd(list as any[], rowsPerPage);
      if (pageRanges.length === 0) {
        return { mobileTransactionsToShow: [] as any[], mobileLedgerSliceFlatStart: 0 };
      }
      const totalPagesLocal = pageRanges.length;
      const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
      const { start, end } = pageRanges[safePage - 1]!;
      const { list: withFlags } = attachSpendWisePageEdgeFlags(list as any[], start, end);
      return { mobileTransactionsToShow: withFlags, mobileLedgerSliceFlatStart: start };
    }
    const blocks = mobileFilterBlocks;
    const n = blocks.length;
    const totalPagesLocal = Math.max(1, Math.ceil(n / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const endB = n - (safePage - 1) * rowsPerPage;
    const startB = Math.max(0, endB - rowsPerPage);
    const flatStart = startB > 0 ? blocks.slice(0, startB).reduce((acc, b) => acc + b.length, 0) : 0;
    return {
      mobileTransactionsToShow: blocks.slice(startB, endB).flat(),
      mobileLedgerSliceFlatStart: flatStart,
    };
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
      /* OB: spacers skip */
      let scan = start - 1;
      while (scan >= 0 && (list[scan] as any)?._spendWiseSpacer) scan--;
      const previousTx = scan >= 0 ? (list[scan] as any) : null;
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
    /* OB: statement mobile â€” non-spacer prev */
    let scanStmt = start - 1;
    while (scanStmt >= 0 && (list[scanStmt] as any)?._spendWiseSpacer) scanStmt--;
    const previousTx = scanStmt >= 0 ? (list[scanStmt] as any) : null;
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

  /** AccountDetails / Party jaisa: pehli flat row index se OB date continuity. */
  const ledgerOpeningPeriodStartDate = useMemo(() => {
    if (rowsPerPage <= 0) {
      if (hasLedgerDateFilter) return dateRange?.from;
      return undefined;
    }
    const fullList = (isMobile ? filteredMobileTransactions : sortedTransactions) as any[];
    const flatStart = isMobile ? mobileLedgerSliceFlatStart : desktopLedgerSliceFlatStart;
    if (flatStart === 0) {
      if (hasLedgerDateFilter) return dateRange?.from;
      return undefined;
    }
    let idx = flatStart - 1;
    while (idx >= 0 && fullList[idx]?._spendWiseSpacer) idx--;
    if (idx < 0) return undefined;
    const t = fullList[idx];
    const raw = t.date?.toDate ? t.date.toDate() : t.date ? new Date(t.date) : undefined;
    return raw instanceof Date && !isNaN(raw.getTime()) ? raw : undefined;
  }, [
    rowsPerPage,
    hasLedgerDateFilter,
    dateRange?.from,
    isMobile,
    filteredMobileTransactions,
    sortedTransactions,
    mobileLedgerSliceFlatStart,
    desktopLedgerSliceFlatStart,
  ]);

  const effectiveMobilePageCount = useMemo(() => {
    if (rowsPerPage <= 0) return 1;
    if (spendWiseView) {
      const p = packFlatListByDataLineBudgetFromEnd(filteredMobileTransactions as any[], rowsPerPage);
      return Math.max(1, p.length);
    }
    return Math.max(1, Math.ceil(mobileFilterBlocks.length / rowsPerPage));
  }, [rowsPerPage, spendWiseView, filteredMobileTransactions, mobileFilterBlocks.length]);

  // Page index stay valid: mobile = data-line or block count; desktop = totalPages.
  useEffect(() => {
    const cap = isMobile ? effectiveMobilePageCount : totalPages;
    setCurrentPage((prev) => {
      const next = Math.min(Math.max(1, prev), cap);
      return next === prev ? prev : next;
    });
  }, [
    isMobile,
    effectiveMobilePageCount,
    totalPages,
    dateRangeFromMs,
    dateRangeToMs,
    group.id,
    sortedTransactions.length,
    filteredMobileTransactions.length,
    mobileSearchTerm,
  ]);

  const dateRangeLabel = buildDateRangeText();

  const groupDropdownOptions = useMemo(
    () => allGroups.map((g) => ({ value: g.id, label: g.name })),
    [allGroups]
  );

  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    const range = dateRange;
    if (!onDateRangeChange) return;
    if (!range?.from || (range.from && range.to)) {
      onDateRangeChange({ from: adDate, to: undefined });
    } else if (adDate < range.from) {
      onDateRangeChange({ from: adDate, to: range.from });
      setIsCalendarOpen(false);
    } else {
      onDateRangeChange({ from: range.from, to: adDate });
      setIsCalendarOpen(false);
    }
  };

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
    if (isNoteOpen) {
      setIsNoteOpen(false);
      setNoteEntityId(null);
      closeModalInUrl();
      return;
    }
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isNoteOpen, closeModalInUrl, onBack]);

  const handleOpenNoteDialog = (accountId?: string) => {
    if (accounts.length === 1) {
        setNoteEntityId(accounts[0].id);
    } else if (accountId) {
        setNoteEntityId(accountId);
    }
    setIsNoteOpen(true);
  };
  
    const handlePrint = async () => {
    if (!company) return;
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;

      if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else
        dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    try {
      // Keep print synced with current view order, shown columns, and notes toggle.
      const printTransactions = sortedTransactions.filter((t: any) => !(t as any)._spendWiseSpacer);
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
          ? `Spend Wise Group Statement: ${group.name}`
          : `Group Statement: ${group.name}`,
        context: 'group',
        contextId: group.id,
        dateSystem: dateSystem,
        dateRangeText: dateRangeText,
        vouchersCount: printTransactions.length,
        openingBalance: isBalanceMasked ? 0 : openingBalanceForPeriod,
        openingBalanceDate: (group as any).openingBalanceDate,
        openingBalanceNarration: (group as any).openingBalanceNarration ?? null,
        transactions: printTransactions,
        showNarration: showNarration,
        includeNotes: includeNotesInTable,
        visibleColumns: visibleColumns,
        preserveOrder: spendWiseView,
        spendWise: Boolean(spendWiseView),
        billWise: false,
        userNames: userNames,
      }, true);
    } catch (e) {
      console.error("Print failed:", e);
      toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
    }
  };

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden w-full">
          {/* Mobile: scroll + pager above fixed footer */}
          <MobileDetailSummaryCollapsible>
          <div className="flex flex-shrink-0 items-center justify-center gap-1 border-b px-2 py-0.5">
            <span className="text-[11px] font-medium leading-tight text-muted-foreground">
              {!dateRange || (dateRange.from == null && dateRange.to == null)
                ? rowsPerPage > 0
                  ? `Last ${rowsPerPage} Txns`
                  : "All Txns"
                : dateRangeLabel}
            </span>
            {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
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
          <div className={mdc.balanceRow}>
            <p className={cn(mdc.balanceTextCenter, closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
              {isBalanceMasked ? "*****" : formatCurrency(closingBalance, { showDrCr: true })}
            </p>
          </div>
          <div className="flex-shrink-0 border-b px-2 py-1">
            <div className="flex items-stretch gap-1.5">
              <div className="h-8 min-w-0 flex-1 [&_button]:h-8 [&_button]:text-xs">
                <Combobox
                  options={groupDropdownOptions}
                  value={group?.id || ""}
                  onChange={handleGroupComboboxChange}
                  placeholder="Select group"
                />
              </div>
              {group.id !== "ungrouped" && (
                <EditAccountGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditAccountGroupDialog>
              )}
              <div className="relative h-8 min-w-0 flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
                <Input
                  placeholder="Search transactions"
                  className="h-8 w-full min-w-0 pl-7 text-xs"
                  value={mobileSearchTerm}
                  onChange={(e) => {
                    setMobileSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
          </div>
          </MobileDetailSummaryCollapsible>
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-touch touch-pan-y"
              style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
            <div className="pb-2">
            {/* Bank/Cash group pages use their own Statement/Spend-wise toggle, so shared bill-wise preference must stay off here. */}
            <TransactionsTable
              transactions={mobileTransactionsToShow}
              context="group"
              contextId={group.id}
              groupEntityType="account"
              forceBalanceMode="statement"
              openingBalance={isBalanceMasked ? 0 : mobilePageLedgerStats.openingForPage}
              booksOpeningBalance={isBalanceMasked ? undefined : booksOpeningForAccountGroup}
              ledgerDateFilterActive={hasLedgerDateFilter}
              ledgerShowBookOpeningRow={rowsPerPage <= 0 || mobileLedgerSliceFlatStart === 0}
              openingBalancePeriodStartDate={ledgerOpeningPeriodStartDate}
              dateRange={dateRange}
              openingBalanceOutstanding={isBalanceMasked ? undefined : openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={isBalanceMasked ? undefined : openingBalanceLinkedVoucherNos}
              openingBalanceNarration={(group as any).openingBalanceNarration}
              openingBalanceDate={(group as any).openingBalanceDate}
              openingBalanceActions={undefined}
              showNarration={showNarration}
              visibleColumns={visibleColumns}
              journalAccountNames={journalAccountNames}
              accountNames={accountNamesMap}
              userNames={userNames}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={isBalanceMasked ? undefined : mobilePageLedgerStats.periodDrForPage}
              periodCr={isBalanceMasked ? undefined : mobilePageLedgerStats.periodCrForPage}
              closingBalance={isBalanceMasked ? undefined : mobilePageLedgerStats.closingForPage}
              isBalanceMasked={isBalanceMasked}
              scrollOnlyTransactions
              disableLayoutAnimation={disableTableLayoutAnimation}
              blinkMode={spendWiseBlinkMode}
              {...statementCheck.tableProps}
            />
            </div>
            </div>
            <MobileTransactionsPager
              className="mt-auto shrink-0 mb-12"
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
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          {/* Mobile footer: ek button — Statement ↔ Spend wise toggle */}
          <LedgerViewModeToggleButton
            value={spendWiseView ? "spend_wise" : "statement"}
            onChange={(v) => setSpendWiseView(v === "spend_wise")}
            options={[
              { value: "statement", label: "Statement" },
              { value: "spend_wise", label: "Spend wise" },
            ]}
          />
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
              <Button className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium px-1 bg-pink-600 hover:bg-pink-700 text-white">
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="p-4 text-left">
                <DrawerTitle>Select Date Range</DrawerTitle>
                <MobileDialogDescription>Select a starting and ending date for the transaction list.</MobileDialogDescription>
              </DrawerHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                {(dateSystem === "BS" || dateSystem === "Both") && (
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
                {(dateSystem === "AD" || dateSystem === "Both") && (
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
                <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
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
              <DialogTitle>Add a New Note for an Account in {group.name}</DialogTitle>
              <DialogDescription>
                {accounts.length > 1 ? "Select which account this note applies to." : "Record a new note for this account."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              {accounts.length > 1 && !noteEntityId && (
                <div className="flex flex-col gap-2 p-4">
                  <p className="font-semibold">Select an account for the note:</p>
                  {accounts.map((acc) => (
                    <Button key={acc.id} variant="outline" onClick={() => setNoteEntityId(acc.id)}>
                      {acc.accountName}
                    </Button>
                  ))}
                </div>
              )}
              {noteEntityId && (
                <CreateNoteForm
                  onVoucherAction={() => {
                    onAccountUpdated();
                    setIsNoteOpen(false);
                    setNoteEntityId(null);
                  }}
                  initialContext="Bank/Cash"
                  initialEntityId={noteEntityId}
                  compactFooter
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
        <AddVoucherDialog
          isOpen={isVoucherDialogOpen}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setIsVoucherDialogOpen(false);
              setSelectedVoucher(null);
              closeModalInUrl();
            } else {
              setIsVoucherDialogOpen(true);
            }
          }}
          voucher={selectedVoucher}
          onVoucherUpdated={() => setSelectedVoucher(null)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header: Part 1 (nameâ†’balance) and Part 2 (dateâ†’print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-slim-dim">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                  <ArrowLeft className="h-3 w-3" />
                </Button>
              )}
              <Avatar className="h-12 w-12 text-lg flex-shrink-0">
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {getInitials(group.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{group.name}</h2>
                {containsSpecialAccount && <Crown className="h-5 w-5 text-amber-500 flex-shrink-0" />}
                {group.id !== 'ungrouped' && (
                  <EditAccountGroupDialog
                    group={group}
                    allGroups={allGroups}
                    onGroupUpdated={onGroupUpdated}
                    onGroupDeleted={onGroupDeleted}
                    hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditAccountGroupDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0 flex items-baseline justify-end gap-px", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {isBalanceMasked ? (
                    "*****"
                  ) : (
                    <>
                      <span>{formatCurrency(Math.abs(closingBalance), { showDrCr: false })}</span>
                      <span className="text-sm">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <LedgerUnapprovedFilterButton active={unapprovedOnly} onClick={toggleUnapprovedOnly} />
              {(dateSystem === 'BS' || dateSystem === 'Both') && (
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={handleBsDateRangeChange}
                  transactionDates={transactionDates}
                  className={cn("w-auto", LEDGER_HEADER_PILL_CN)}
                />
              )}
              {(dateSystem === 'AD' || dateSystem === 'Both') && (
                <Popover open={isDesktopCalendarOpen} onOpenChange={setIsDesktopCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn("justify-start text-left font-normal px-2 w-auto", LEDGER_HEADER_PILL_CN, !dateRange && "text-muted-foreground")}
                    >
                      <CalendarIcon className={cn("mr-2", LEDGER_HEADER_PILL_ICON_SIZE_CN)} />
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
                            onDateRangeChange?.(r);
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
                          onDateRangeChange?.(next);
                          setIsDesktopCalendarOpen(false);
                        } else {
                          const next = { from: range.from, to: adDate };
                          setTempDateRange(next);
                          onDateRangeChange?.(next);
                          setIsDesktopCalendarOpen(false);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {isFilterActive && (
                <Button variant="ghost" size="icon" onClick={clearFilters} className={cn(LEDGER_HEADER_PILL_ICON_CN, "text-muted-foreground hover:text-foreground")} aria-label="Clear date filter">
                  <XCircle className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className={cn("w-[200px] justify-between", LEDGER_HEADER_PILL_CN)}>
                    <span className="truncate">Members ({accounts.length})</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[320px] max-h-72 overflow-y-auto">
                  {accounts.map(p => (
                    <DropdownMenuItem key={p.id} disabled>
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="truncate text-left">{p.accountName}</span>
                        <span
                          className={cn(
                            "shrink-0 text-xs font-semibold tabular-nums",
                            (Number((p as any).balance) || 0) >= 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {formatCurrency(Number((p as any).balance) || 0, { showDrCr: true })}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <LedgerViewModePills
                value={spendWiseView ? "spend_wise" : "statement"}
                onChange={(v) => setSpendWiseView(v === "spend_wise")}
                options={[
                  { value: "statement", label: "Statement" },
                  { value: "spend_wise", label: "Spend wise" },
                ]}
              />
              <Button variant="chromePill" size="sm" onClick={() => handleOpenNoteDialog()} className={LEDGER_HEADER_PILL_CN}>
                <FilePlus className={cn("mr-2", LEDGER_HEADER_PILL_ICON_SIZE_CN)} /> Add Note
              </Button>
              <Button variant="chromePill" size="icon" onClick={handlePrint} className={LEDGER_HEADER_PILL_ICON_CN}>
                <Printer className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
              </Button>
            </div>
          </div>
        </div>
        {/* scroll-touch for APK/WebView touch scroll */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-auto scrollbar-slim-dim scroll-touch">
          <div className={cn("py-4 min-w-0", spendWiseView && "p-[2px]")}>
            {/* Bank/Cash group pages use their own Statement/Spend-wise toggle, so shared bill-wise preference must stay off here. */}
            <TransactionsTable
              transactions={paginatedTransactions}
              context="group"
              contextId={group.id}
              groupEntityType="account"
              forceBalanceMode="statement"
              showNarration={showNarration}
              visibleColumns={visibleColumns}
              openingBalance={isBalanceMasked ? 0 : desktopPageLedgerStats.openingForPage}
              booksOpeningBalance={isBalanceMasked ? undefined : booksOpeningForAccountGroup}
              ledgerDateFilterActive={hasLedgerDateFilter}
              ledgerShowBookOpeningRow={rowsPerPage <= 0 || desktopLedgerSliceFlatStart === 0}
              openingBalancePeriodStartDate={ledgerOpeningPeriodStartDate}
              dateRange={dateRange}
              openingBalanceOutstanding={isBalanceMasked ? undefined : openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={isBalanceMasked ? undefined : openingBalanceLinkedVoucherNos}
              openingBalanceNarration={(group as any).openingBalanceNarration}
              openingBalanceDate={(group as any).openingBalanceDate}
              openingBalanceActions={
                group.id !== "ungrouped" ? (
                  <EditAccountGroupDialog
                    group={group}
                    allGroups={allGroups}
                    onGroupUpdated={onGroupUpdated}
                    onGroupDeleted={onGroupDeleted}
                    hasAccounts={accountsInGroup.length > 0 || childGroups.length > 0}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </EditAccountGroupDialog>
                ) : null
              }
              journalAccountNames={journalAccountNames}
              accountNames={accountNamesMap}
              userNames={userNames}
              onRowClick={handleTransactionOpen}
              filters={filters}
              setFilters={setFilters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              periodDr={isBalanceMasked ? undefined : desktopPageLedgerStats.periodDrForPage}
              periodCr={isBalanceMasked ? undefined : desktopPageLedgerStats.periodCrForPage}
              closingBalance={isBalanceMasked ? undefined : desktopPageLedgerStats.closingForPage}
              isBalanceMasked={isBalanceMasked}
              disableLayoutAnimation={disableTableLayoutAnimation}
              blinkMode={spendWiseBlinkMode}
              {...statementCheck.tableProps}
            />
            {paginatedTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No transactions found for the selected period.
              </div>
            )}
          </div>
        </div>
        {/* Footer — global PC shell LedgerDesktopFooter */}
        <LedgerDesktopFooter
          left={
            <>
              <LedgerFooterCheckboxPill
                id="show-narration-account-group"
                checked={showNarration}
                onCheckedChange={(checked) => handleShowNarrationChange(checked)}
                label="Show Narration"
              />
              <LedgerFooterColumnsMenu>
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
                          id={`col-${key}-account-group`}
                          checked={visibleColumns[key] !== false}
                          onCheckedChange={(c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-account-group`} className="text-sm font-medium flex-1 cursor-pointer">
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </LedgerFooterColumnsMenu>
              {!spendWiseView && (
                <LedgerFooterCheckboxPill
                  id="show-notes-account-group"
                  checked={includeNotesInTable}
                  disabled={notesPreferenceLockedOnMobile}
                  onCheckedChange={(c) => setShowNotes(c)}
                  label="Note"
                />
              )}
              {!spendWiseView && (
                <StatementCheckModeFooterControls
                  idPrefix="account-group"
                  enabled={statementCheck.checkModeEnabled}
                  onEnabledChange={statementCheck.setCheckModeEnabled}
                  viewMode="statement"
                  hiddenCount={statementCheck.hiddenCount}
                />
              )}
              {spendWiseView && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="chromePill" size="sm" className="h-8 min-w-0 shrink-0 gap-1">
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
            </>
          }
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(by, order) => {
            setSortBy(by);
            setSortOrder(order);
          }}
          viewMode={spendWiseView ? "spend_wise" : "statement"}
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
          rowsPerPageSelectValue={rowsPerPageSelectValue}
          onRowsPerPageChange={handleRowsPerPageChange}
          beforeCount={ledgerFooterPagingCounts.beforeCount}
          afterCount={ledgerFooterPagingCounts.afterCount}
          totalCount={ledgerFooterPagingCounts.totalCount}
        />
      </div>
     <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
                <DialogTitle>Add a New Note for an Account in {group.name}</DialogTitle>
                <DialogDescription>
                    {accounts.length > 1 ? "Select which account this note applies to." : "Record a new note for this account."}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
                {accounts.length > 1 && !noteEntityId && (
                     <div className="flex flex-col gap-2 p-4">
                        <p className="font-semibold">Select an account for the note:</p>
                        {accounts.map(acc => (
                            <Button key={acc.id} variant="outline" onClick={() => setNoteEntityId(acc.id)}>
                                {acc.accountName}
                            </Button>
                        ))}
                    </div>
                )}
                {noteEntityId && (
                    <CreateNoteForm 
                    onVoucherAction={() => {
                            onAccountUpdated();
                            setIsNoteOpen(false);
                            setNoteEntityId(null);
                        }}
                        initialContext="Bank/Cash"
                        initialEntityId={noteEntityId}
                        // Role-wise: only users with approve permission get Save & Approve in account-group linked note modal.
                        showSaveAndApproveOnCreate={can("approve_transactions")}
                        compactFooter
                    />
                )}
            </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open) => {
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

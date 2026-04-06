"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { useDate } from "@/hooks/useDate";
import { useAnimationSettings } from "@/hooks/useAnimationSettings";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { cn } from "@/lib/utils";
import type { StockView, Item } from "@/components/items/types";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Filter, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { VoucherTypeFilter } from "@/components/vouchers/VoucherTypeFilter";
import {
  type Context,
  type Transaction,
  TransactionRow,
  getConversionFactor,
  formatQuantity,
  getOppositeAccountLabel,
  getParticularsText,
  getStatusLabel,
  getStatusDetail,
  getStatusDetailVouchers,
  LinkedVouchersColored,
} from "./transactionTableShared";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { useCompany } from "@/hooks/useCompany";
import type { SpendWiseBlinkMode } from "@/components/vouchers/transactionColumnVisibility";
import { useAuth } from "@/hooks/useAuth";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { toast } from "sonner";
import { approveVoucherWithHistory } from "@/lib/voucherActionsClient";

export type { Context, Transaction };

export type TransactionColumnKey = "date" | "type" | "voucherNo" | "user" | "file" | "dr" | "cr" | "status" | "runningBalance";
export type VisibleColumns = Partial<Record<TransactionColumnKey, boolean>>;

export { TransactionRow, getConversionFactor, formatQuantity };

interface TransactionsTableProps {
  transactions: Transaction[];
  context: Context;
  contextId?: string;
  openingBalance?: number;
  openingBalanceOutstanding?: number;
  openingBalanceLinkedVoucherNos?: string[];
  showNarration?: boolean;
  stockView?: StockView;
  item?: Item;
  displayUnit?: string;
  setDisplayUnit?: (unit: string) => void;
  journalAccountNames?: Record<string, string>;
  userNames?: Record<string, string>;
  /** Account id -> name for resolving opposite account in bank/account context */
  accountNames?: Record<string, string>;
  filters?: Record<string, string>;
  setFilters?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeFilter?: string | null;
  setActiveFilter?: React.Dispatch<React.SetStateAction<string | null>>;
  onRowClick?: (transaction: any) => void;
  periodDr?: number;
  periodCr?: number;
  closingBalance?: number;
  isTaxContext?: boolean;
  isAllVouchersView?: boolean;
  hideDebitColumn?: boolean;
  hideCreditColumn?: boolean;
  hideBalanceColumn?: boolean;
  hideFooter?: boolean;
  dateRange?: any;
  isInitialLoad?: boolean;
  isDateChange?: boolean;
  getDisplayValue?: (value: number) => string;
  voucherTypes?: string[];
  onVoucherTypeChange?: (types: string[]) => void;
  isBalanceMasked?: boolean;
  visibleColumns?: Record<string, boolean>;
  openingBalanceActions?: React.ReactNode;
  /** Label for the opening balance row (e.g. "Opening" on report page) */
  openingBalanceLabel?: string;
  /** Optional search input to show on the left of the opening balance row (same row) */
  openingBalanceSearch?: React.ReactNode;
  /** Optional content to show to the left of the opening balance row (e.g. unit selector) */
  openingBalanceLeftContent?: React.ReactNode;
  onDeleteVoucher?: (transaction: any) => void;
  onHistoryVoucher?: (transaction: any) => void;
  onAddLink?: (transaction: any) => void;
  onApproveVoucher?: (transaction: any) => void;
  scrollOnlyTransactions?: boolean;
  /** Status filter for bill-wise Status header dropdown */
  statusFilter?: { paid: boolean; unpaid: boolean; partial: boolean; overdue: boolean };
  statusFilterAllChecked?: boolean;
  onStatusFilterAll?: () => void;
  onStatusFilterChange?: (key: "paid" | "unpaid" | "partial" | "overdue", checked: boolean) => void;
  statusFilterIdPrefix?: string;
  /** When context=group, indicates group type for opposite account display */
  groupEntityType?: "party" | "account" | "staff" | "tax" | "expense" | "item";
  /** When true, disables layout animation (e.g. when switching Spend wise / Statement view) */
  disableLayoutAnimation?: boolean;
  /** Spend-wise balance blink multi-select modes ('all' | 'group' | 'row'). Empty = Off. */
  blinkMode?: SpendWiseBlinkMode[];
  /** Optional override for pages that always want a fixed balance layout regardless of the shared page preference. */
  forceBalanceMode?: "statement" | "bill_wise";
  /** Item context: allow Party column show/hide from columns dropdown. */
  showItemPartyColumn?: boolean;
}

export function TransactionsTable({
  transactions,
  context,
  contextId,
  openingBalance = 0,
  openingBalanceOutstanding,
  openingBalanceLinkedVoucherNos,
  showNarration = true,
  stockView = "amount",
  item,
  displayUnit,
  setDisplayUnit,
  journalAccountNames,
  userNames,
  accountNames,
  filters,
  setFilters,
  activeFilter,
  setActiveFilter,
  onRowClick,
  periodDr = 0,
  periodCr = 0,
  closingBalance = 0,
  isTaxContext,
  isAllVouchersView,
  hideDebitColumn,
  hideCreditColumn,
  hideBalanceColumn,
  hideFooter,
  dateRange,
  isInitialLoad,
  isDateChange,
  getDisplayValue: getDisplayValueProp,
  voucherTypes,
  onVoucherTypeChange,
  isBalanceMasked,
  visibleColumns,
  openingBalanceActions,
  openingBalanceLabel = "Opening Balance",
  openingBalanceSearch,
  openingBalanceLeftContent,
  onDeleteVoucher,
  onHistoryVoucher,
  onAddLink,
  onApproveVoucher,
  scrollOnlyTransactions,
  statusFilter,
  statusFilterAllChecked,
  onStatusFilterAll,
  onStatusFilterChange,
  statusFilterIdPrefix,
  groupEntityType,
  disableLayoutAnimation = false,
  blinkMode,
  forceBalanceMode,
  showItemPartyColumn = true,
}: TransactionsTableProps) {
  const { company, companyId } = useCompany();
  const { user, customUser } = useAuth();
  const currentUserUid = user?.uid ?? null;
  const currentUserDisplayName = customUser?.displayName || user?.displayName || user?.email || null;
  const { balanceMode } = useBalanceMode();
  // Allow pages like Bank/Cash to stay on statement layout even if the shared balance-mode preference is bill-wise.
  const resolvedBalanceMode = forceBalanceMode ?? balanceMode;
  const handleApproveVoucherDefault = useCallback(
    async (transaction: any) => {
      if (!companyId || !transaction?.id || !user?.uid) return;
      try {
        const approverName = customUser?.displayName || user?.displayName || user?.email || user.uid;
        await approveVoucherWithHistory(companyId, transaction.id, user.uid, approverName);
        toast.success("Transaction approved.");
      } catch (e) {
        toast.error("Failed to approve transaction.");
      }
    },
    [companyId, user?.uid, user?.displayName, user?.email, customUser?.displayName]
  );
  const effectiveOnApproveVoucher = onApproveVoucher ?? handleApproveVoucherDefault;
  // Statement view = running balance. Bill wise: Party/Staff show per-row outstanding (closing balance); others show running balance.
  const isBillWiseMode = resolvedBalanceMode === "bill_wise";
  // Party/Staff bill-wise only: show per-row outstanding (per row closing balance), including journal. Daybook/account/expense/tax bill-wise: running balance.
  const shouldUseOutstandingBalance =
    isBillWiseMode &&
    (context === "party" ||
      context === "staff" ||
      (context === "group" && (groupEntityType === "party" || groupEntityType === "staff")));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  // Keep spend-wise blink/selection groups consistent for derived row ids.
  const normalizeSpendWiseRowBase = useCallback((id?: string) => {
    if (!id || typeof id !== "string") return id ?? "";
    if (id.includes("-in-")) return id.substring(0, id.indexOf("-in-"));
    if (id.endsWith("-ob-link")) return id.substring(0, id.length - "-ob-link".length);
    return id;
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const isSpendWise = transactions.some((t: any) => (t as any)._spendWiseChild === true || (t as any)._spendWiseGroupFirst === true);
    if (isSpendWise) {
      const base = normalizeSpendWiseRowBase(selectedId);
      const stillPresent = transactions.some((t: any) => t.id && normalizeSpendWiseRowBase(String(t.id)) === base);
      if (!stillPresent) setSelectedId(null);
    } else if (!transactions.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [transactions, selectedId, normalizeSpendWiseRowBase]);

  // Click table ke bahar → row unselect; lekin Dialog/Dropdown/Popover radix portals body par hain — un par click se unselect mat karo (save ke baad edited row selected rahe)
  const isTargetInsidePortaledOverlay = useCallback((target: EventTarget | null) => {
    if (!target || !(target instanceof Element)) return false;
    return !!(
      target.closest('[role="dialog"]') ||
      target.closest('[role="alertdialog"]') ||
      target.closest("[data-radix-dropdown-menu-content]") ||
      target.closest("[data-radix-select-content]") ||
      target.closest("[data-radix-popover-content]") ||
      target.closest("[data-radix-sheet-content]")
    );
  }, []);

  // Unselect when user clicks anywhere in the app outside the table (empty area, sidebar, etc.)
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const el = tableContainerRef.current;
      if (!el || !selectedId) return;
      const t = e.target;
      if (el.contains(t as Node)) return;
      if (isTargetInsidePortaledOverlay(t)) return;
      setSelectedId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [selectedId, isTargetInsidePortaledOverlay]);

  // Staff group (statement + bill wise): focus table after row select so one Enter opens edit; delay so page doesn’t steal focus
  const isStaffGroup = context === "group" && groupEntityType === "staff";
  useEffect(() => {
    if (!isStaffGroup || !selectedId) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tableContainerRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [isStaffGroup, selectedId]);

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (transactions.length === 0) return;
      const idx = transactions.findIndex((t) => t.id === selectedId);
      const currentIndex = idx >= 0 ? idx : -1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, transactions.length - 1);
        setSelectedId(transactions[next]?.id ?? null);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        setSelectedId(transactions[prev]?.id ?? null);
      } else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        const t = transactions.find((x) => x.id === selectedId);
        if (t) onRowClick?.(t);
      }
    },
    [transactions, selectedId, onRowClick]
  );

  /** Spend-wise multi-row: clicked row = selected (border); other rows of same voucher = blink only, not selected. */
  const isSpendWiseMultiRow = transactions.some((t: any) => (t as any)._spendWiseChild === true || (t as any)._spendWiseGroupFirst === true);
  // Track how many rendered rows belong to the same base voucher id for row-mode gating.
  const spendWiseBaseRowCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions as any[]) {
      const baseId = normalizeSpendWiseRowBase(t?.id ? String(t.id) : "");
      if (!baseId) continue;
      counts.set(baseId, (counts.get(baseId) ?? 0) + 1);
    }
    return counts;
  }, [transactions, normalizeSpendWiseRowBase]);
  const getBaseVoucherId = useCallback((row: { id?: string }) => {
    return normalizeSpendWiseRowBase(row?.id);
  }, [normalizeSpendWiseRowBase]);
  const selectedBaseId = selectedId && isSpendWiseMultiRow ? getBaseVoucherId({ id: selectedId }) : null;
  // In row-mode, only clicked row should blink (no sibling/related row blink).
  const activeBlinkModes = Array.isArray(blinkMode) ? blinkMode : [];
  const canBlinkRelatedRows = activeBlinkModes.includes("all") || activeBlinkModes.includes("group");
  const getIsRelatedBlink = useCallback(
    (t: any) =>
      canBlinkRelatedRows &&
      isSpendWiseMultiRow &&
      !!selectedBaseId &&
      getBaseVoucherId(t) === selectedBaseId &&
      t.id !== selectedId,
    [canBlinkRelatedRows, isSpendWiseMultiRow, selectedBaseId, getBaseVoucherId, selectedId]
  );
  // Row-mode blink should apply only when selected row belongs to a multi-row voucher split.
  const getIsSelectedRowBlink = useCallback(
    (t: any) => {
      if (!activeBlinkModes.includes("row")) return false;
      if (!selectedId || t?.id !== selectedId) return false;
      const baseId = getBaseVoucherId(t);
      return (spendWiseBaseRowCounts.get(baseId) ?? 0) > 1;
    },
    [activeBlinkModes, selectedId, getBaseVoucherId, spendWiseBaseRowCounts]
  );

  const {
    formatDate,
    formatDateBS,
    formatCurrency,
    dateSystem,
  } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  
  // Get animation settings - check enabled flag explicitly (match PartyList / list motion). Disable when parent asks (e.g. view toggle).
  const isRowAnimationEnabled = !disableLayoutAnimation && animationSettings?.rows?.enabled === true;
  const rowAnimationDuration = isRowAnimationEnabled ? (animationSettings?.rows?.duration ?? 0.4) : 0;
  
  const getDisplayValue = useCallback((value: number) => {
    if (getDisplayValueProp) return getDisplayValueProp(value);
    return formatCurrency(value, {noSuffix: true, context: 'transaction'});
  }, [getDisplayValueProp, formatCurrency]);


  const renderHeaderWithFilter = (key: string, label: string, isNumeric: boolean = false, minWidthPx?: number) => {
    const isFiltered = !!(filters && filters[key]) || (key === 'type' && voucherTypes && !voucherTypes.includes('all'));
    const thClass = cn('p-0', isNumeric && 'text-right');
    const innerPadding = ensureMinGaps ? "px-[10px]" : "px-2";

    return (
      <TableHead className={thClass} style={ensureMinGaps && minWidthPx != null ? { minWidth: `${minWidthPx}px` } : undefined}>
        <div className={cn("flex items-center gap-1 font-bold py-3 text-black whitespace-nowrap", innerPadding, isFiltered ? 'text-red-600' : 'text-black', isNumeric ? "justify-end" : "justify-start")}>
          <div className={cn('flex items-center', isNumeric ? 'flex-row' : 'flex-row')}>
            <span>{label}</span>
            {isNumeric && (setFilters || (key === 'type' && onVoucherTypeChange)) && (
              <Popover open={activeFilter === key} onOpenChange={(open) => setActiveFilter && setActiveFilter(open ? key : null)}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-1">
                    <Filter className={cn("h-4 w-4", isFiltered && "text-red-600")} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-1 w-48" onOpenAutoFocus={(e: Event) => e.preventDefault()} onCloseAutoFocus={(e: Event) => e.preventDefault()}>
                    {key === 'type' && onVoucherTypeChange ? (
                        <VoucherTypeFilter selectedTypes={voucherTypes || ['all']} onSelectionChange={onVoucherTypeChange} />
                    ) : setFilters ? (
                        <Input
                        placeholder={`Filter ${label}...`}
                        value={filters ? filters[key] || '' : ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const newValue = e.target.value;
                            setFilters((prev: Record<string, string>) => ({ ...prev, [key]: newValue }));
                        }}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && setActiveFilter) setActiveFilter(null); }}
                        autoFocus
                        />
                    ) : null}
                  </PopoverContent>
              </Popover>
            )}
            {!isNumeric && (setFilters || (key === 'type' && onVoucherTypeChange)) && (
              <Popover open={activeFilter === key} onOpenChange={(open) => setActiveFilter && setActiveFilter(open ? key : null)}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-0">
                    <Filter className={cn("h-4 w-4", isFiltered && "text-red-600")} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-1 w-48" onOpenAutoFocus={(e: Event) => e.preventDefault()} onCloseAutoFocus={(e: Event) => e.preventDefault()}>
                    {key === 'type' && onVoucherTypeChange ? (
                        <VoucherTypeFilter selectedTypes={voucherTypes || ['all']} onSelectionChange={onVoucherTypeChange} />
                    ) : setFilters ? (
                        <Input
                        placeholder={`Filter ${label}...`}
                        value={filters ? filters[key] || '' : ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const newValue = e.target.value;
                            setFilters((prev: Record<string, string>) => ({ ...prev, [key]: newValue }));
                        }}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && setActiveFilter) setActiveFilter(null); }}
                        autoFocus
                        />
                    ) : null}
                  </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </TableHead>
    );
  };
  
  // === TOTALS AND CLOSING BALANCE CONVERSION LOGIC ===
  const conversionFactor = useMemo(() => {
     if (context === 'item' && stockView === 'qty' && item) {
         return getConversionFactor(item, displayUnit);
     }
     return 1;
  }, [context, stockView, item, displayUnit]);

  // Apply conversion to totals
  // Ensure openingBalance is a valid number (handle undefined, null, NaN)
  const safeOpeningBalance = (typeof openingBalance === 'number' && !isNaN(openingBalance)) ? openingBalance : 0;
  const displayOpeningBalance = safeOpeningBalance / conversionFactor;
  // Bill-wise: show outstanding in balance column for opening balance row (0 when Paid/Settled)
  const obOutstandingDisplay = openingBalanceOutstanding != null ? openingBalanceOutstanding / conversionFactor : null;
  const displayOpeningBalanceForRow = obOutstandingDisplay != null
    ? (safeOpeningBalance >= 0 ? obOutstandingDisplay : -obOutstandingDisplay)
    : displayOpeningBalance;
  const obAmount = Math.abs(displayOpeningBalance);
  const obStatusLabel = obOutstandingDisplay != null
    ? (obOutstandingDisplay <= 0 ? "Paid" : obOutstandingDisplay >= obAmount ? "Unpaid" : "Partial")
    : null;
  const displayOpeningBalanceDr = displayOpeningBalance > 0 ? displayOpeningBalance : 0;
  const displayOpeningBalanceCr = displayOpeningBalance < 0 ? Math.abs(displayOpeningBalance) : 0;
  const displayPeriodDr = periodDr / conversionFactor;
  const displayPeriodCr = periodCr / conversionFactor;
  const displayClosingBalance = closingBalance / conversionFactor;
  
  // Total includes opening balance: Dr opening balance adds to Debit total, Cr opening balance adds to Credit total
  const displayTotalDr = (displayPeriodDr || 0) + displayOpeningBalanceDr;
  const displayTotalCr = (displayPeriodCr || 0) + displayOpeningBalanceCr;

  // Footer Formatters (Same Logic as Row). When balance is 0 show "Settled" (opening row + closing balance).
  const formatFooterBalance = (value: number) => {
    if (isBalanceMasked) return '*****';
    if (typeof value !== 'number' || isNaN(value)) return '-';
    const isItemQty = context === 'item' && stockView === 'qty';
    if (isItemQty) {
      if (Math.abs(value) < 1e-6) return <span className="font-bold text-green-700">Settled</span>;
      return `${formatQuantity(value)} ${displayUnit || ''}`;
    }
    if (Math.abs(value) < 1e-6) return <span className="font-bold text-green-700">Settled</span>;
    const absValue = Math.abs(value);
    const suffix = value >= 0 ? "Dr" : "Cr";
    return (
      <span className={cn("font-bold", value >= 0 ? "text-green-700" : "text-red-700")}>
        {formatCurrency(absValue, { noSuffix: true, context: 'transaction', noAnimation: true })} {suffix}
      </span>
    );
  };
  
  const formatFooterAmount = (val: number) => {
      if (val === 0 || (typeof val === 'number' && isNaN(val))) return '-';
      if (context === 'item' && stockView === 'qty') {
          return `${formatQuantity(val)} ${displayUnit || ''}`;
      }
      return getDisplayValue(val);
  }

  const livePlans = useLivePlans();
  const plan = getPlanFromPlans(livePlans, (company?.planId as any) || "basic");
  const showFileColumn = plan.entitlements.canAddFileImagePdf === true;
  const showCol = (key: string) => visibleColumns == null || visibleColumns[key] !== false;
  const showFileBySelection = showFileColumn && showCol("file");
  const dateCols = dateSystem === "Both" ? 2 : 1;
  const userCol = context === 'note' ? 0 : 1;
  const fileCol = showFileBySelection ? 1 : 0;
  const isItemPartyContext = context === "item" || (context === "group" && groupEntityType === "item");
  // Item/Item-group Party column count should follow page-level visibility toggle.
  const baseCols = dateCols + 2 + userCol + fileCol + (context === 'daybook' ? 1 : 0) + (isItemPartyContext && showItemPartyColumn ? 1 : 0);
  const debitCol = hideDebitColumn ? 0 : 1;
  const creditCol = hideCreditColumn ? 0 : 1;
  // Hide status column in statement view (bill-wise only shows per-bill status)
  const hideStatusColumn = resolvedBalanceMode === "statement";
  const statusCol = hideStatusColumn ? 0 : 1;

  const visibleDateCols = visibleColumns != null ? (showCol("date") ? dateCols : 0) : dateCols;
  const visibleBaseCols = visibleColumns != null
    ? (showCol("date") ? dateCols : 0) + (showCol("type") ? 1 : 0) + (showCol("voucherNo") ? 1 : 0) + (context === 'daybook' ? 1 : 0) + (isItemPartyContext && showItemPartyColumn ? 1 : 0) + (showCol("user") && context !== 'note' ? 1 : 0) + (showFileBySelection ? 1 : 0)
    : baseCols;
  const visibleDebitCol = visibleColumns != null ? (showCol("dr") && !hideDebitColumn ? 1 : 0) : debitCol;
  const visibleCreditCol = visibleColumns != null ? (showCol("cr") && !hideCreditColumn ? 1 : 0) : creditCol;
  const visibleStatusCol = visibleColumns != null ? (showCol("status") && !hideStatusColumn ? 1 : 0) : statusCol;
  const visibleBalanceCol = visibleColumns != null ? (showCol("runningBalance") && !hideBalanceColumn ? 1 : 0) : (hideBalanceColumn ? 0 : 1);

  const openingBalanceColSpan = visibleBaseCols + (context === 'note' ? 1 : 0);
  const totalColSpan = visibleBaseCols;
  const fullRowColSpan = openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1;

  // When spend-wise already has an explicit opening-balance group row, avoid rendering top opening row twice.
  const hasSpendWiseOpeningGroupRow = transactions?.some((t: any) =>
    t?.type === "opening_balance" && (t?._spendWiseGroupFirst || t?._spendWiseGroupLast || t?._spendWiseChild)
  );
  const showOpeningBalance = ["party", "account", "staff", "tax", "item", "expense", "group"].includes(context) && !hasSpendWiseOpeningGroupRow;

  const isMobile = useIsMobile();
  const names = useMemo(() => ({ ...(journalAccountNames || {}), ...(userNames || {}), ...(accountNames || {}) }), [journalAccountNames, userNames, accountNames]);

  // Prevent header/amount overlap on narrow screens globally - min 20px gap headers, 10px amount columns, show scroll
  const ensureMinGaps = true;

  // On mobile, party/group use same card UI for both Statement and Bill wise (not PC table).
  const useMobileCardView =
    isMobile &&
    (context === "daybook" ||
      context === "account" ||
      context === "expense" ||
      context === "staff" ||
      context === "tax" ||
      context === "item" ||
      context === "party" ||
      context === "group");
  // Bill-wise in mobile card: party, group, staff, account (same as party details / bank details)
  const isBillWiseCardContext = resolvedBalanceMode === "bill_wise" && (context === "party" || context === "group" || context === "staff" || context === "account");
  // In party/staff/group billwise view, status shows only bill-wise link voucher no (not spend-wise RCPT/PYMT/Contra).
  const statusBillWiseOnly = resolvedBalanceMode === "bill_wise" && (context === "party" || context === "staff" || context === "group");

  if (useMobileCardView) {
    type MobileBlock =
      | { type: "spacer" }
      | { type: "group"; colorIndex: number; items: any[] }
      | { type: "single"; item: any };
    const mobileBlocks = useMemo((): MobileBlock[] => {
      const blocks: MobileBlock[] = [];
      let i = 0;
      while (i < transactions.length) {
        const t = transactions[i] as any;
        if (t._spendWiseSpacer) {
          blocks.push({ type: "spacer" });
          i++;
          continue;
        }
        if (t._spendWiseGroupFirst === true) {
          const colorIndex = typeof t._spendWiseGroupColorIndex === "number" ? t._spendWiseGroupColorIndex : 0;
          const items: any[] = [];
          while (i < transactions.length) {
            const cur = transactions[i] as any;
            if (cur._spendWiseSpacer) break;
            items.push(cur);
            if (cur._spendWiseGroupLast === true) {
              i++;
              break;
            }
            i++;
          }
          // Single-item "group" should render like a normal single row (thin border), not a thick group container.
          if (items.length <= 1) {
            blocks.push({ type: "single", item: items[0] ?? t });
          } else {
            blocks.push({ type: "group", colorIndex, items });
          }
          continue;
        }
        blocks.push({ type: "single", item: t });
        i++;
      }
      return blocks;
    }, [transactions]);

    const renderMobileCard = (t: any, key: string, insideGroup: boolean) => {
      let debit = t.debit ?? 0;
      let credit = t.credit ?? 0;
      let balance = t.balance ?? t.runningBalance ?? 0;
      if (typeof (t as any)._spendWiseRunningBalance === "number") balance = (t as any)._spendWiseRunningBalance;
      const spendWiseLinkedAmount = (t as any)._spendWiseLinkedAmount;
      if ((t as any)._spendWiseChild && typeof spendWiseLinkedAmount === "number" && spendWiseLinkedAmount > 0) {
        const isOutflow = (t.type === "payment_out" || t.type === "direct_expense") || (Number(t.credit) > 0);
        if (isOutflow) {
          debit = 0;
          credit = spendWiseLinkedAmount;
        } else {
          debit = spendWiseLinkedAmount;
          credit = 0;
        }
      }
      // Keep mobile card balance behavior aligned with table: party/staff use running balance instead of outstanding.
      const useOutstanding = shouldUseOutstandingBalance && isBillWiseCardContext && (t.outstanding != null);
      if (useOutstanding) {
        const out = Number(t.outstanding) ?? 0;
        balance = t.type === "purchase" || t.type === "payment_out" || t.type === "direct_expense" ? -out : out;
      }
      if (context === "item" && stockView === "qty" && item) {
        debit = debit / conversionFactor;
        credit = credit / conversionFactor;
        balance = balance / conversionFactor;
      }
      const amount = credit > 0 ? credit : debit;
      const isCredit = credit > 0;
      const d = t.date && (typeof t.date.toDate === "function" ? t.date.toDate() : new Date(t.date));
      const balanceSuffix = balance >= 0 ? "Dr" : "Cr";
      const balanceAbs = Math.abs(balance);
      const resolvedUserName = userNames && t.userId ? userNames[t.userId] : null;
      const userName =
        (resolvedUserName && resolvedUserName !== "Unknown" && resolvedUserName !== "N/A" ? resolvedUserName : null) ||
        t.userDisplayName ||
        t.userName ||
        (t.userId === currentUserUid ? (currentUserDisplayName || "You") : null) ||
        "N/A";
      const isItemQty = context === "item" && stockView === "qty";
      const formatAmountOrQty = (val: number) =>
        isItemQty && item ? `${formatQuantity(val)} ${displayUnit || ""}` : formatCurrency(val, { noSuffix: true, context: "transaction", noAnimation: true });
      const oppositeLabel = getOppositeAccountLabel(t, names, context, contextId, groupEntityType);
      const titleLabel = (context === "daybook" || context === "item" || (context === "group" && (t.type === "sale" || t.type === "purchase")))
        ? `${t.voucherNumber} - ${oppositeLabel}`
        : `${t.voucherNumber || t.type || ""}${oppositeLabel ? ` - ${oppositeLabel}` : ""}`.trim() || "Transaction";
      const getGroupAccountName = () => {
        const getName = (id: string | undefined) => (id ? (names[id] || "—") : "");
        const id = t.type === "direct_expense" ? (t.toAccountId || t.expenseAccountId) :
          t.type === "direct_income" ? t.incomeAccountId :
          t.type === "payment_out" ? (t.expenseAccountId || t.toAccountId) :
          t.type === "payment_in" ? t.incomeAccountId :
          t.type === "journal" && Array.isArray(t.entries) ? t.entries.find((e: any) => e?.accountId)?.accountId :
          t.type === "note" ? t.entityId : undefined;
        return id ? getName(id) : "";
      };
      const groupAccountName = context === "group" ? getGroupAccountName() : "";
      const showStatusInCard = isBillWiseCardContext;
      const statusLabel = showStatusInCard ? getStatusLabel(t, context) : "";
      const statusDetailVouchers = showStatusInCard ? getStatusDetailVouchers(t, { billWiseOnly: statusBillWiseOnly }) : [];
      const showStatusDetailInCard = showNarration && statusDetailVouchers.length > 0;
      const useNeutralStatus = ["Journal", "Note", "Contra", "Salary"].includes(statusLabel);
      const isPaidStatus = statusLabel === "Paid";
      const isUnpaidStatus = statusLabel === "Partial" || statusLabel === "Unpaid" || statusLabel === "Overdue";
      const isPendingApproval = (t as any).isApproved !== true;
      const swBorder = !insideGroup && typeof (t as any)._spendWiseGroupColorIndex === "number"
        ? ((t as any)._spendWiseGroupColorIndex === 1 ? "border-l-4 border-l-green-500" : (t as any)._spendWiseGroupColorIndex === 2 ? "border-l-4 border-l-pink-500" : "border-l-4 border-l-blue-500")
        : "";
      return (
        <Card
          key={key}
          className={cn(
            "p-2.5 min-w-0 w-full overflow-hidden border border-border/80 shadow-sm cursor-pointer transition-colors",
            context === "daybook" && "rounded-lg",
            swBorder,
            isPendingApproval
              ? "bg-pink-100 dark:bg-pink-950/40 hover:bg-pink-200 dark:hover:bg-pink-950/50 border border-black/30 dark:border-white/30"
              : "bg-card hover:bg-muted/30"
          )}
          onClick={() => onRowClick?.(t)}
        >
          <div className="flex justify-between items-start gap-2 min-w-0">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="font-bold text-sm truncate">{titleLabel}</p>
            </div>
            <p className={cn("font-bold text-sm shrink-0", isCredit ? "text-green-600" : "text-red-600")}>
              {amount > 0 ? formatAmountOrQty(amount) : "-"}
            </p>
          </div>
          <div className="flex justify-between items-start gap-2 min-w-0 mt-0.5">
            <p className="text-xs text-muted-foreground break-words whitespace-normal line-clamp-none min-w-0 flex-1">
              <span className="font-semibold">Narration : </span>
              {t.narration || "—"}
            </p>
            {showStatusInCard && (statusLabel || showStatusDetailInCard) ? (
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                {statusLabel ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold h-[22px]",
                      useNeutralStatus ? "text-muted-foreground border-muted-foreground/40" : isPaidStatus ? "text-green-600 border-green-600/50" : isUnpaidStatus ? "text-red-600 border-red-600/50" : "text-muted-foreground border-muted-foreground/40"
                    )}
                  >
                    {statusLabel}
                  </Badge>
                ) : null}
                {showStatusDetailInCard ? (
                  <LinkedVouchersColored vouchers={statusDetailVouchers} align="end" />
                ) : null}
              </div>
            ) : !hideBalanceColumn ? (
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs font-semibold px-1.5 py-0 whitespace-nowrap shrink-0",
                  balance >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                )}
              >
                Bal:{formatAmountOrQty(balanceAbs)}{isItemQty ? "" : ` ${balanceSuffix}`}
              </Badge>
            ) : null}
          </div>
          <div className="flex justify-between items-end gap-2 min-w-0 mt-0.5">
            <div className="min-w-0 flex-1 overflow-hidden">
              {groupAccountName ? <p className="text-xs text-muted-foreground truncate font-medium">Account: {groupAccountName}</p> : null}
              <p className="text-xs text-muted-foreground">
                {d ? (dateSystem === "BS" ? formatDateBS(d) : formatDate(d)) : ""}
                {d ? ` • ${format(d, "h:mm a")}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-0.5 flex-shrink-0">
              {showStatusInCard && !hideBalanceColumn && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs font-semibold px-1.5 py-0 whitespace-nowrap",
                    balance >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                  )}
                >
                  Bal:{formatAmountOrQty(balanceAbs)}{isItemQty ? "" : ` ${balanceSuffix}`}
                </Badge>
              )}
              <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">User: {userName}</p>
            </div>
          </div>
        </Card>
      );
    };

    const groupContainerClass = (colorIndex: number) => {
      const border = colorIndex === 1 ? "border-2 border-green-500" : colorIndex === 2 ? "border-2 border-pink-500" : "border-2 border-blue-500";
      const bg = colorIndex === 1 ? "bg-green-50 dark:bg-green-950/30" : colorIndex === 2 ? "bg-pink-50 dark:bg-pink-950/30" : "bg-blue-50 dark:bg-blue-950/30";
      // Add a same-color outer outline so rounded corners look uniformly thick.
      const outerLayer = colorIndex === 1 ? "outline outline-1 outline-green-500/80" : colorIndex === 2 ? "outline outline-1 outline-pink-500/80" : "outline outline-1 outline-blue-500/80";
      return cn("rounded-xl overflow-hidden", border, bg, outerLayer);
    };

    // Daybook/Recent: horizontal gap comes from parent (DaybookReport/dashboard); other contexts use px-0.5
      return (
      <div className={cn("w-full min-w-0 space-y-px pb-4 overflow-hidden", context === "daybook" ? "" : "px-0.5")}>
        {showOpeningBalance && (
          <Card className="p-2.5 min-h-9 min-w-0 overflow-hidden bg-card border border-border/80 shadow-sm">
            <div className="flex justify-between items-start gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 min-h-9">
                {openingBalanceLeftContent}
                {openingBalanceSearch}
                <p className="font-bold text-sm text-foreground">{openingBalanceLabel}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                {/* Bill-wise: show main amount (full OB) on top like normal transaction, then balance (outstanding) below. */}
                {isBillWiseCardContext && obOutstandingDisplay != null ? (
                  <>
                    <span className={cn(
                      "text-sm font-bold px-2 py-0.5 rounded-md",
                      displayOpeningBalance >= 0 ? "text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-200" : "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-200"
                    )}>
                      {/* In this bill-wise mobile branch, context can be narrowed; rely on qty+item check only. */}
                      {stockView === "qty" && item
                        ? `${formatQuantity(Math.abs(displayOpeningBalance))} ${displayUnit || ""}`
                        : `${formatCurrency(Math.abs(displayOpeningBalance), { noSuffix: true, context: "transaction", noAnimation: true })} ${displayOpeningBalance >= 0 ? "Dr" : "Cr"}`}
                    </span>
                    {/* Same order as normal transaction: status and link above, running balance (Bal) below */}
                    <div className="flex flex-col items-end gap-0.5 mt-0.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-semibold h-[22px]",
                          obStatusLabel === "Paid" ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                        )}
                      >
                        {obStatusLabel}
                      </Badge>
                      {/* Keep opening-balance status voucher-link text in sync with narration toggle. */}
                      {(showNarration && openingBalanceLinkedVoucherNos?.length) ? (
                        <LinkedVouchersColored vouchers={openingBalanceLinkedVoucherNos} align="end" />
                      ) : null}
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs font-semibold px-1.5 py-0 whitespace-nowrap",
                          displayOpeningBalanceForRow >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        )}
                      >
                        Bal:{formatCurrency(Math.abs(displayOpeningBalanceForRow), { noSuffix: true, context: "transaction", noAnimation: true })}{displayOpeningBalanceForRow >= 0 ? " Dr" : " Cr"}
                      </Badge>
                    </div>
                  </>
                ) : (
                  <>
                    <span className={cn(
                      "text-sm font-bold px-2 py-0.5 rounded-md",
                      (isBillWiseCardContext ? displayOpeningBalanceForRow : displayOpeningBalance) >= 0 ? "text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-200" : "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-200"
                    )}>
                      {context === "item" && stockView === "qty" && item
                        ? `${formatQuantity(Math.abs(displayOpeningBalance))} ${displayUnit || ""}`
                        : (() => {
                            const ob = isBillWiseCardContext ? displayOpeningBalanceForRow : displayOpeningBalance;
                            return `${formatCurrency(Math.abs(ob), { noSuffix: true, context: "transaction", noAnimation: true })} ${ob >= 0 ? "Dr" : "Cr"}`;
                          })()}
                    </span>
                    {/* Keep opening-balance status voucher-link text in sync with narration toggle. */}
                    {isBillWiseCardContext && showNarration && openingBalanceLinkedVoucherNos?.length && obOutstandingDisplay == null ? (
                      <LinkedVouchersColored vouchers={openingBalanceLinkedVoucherNos} align="start" />
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </Card>
        )}
        {mobileBlocks.map((block, blockIdx) => {
          if (block.type === "spacer") {
            return <div key={`spacer-${blockIdx}`} className="shrink-0 w-full" style={{ height: 20 }} aria-hidden />;
          }
          if (block.type === "group") {
            const groupKey = `group-${blockIdx}-${block.items[0]?.id ?? block.items.map((t: any) => t.id).join("-")}`;
            return (
              <motion.div
                key={groupKey}
                layout
                initial={false}
                transition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                className={cn("space-y-px", groupContainerClass(block.colorIndex))}
              >
                {block.items.map((t: any, itemIdx: number) => (
                  <motion.div
                    key={`${blockIdx}-${itemIdx}-${t.id ?? (t as any)._rowKey ?? ""}`}
                    layout
                    initial={false}
                    transition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                  >
                    {renderMobileCard(t, t.id, true)}
                  </motion.div>
                ))}
              </motion.div>
            );
          }
          return (
            <motion.div
              key={block.item.id}
              layout
              initial={false}
              transition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
            >
              {renderMobileCard(block.item, block.item.id, false)}
            </motion.div>
          );
        })}
      </div>
    );
  }

  const hasSpendWiseGroups = transactions?.some((t: any) => typeof t._spendWiseGroupColorIndex === "number");
  // Fixed column widths so header and row vertical lines align perfectly (main + nested tables).
  const spendWiseColWidths = useMemo((): number[] => {
    if (!hasSpendWiseGroups) return [];
    const w: number[] = [];
    if (showCol("date")) {
      if (dateSystem === "Both") { w.push(95, 95); } else { w.push(95); }
    }
    if (showCol("type")) w.push(75);
    if (showCol("voucherNo")) w.push(105);
    if (context === "daybook") w.push(120);
    // Item/Item-group Party column width is included only when visible.
    if (isItemPartyContext && showItemPartyColumn) w.push(90);
    if (showCol("user") && context !== "note") w.push(85);
    if (showFileBySelection) w.push(44);
    if (showCol("dr") && !hideDebitColumn) w.push(100);
    if (showCol("cr") && !hideCreditColumn) w.push(100);
    if (showCol("status") && !hideStatusColumn) w.push(95);
    if (showCol("runningBalance") && !hideBalanceColumn) w.push(115);
    w.push(40); // actions
    return w;
  }, [hasSpendWiseGroups, showCol, dateSystem, context, groupEntityType, hideDebitColumn, hideCreditColumn, hideStatusColumn, hideBalanceColumn, showFileBySelection, showItemPartyColumn]);
  // Keep opening-balance card styling only for bank/account spend-wise grouped view.
  const useSpendWiseOpeningBalanceCard = context === "account" && hasSpendWiseGroups;

  // Same block logic as mobile: spacer | group (colorIndex, items) | single (item) — so PC and mobile behave identically
  type TableBlock =
    | { type: "spacer"; id: string }
    | { type: "group"; colorIndex: number; items: any[] }
    | { type: "single"; item: any };
  const tableBlocks = useMemo((): TableBlock[] | null => {
    if (!hasSpendWiseGroups || !transactions?.length) return null;
    const blocks: TableBlock[] = [];
    let i = 0;
    while (i < transactions.length) {
      const t = transactions[i] as any;
      if (t._spendWiseSpacer) {
        blocks.push({ type: "spacer", id: t.id ?? (t._rowKey ?? `spacer-${i}`) });
        i++;
        continue;
      }
      if (t._spendWiseGroupFirst === true) {
        const colorIndex = typeof t._spendWiseGroupColorIndex === "number" ? t._spendWiseGroupColorIndex : 0;
        const items: any[] = [];
        while (i < transactions.length) {
          const cur = transactions[i] as any;
          if (cur._spendWiseSpacer) break;
          items.push(cur);
          if (cur._spendWiseGroupLast === true) {
            i++;
            break;
          }
          i++;
        }
        // Single-item "group" should render like a normal single row (thin border), not a thick group container.
        if (items.length <= 1) {
          blocks.push({ type: "single", item: items[0] ?? t });
        } else {
          blocks.push({ type: "group", colorIndex, items });
        }
        continue;
      }
      blocks.push({ type: "single", item: t });
      i++;
    }
    return blocks;
  }, [hasSpendWiseGroups, transactions]);

  const tableContent = (
      <Table
        className={cn(
          ensureMinGaps ? "table-auto w-full min-w-full" : "table-fixed w-full",
          hasSpendWiseGroups && "border-separate border-spacing-0 table-fixed",
          "border-b-2 border-border"
        )}
        scrollContainer={false}
      >
        {hasSpendWiseGroups && spendWiseColWidths.length > 0 && (
          <colgroup>
            {spendWiseColWidths.map((width, i) => (
              <col key={i} style={{ width: `${width}px` }} />
            ))}
          </colgroup>
        )}
        <TableHeader>
        <TableRow className="border-b-4 border-black hover:bg-transparent">
          {showCol("date") && (dateSystem === "Both" ? (
            <>
              {renderHeaderWithFilter("date_bs", "Date (BS)", false, ensureMinGaps ? 95 : undefined)}
              {renderHeaderWithFilter("date_ad", "Date (AD)", false, ensureMinGaps ? 95 : undefined)}
            </>
          ) : (
            renderHeaderWithFilter("date", "Date", false, ensureMinGaps ? 95 : undefined)
          ))}
          {showCol("type") && renderHeaderWithFilter("type", "Type", false, ensureMinGaps ? 75 : undefined)}
          {showCol("voucherNo") && renderHeaderWithFilter("voucherNumber", "Voucher No.", false, ensureMinGaps ? 105 : undefined)}
          {context === 'daybook' && renderHeaderWithFilter("accounts", "Accounts", false, ensureMinGaps ? 120 : undefined)}
          {/* Item + Item-group page: Party header visibility follows Columns dropdown toggle. */}
          {isItemPartyContext && showItemPartyColumn && <TableHead className="font-semibold p-0" style={ensureMinGaps ? { minWidth: "90px" } : undefined}>Party</TableHead>}
          {showCol("user") && context !== 'note' && renderHeaderWithFilter("user", "User", false, ensureMinGaps ? 85 : undefined)}
          {showFileBySelection && <TableHead className="font-semibold p-0 text-center" style={ensureMinGaps ? { minWidth: "44px" } : undefined} data-theme-header="file">File</TableHead>}
          {showCol("dr") && !hideDebitColumn && renderHeaderWithFilter("debit", stockView === 'amount' ? "Debit" : "In", true, ensureMinGaps ? 100 : undefined)}
          {showCol("cr") && !hideCreditColumn && renderHeaderWithFilter("credit", stockView === 'amount' ? "Credit" : "Out", true, ensureMinGaps ? 100 : undefined)}
          {showCol("status") && !hideStatusColumn && renderHeaderWithFilter("status", "Status", false, ensureMinGaps ? 95 : undefined)}
          {showCol("runningBalance") && !hideBalanceColumn && renderHeaderWithFilter("balance", stockView === 'amount' ? "Balance" : "Stock", true, ensureMinGaps ? 115 : undefined)}
          <TableHead className="w-10 p-0" />
        </TableRow>
      </TableHeader>
      
      <TableBody>
        <>
            {showOpeningBalance && (
              useSpendWiseOpeningBalanceCard ? (
                <>
                  {/* Render opening row in the main table so amount stays exactly under Debit/Credit columns. */}
                  <tr
                    data-row="opening-balance"
                    className={cn(
                      "bg-blue-50/50 dark:bg-blue-950/20",
                      "[&>td]:border-y [&>td]:border-blue-500 [&>td]:border-solid",
                      "[&>td:first-child]:border-l [&>td:last-child]:border-r",
                      "[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl",
                      "[&>td:first-child]:overflow-hidden [&>td:last-child]:overflow-hidden"
                    )}
                  >
                    <TableCell colSpan={openingBalanceColSpan - (showFileBySelection ? 1 : 0)} className="font-semibold">
                        <div className="flex items-center gap-2">
                          {openingBalanceLeftContent}
                          {openingBalanceSearch}
                          <span>{openingBalanceLabel}</span>
                        </div>
                    </TableCell>
                    {showFileBySelection && <TableCell className="text-center">-</TableCell>}
                    {showCol("dr") && !hideDebitColumn && <TableCell className={cn("text-right text-green-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                        {displayOpeningBalanceDr > 0 ? formatFooterAmount(displayOpeningBalanceDr) : '-'}
                    </TableCell>}
                    {showCol("cr") && !hideCreditColumn && <TableCell className={cn("text-right text-red-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                        {displayOpeningBalanceCr > 0 ? formatFooterAmount(displayOpeningBalanceCr) : '-'}
                    </TableCell>}
                    {/* Keep opening-balance status vertically centered with amount columns. */}
                    {showCol("status") && !hideStatusColumn && (
                      <TableCell className={cn("text-center align-middle", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                        {openingBalanceOutstanding != null ? (
                          <div className="flex flex-col items-center gap-[1px] leading-tight">
                            <Badge
                              variant="outline"
                              className={cn(
                                // Match Type/Status badge dimensions for consistent row alignment.
                                "inline-flex h-6 items-center rounded-xl px-2.5 font-medium leading-none shrink-0",
                                openingBalanceOutstanding <= 0 ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                              )}
                            >
                              {openingBalanceOutstanding <= 0 ? "Paid" : openingBalanceOutstanding >= Math.abs(openingBalance ?? 0) ? "Unpaid" : "Partial"}
                            </Badge>
                            {/* Opening balance: list all linked voucher nos in 2–3 lines (from voucher data). */}
                                    {showNarration && openingBalanceLinkedVoucherNos?.length ? (
                                      <LinkedVouchersColored vouchers={openingBalanceLinkedVoucherNos} align="center" />
                                    ) : null}
                          </div>
                        ) : (
                          // Show "-" for opening balance status when no outstanding balance data
                          <span className="font-semibold">-</span>
                        )}
                      </TableCell>
                    )}
                    {showCol("runningBalance") && !hideBalanceColumn && (
                        <TableCell className={cn("text-right font-semibold", displayOpeningBalanceForRow >= 0 ? "text-green-600" : "text-red-600", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                            {formatFooterBalance(displayOpeningBalanceForRow)}
                        </TableCell>
                    )}
                    <TableCell className="w-10 p-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                        {openingBalanceActions != null ? (
                          openingBalanceActions
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40" />
                          </DropdownMenu>
                        )}
                    </TableCell>
                  </tr>
                  {/* Spend-wise bank/account view: keep visual gap between OB and first group. */}
                  <tr data-row="opening-balance-gap" aria-hidden="true" className="spend-wise-gap-row">
                    <td
                      colSpan={fullRowColSpan}
                      className="p-0 m-0 border-0 bg-transparent align-middle"
                      style={{ height: "12px", minHeight: "12px", lineHeight: 0, verticalAlign: "middle" }}
                    />
                  </tr>
                </>
              ) : (
                // All non-spend-wise/non-bank pages: render opening balance as normal table row (no card/no extra gap).
                <tr data-row="opening-balance">
                  <TableCell colSpan={openingBalanceColSpan - (showFileBySelection ? 1 : 0)} className="font-semibold">
                      <div className="flex items-center gap-2">
                        {openingBalanceLeftContent}
                        {openingBalanceSearch}
                        <span>{openingBalanceLabel}</span>
                      </div>
                  </TableCell>
                  {showFileBySelection && <TableCell className="text-center">-</TableCell>}
                  {showCol("dr") && !hideDebitColumn && <TableCell className={cn("text-right text-green-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                      {displayOpeningBalanceDr > 0 ? formatFooterAmount(displayOpeningBalanceDr) : '-'}
                  </TableCell>}
                  {showCol("cr") && !hideCreditColumn && <TableCell className={cn("text-right text-red-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                      {displayOpeningBalanceCr > 0 ? formatFooterAmount(displayOpeningBalanceCr) : '-'}
                  </TableCell>}
                  {/* Keep opening-balance status vertically centered with amount columns. */}
                  {showCol("status") && !hideStatusColumn && (
                    <TableCell className={cn("text-center align-middle", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                      {openingBalanceOutstanding != null ? (
                        <div className="flex flex-col items-center gap-[1px] leading-tight">
                          <Badge
                            variant="outline"
                            className={cn(
                              // Match Type/Status badge dimensions for consistent row alignment.
                              "inline-flex h-6 items-center rounded-xl px-2.5 font-medium leading-none shrink-0",
                              openingBalanceOutstanding <= 0 ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                            )}
                          >
                            {openingBalanceOutstanding <= 0 ? "Paid" : openingBalanceOutstanding >= Math.abs(openingBalance ?? 0) ? "Unpaid" : "Partial"}
                          </Badge>
                          {/* Opening balance: list all linked voucher nos in 2–3 lines (from voucher data). */}
                          {showNarration && openingBalanceLinkedVoucherNos?.length ? (
                            <LinkedVouchersColored vouchers={openingBalanceLinkedVoucherNos} align="center" />
                          ) : null}
                        </div>
                      ) : (
                        // Show "-" for opening balance status when no outstanding balance data
                        <span className="font-semibold">-</span>
                      )}
                    </TableCell>
                  )}
                  {showCol("runningBalance") && !hideBalanceColumn && (
                      <TableCell className={cn("text-right font-semibold", displayOpeningBalanceForRow >= 0 ? "text-green-600" : "text-red-600", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                          {formatFooterBalance(displayOpeningBalanceForRow)}
                      </TableCell>
                  )}
                  <TableCell className="w-10 p-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      {openingBalanceActions != null ? (
                        openingBalanceActions
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40" />
                        </DropdownMenu>
                      )}
                  </TableCell>
                </tr>
              )
            )}
            {transactions.length > 0 ? (
              tableBlocks ? (
                <AnimatePresence mode="popLayout">
                  {tableBlocks.map((block) => {
                    if (block.type === "spacer") {
                      return (
                        <React.Fragment key={block.id}>
                          <motion.tr
                            layout={false}
                            initial={false}
                            exit={{ transition: { duration: 0 } }}
                            aria-hidden="true"
                            className="spend-wise-gap-row"
                          >
                            <td
                              colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1}
                              className="p-0 m-0 border-0 bg-transparent align-middle"
                              style={{ height: "12px", minHeight: "12px", lineHeight: 0, verticalAlign: "middle" }}
                            />
                          </motion.tr>
                        </React.Fragment>
                      );
                    }
                    if (block.type === "group") {
                      // Stable key by first item (payment_in) so date reorder doesn't remount — all cards animate same speed
                      const groupKey = `group-${block.items[0]?.id ?? block.items.map((t: any) => t.id).join("-")}`;
                      const tableGroupCardClass = (colorIndex: number) =>
                        cn(
                          // Add a same-color outer outline so rounded corners look uniformly thick.
                          "rounded-xl overflow-hidden border-2 shadow-sm",
                          colorIndex === 1 && "border-green-500 bg-green-50/50 dark:bg-green-950/20",
                          colorIndex === 2 && "border-pink-500 bg-pink-50/50 dark:bg-pink-950/20",
                          (colorIndex === 0 || colorIndex === 3) && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
                          colorIndex === 1 && "outline outline-1 outline-green-500/80",
                          colorIndex === 2 && "outline outline-1 outline-pink-500/80",
                          (colorIndex === 0 || colorIndex === 3) && "outline outline-1 outline-blue-500/80"
                        );
                      return (
                        <tr key={groupKey}>
                          <td
                            colSpan={fullRowColSpan}
                            className="p-0 align-top border-none bg-transparent"
                            style={{ verticalAlign: "top" }}
                          >
                            <motion.div
                              layout
                              initial={false}
                              exit={{ transition: { duration: 0 } }}
                              transition={{ duration: rowAnimationDuration, ease: "easeInOut" }}
                              className={tableGroupCardClass(block.colorIndex)}
                            >
                              <table className="w-full border-0 border-collapse table-fixed">
                                {spendWiseColWidths.length > 0 && (
                                  <colgroup>
                                    {spendWiseColWidths.map((width, i) => (
                                      <col key={i} style={{ width: `${width}px` }} />
                                    ))}
                                  </colgroup>
                                )}
                                <tbody>
                                  {block.items.map((t: any) => {
                                    const rowKey = (t as any)._rowKey ?? (t as any).id;
                                    return (
                                      <TransactionRow
                                        key={rowKey}
                                        transaction={t}
                                        animateLayout={true}
                                        layoutTransition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                                        isSpendWiseChild={!!(t as any)._spendWiseChild}
                                        isSpendWiseGroupFirst={!!(t as any)._spendWiseGroupFirst}
                                        isSpendWiseGroupLast={!!(t as any)._spendWiseGroupLast}
                                        spendWiseRunningBalance={(t as any)._spendWiseRunningBalance}
                                        spendWiseGroupColorIndex={(t as any)._spendWiseGroupColorIndex}
                                        spendWiseGroupSize={block.items.length}
                                        blinkMode={blinkMode}
                                        showNarration={showNarration}
                                        userNames={userNames}
                                        journalAccountNames={journalAccountNames}
                                        accountNames={accountNames}
                                        context={context}
                                        contextId={contextId}
                                        groupEntityType={groupEntityType}
                                        showItemPartyColumn={showItemPartyColumn}
                                        stockView={stockView}
                                        displayUnit={displayUnit}
                                        item={item}
                                        onRowClick={onRowClick}
                                        onAddLink={onAddLink}
                                        onHistoryVoucher={onHistoryVoucher}
                                        onApproveVoucher={effectiveOnApproveVoucher}
                                        onRowSelect={(tx: { id: string }) => setSelectedId(tx.id)}
                                        isSelected={selectedId === t.id}
                                        isRelatedBlink={getIsRelatedBlink(t)}
                                        isSelectedRowBlink={getIsSelectedRowBlink(t)}
                                        getDisplayValue={getDisplayValue}
                                        isTaxContext={isTaxContext}
                                        isBalanceMasked={isBalanceMasked}
                                        hideBalanceColumn={hideBalanceColumn}
                                        hideStatusColumn={hideStatusColumn}
                                        visibleColumns={visibleColumns}
                                        useOutstandingForBalance={shouldUseOutstandingBalance}
                                        isBillWise={isBillWiseMode}
                                        ensureMinGaps={ensureMinGaps}
                                        showFileColumn={showFileBySelection}
                                        statusBillWiseOnly={statusBillWiseOnly}
                                      />
                                    );
                                  })}
                                </tbody>
                              </table>
                            </motion.div>
                          </td>
                        </tr>
                      );
                    }
                    const t = block.item;
                    const rowKey = (t as any)._rowKey ?? (t as any).id;
                    return (
                      <React.Fragment key={rowKey}>
                        <TransactionRow
                          key={rowKey}
                          transaction={t}
                          animateLayout={true}
                          layoutTransition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                          isSpendWiseChild={!!(t as any)._spendWiseChild}
                          isSpendWiseGroupFirst={!!(t as any)._spendWiseGroupFirst}
                          isSpendWiseGroupLast={!!(t as any)._spendWiseGroupLast}
                          spendWiseRunningBalance={(t as any)._spendWiseRunningBalance}
                          spendWiseGroupColorIndex={(t as any)._spendWiseGroupColorIndex}
                          spendWiseGroupSize={1}
                          blinkMode={blinkMode}
                          showNarration={showNarration}
                          userNames={userNames}
                          journalAccountNames={journalAccountNames}
                          accountNames={accountNames}
                          context={context}
                          contextId={contextId}
                          groupEntityType={groupEntityType}
                          showItemPartyColumn={showItemPartyColumn}
                          stockView={stockView}
                          displayUnit={displayUnit}
                          item={item}
                          onRowClick={onRowClick}
                          onAddLink={onAddLink}
                          onHistoryVoucher={onHistoryVoucher}
                          onApproveVoucher={effectiveOnApproveVoucher}
                          onRowSelect={(tx: { id: string }) => setSelectedId(tx.id)}
                          isSelected={selectedId === t.id}
                          isRelatedBlink={getIsRelatedBlink(t)}
                          isSelectedRowBlink={getIsSelectedRowBlink(t)}
                          getDisplayValue={getDisplayValue}
                          isTaxContext={isTaxContext}
                          isBalanceMasked={isBalanceMasked}
                          hideBalanceColumn={hideBalanceColumn}
                          hideStatusColumn={hideStatusColumn}
                          visibleColumns={visibleColumns}
                          useOutstandingForBalance={shouldUseOutstandingBalance}
                          isBillWise={isBillWiseMode}
                          ensureMinGaps={ensureMinGaps}
                          showFileColumn={showFileBySelection}
                          statusBillWiseOnly={statusBillWiseOnly}
                        />
                      </React.Fragment>
                    );
                  })}
                </AnimatePresence>
              ) : (
                transactions.map((t: any, rowIndex: number) => {
                    const rowKey = (t as any)._rowKey ?? (t as any).id ?? `row-${rowIndex}`;
                    return (t as any)._spendWiseSpacer ? (
                      <motion.tr
                        key={rowKey}
                        layout={false}
                        initial={false}
                        exit={{ transition: { duration: 0 } }}
                        aria-hidden="true"
                        className="spend-wise-gap-row"
                      >
                        <td
                          colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1}
                          className="p-0 m-0 border-0 bg-transparent align-middle"
                          style={{ height: "12px", minHeight: "12px", lineHeight: 0, verticalAlign: "middle" }}
                        />
                      </motion.tr>
                    ) : (
                      <TransactionRow
                        key={rowKey}
                        transaction={t}
                        animateLayout={true}
                        layoutTransition={isRowAnimationEnabled ? { duration: rowAnimationDuration, ease: "easeInOut" } : { duration: 0 }}
                        isSpendWiseChild={!!(t as any)._spendWiseChild}
                        isSpendWiseGroupFirst={!!(t as any)._spendWiseGroupFirst}
                        isSpendWiseGroupLast={!!(t as any)._spendWiseGroupLast}
                        spendWiseRunningBalance={(t as any)._spendWiseRunningBalance}
                        spendWiseGroupColorIndex={(t as any)._spendWiseGroupColorIndex}
                        blinkMode={blinkMode}
                        showNarration={showNarration}
                        userNames={userNames}
                        journalAccountNames={journalAccountNames}
                        accountNames={accountNames}
                        context={context}
                        contextId={contextId}
                        groupEntityType={groupEntityType}
                        showItemPartyColumn={showItemPartyColumn}
                        stockView={stockView}
                        displayUnit={displayUnit}
                        item={item}
                        onRowClick={onRowClick}
                        onAddLink={onAddLink}
                        onHistoryVoucher={onHistoryVoucher}
                        onApproveVoucher={effectiveOnApproveVoucher}
                        onRowSelect={(tx: { id: string }) => setSelectedId(tx.id)}
                        isSelected={selectedId === t.id}
                                        isRelatedBlink={getIsRelatedBlink(t)}
                        isSelectedRowBlink={getIsSelectedRowBlink(t)}
                        getDisplayValue={getDisplayValue}
                        isTaxContext={isTaxContext}
                        isBalanceMasked={isBalanceMasked}
                        hideBalanceColumn={hideBalanceColumn}
                        hideStatusColumn={hideStatusColumn}
                        visibleColumns={visibleColumns}
                        useOutstandingForBalance={shouldUseOutstandingBalance}
                        isBillWise={isBillWiseMode}
                        ensureMinGaps={ensureMinGaps}
                        showFileColumn={showFileBySelection}
                        statusBillWiseOnly={statusBillWiseOnly}
                      />
                    );
                  })
              )
            ) : (
             <tr key="no-records-row">
              <TableCell
                colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1}
                className="text-center text-gray-500 py-2"
              >
                No matching records found
              </TableCell>
            </tr>
            )}
        </>
      </TableBody>
       
       {!hideFooter && (
        <TableFooter className="bg-white shadow-inner border-t border-b border-border">
           <TableRow aria-hidden className="bg-transparent border-0 hover:bg-transparent">
                <TableCell colSpan={openingBalanceColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol + visibleBalanceCol + 1} className="p-0 m-0 border-0 bg-transparent" style={{ height: "20px", minHeight: "6px" }} />
           </TableRow>
           <TableRow>
                <TableCell colSpan={totalColSpan} className="text-right font-semibold">
                    Total
                </TableCell>
                {showCol("dr") && !hideDebitColumn && <TableCell className={cn("text-right text-green-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {formatFooterAmount(displayTotalDr)}
                </TableCell>}
                {showCol("cr") && !hideCreditColumn && <TableCell className={cn("text-right text-red-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {formatFooterAmount(displayTotalCr)}
                </TableCell>}
                {showCol("status") && !hideStatusColumn && <TableCell className={cn("text-center font-semibold", ensureMinGaps && "min-w-[95px] px-[5px]")}>-</TableCell>}
                {showCol("runningBalance") && !hideBalanceColumn && <TableCell className={cn("text-right font-semibold", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                    -
                </TableCell>}
                <TableCell className="w-10 p-0" />
            </TableRow>
            <TableRow className="border-t-2 border-black border-b-2 border-black font-bold text-base bg-muted/30">
                <TableCell colSpan={totalColSpan + visibleDebitCol + visibleCreditCol + visibleStatusCol} className="text-right">
                    Closing Balance
                </TableCell>
                {showCol("runningBalance") && !hideBalanceColumn && <TableCell className={cn("text-right font-bold", closingBalance >= 0 ? "text-green-700" : "text-red-700", ensureMinGaps && "min-w-[115px] px-[5px]")}>
                     {formatFooterBalance(displayClosingBalance)}
                </TableCell>}
                <TableCell className="w-10 p-0" />
            </TableRow>
        </TableFooter>
       )}
      </Table>
  );

  return (
    <div
      ref={tableContainerRef}
      tabIndex={0}
      role="grid"
      aria-label="Transactions"
      data-theme-table="transactions"
      className={cn(
        "w-full min-w-full overflow-x-auto scrollbar-slim-dim outline-none focus:outline-none border-b-2 border-border"
      )}
      onKeyDown={handleTableKeyDown}
      onClick={() => tableContainerRef.current?.focus()}
    >
      {tableContent}
    </div>
  );
}

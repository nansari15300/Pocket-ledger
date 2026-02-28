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
const BillwiseTransactionTable = React.lazy(() =>
  import("./BillwiseTransactionTable").then((m) => ({ default: m.BillwiseTransactionTable }))
);
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
} from "./transactionTableShared";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { toast } from "sonner";

export type { Context, Transaction };

export type TransactionColumnKey = "date" | "type" | "voucherNo" | "user" | "dr" | "cr" | "status" | "runningBalance";
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
}

export function TransactionsTable({
  transactions,
  context,
  contextId,
  openingBalance = 0,
  openingBalanceOutstanding,
  openingBalanceLinkedVoucherNos,
  showNarration = false,
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
}: TransactionsTableProps) {
  const { company, companyId } = useCompany();
  const { user, customUser } = useAuth();
  const currentUserUid = user?.uid ?? null;
  const currentUserDisplayName = customUser?.displayName || user?.displayName || user?.email || null;
  const { balanceMode } = useBalanceMode();
  const handleApproveVoucherDefault = useCallback(
    async (transaction: any) => {
      if (!companyId || !transaction?.id) return;
      try {
        await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, transaction.id), { isApproved: true });
        toast.success("Transaction approved.");
      } catch (e) {
        toast.error("Failed to approve transaction.");
      }
    },
    [companyId]
  );
  const effectiveOnApproveVoucher = onApproveVoucher ?? handleApproveVoucherDefault;
  // Statement view = this component's table (running balance). Bill wise view = BillwiseTransactionTable (outstanding per row). Same for party, group, daybook, and account.
  const isBillWisePartyOrGroup = balanceMode === "bill_wise" && (context === "party" || context === "group" || context === "daybook" || context === "account" || context === "expense" || context === "staff" || context === "tax" || context === "tax_group");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId && !transactions.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [transactions, selectedId]);

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

  const {
    formatDate,
    formatDateBS,
    formatCurrency,
    dateSystem,
  } = useDate();
  const { settings: animationSettings } = useAnimationSettings();
  
  // Get animation settings - check enabled flag explicitly
  const isRowAnimationEnabled = animationSettings.rows.enabled === true;
  // Use exact duration when enabled, 0 when disabled
  const rowAnimationDuration = isRowAnimationEnabled ? animationSettings.rows.duration : 0;
  
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

  // Footer Formatters (Same Logic as Row)
  const formatFooterBalance = (value: number) => {
    if (isBalanceMasked) return '*****';
    if (typeof value !== 'number' || isNaN(value)) return '-';
    const isItemQty = context === 'item' && stockView === 'qty';
    if (isItemQty) {
      return `${formatQuantity(value)} ${displayUnit || ''}`;
    }
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
  const dateCols = dateSystem === "Both" ? 2 : 1;
  const userCol = context === 'note' ? 0 : 1;
  const fileCol = showFileColumn ? 1 : 0;
  const baseCols = dateCols + 2 + userCol + fileCol + (context === 'daybook' ? 1 : 0) + (context === 'item' ? 1 : 0);
  const debitCol = hideDebitColumn ? 0 : 1;
  const creditCol = hideCreditColumn ? 0 : 1;
  // Hide status column in statement view (bill-wise only shows per-bill status)
  const hideStatusColumn = balanceMode === "statement";
  const statusCol = hideStatusColumn ? 0 : 1;

  const visibleDateCols = visibleColumns != null ? (showCol("date") ? dateCols : 0) : dateCols;
  const visibleBaseCols = visibleColumns != null
    ? (showCol("date") ? dateCols : 0) + (showCol("type") ? 1 : 0) + (showCol("voucherNo") ? 1 : 0) + (context === 'daybook' ? 1 : 0) + (context === 'item' ? 1 : 0) + (showCol("user") && context !== 'note' ? 1 : 0) + (showFileColumn ? 1 : 0)
    : baseCols;
  const visibleDebitCol = visibleColumns != null ? (showCol("dr") && !hideDebitColumn ? 1 : 0) : debitCol;
  const visibleCreditCol = visibleColumns != null ? (showCol("cr") && !hideCreditColumn ? 1 : 0) : creditCol;
  const visibleStatusCol = visibleColumns != null ? (showCol("status") && !hideStatusColumn ? 1 : 0) : statusCol;
  const visibleBalanceCol = visibleColumns != null ? (showCol("runningBalance") && !hideBalanceColumn ? 1 : 0) : (hideBalanceColumn ? 0 : 1);

  const openingBalanceColSpan = visibleBaseCols + (context === 'note' ? 1 : 0);
  const totalColSpan = visibleBaseCols;
  
  const showOpeningBalance = ["party", "account", "staff", "tax", "item", "expense", "group"].includes(context);

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
  if (useMobileCardView) {
    return (
      <div className="w-full min-w-0 px-0.5 space-y-px pb-4 overflow-hidden">
        {showOpeningBalance && (
          <Card className="p-2.5 min-h-9 min-w-0 overflow-hidden bg-card border border-border/80 shadow-sm">
            <div className="flex justify-between items-start gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 min-h-9">
                {openingBalanceLeftContent}
                {openingBalanceSearch}
                <p className="font-bold text-sm text-foreground">{openingBalanceLabel}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <span className={cn(
                  "text-sm font-bold px-2 py-0.5 rounded-md",
                  (balanceMode === "bill_wise" && (context === "party" || context === "group") ? displayOpeningBalanceForRow : displayOpeningBalance) >= 0 ? "text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-200" : "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-200"
                )}>
                  {context === "item" && stockView === "qty" && item
                    ? `${formatQuantity(Math.abs(displayOpeningBalance))} ${displayUnit || ""}`
                    : (() => {
                        const ob = balanceMode === "bill_wise" && (context === "party" || context === "group") ? displayOpeningBalanceForRow : displayOpeningBalance;
                        return `${formatCurrency(Math.abs(ob), { noSuffix: true, context: "transaction", noAnimation: true })} ${ob >= 0 ? "Dr" : "Cr"}`;
                      })()}
                </span>
                {balanceMode === "bill_wise" && (context === "party" || context === "group") && obOutstandingDisplay != null ? (
                  <>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-semibold h-[22px]",
                        obStatusLabel === "Paid" ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                      )}
                    >
                      {obStatusLabel}
                    </Badge>
                    {(openingBalanceLinkedVoucherNos?.length) ? (
                      <span className="text-[10px] text-muted-foreground">
                        {openingBalanceLinkedVoucherNos.length > 1 ? "Multi link" : `to ${openingBalanceLinkedVoucherNos[0]}`}
                      </span>
                    ) : null}
                  </>
                ) : balanceMode === "bill_wise" && (context === "party" || context === "group") && openingBalanceLinkedVoucherNos?.length && obOutstandingDisplay == null ? (
                  <span className="text-[10px] text-muted-foreground">
                    {openingBalanceLinkedVoucherNos.length > 1 ? "Multi link" : `to ${openingBalanceLinkedVoucherNos[0]}`}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        )}
        {transactions.map((t: any) => {
          let debit = t.debit ?? 0;
          let credit = t.credit ?? 0;
          let balance = t.balance ?? t.runningBalance ?? 0;
          // Bill-wise: use outstanding for balance when available (party/group mobile card).
          const useOutstanding = balanceMode === "bill_wise" && (context === "party" || context === "group") && (t.outstanding != null);
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
          const showStatusInCard = balanceMode === "bill_wise" && (context === "party" || context === "group");
          const statusLabel = showStatusInCard ? getStatusLabel(t, context) : "";
          const statusDetailText = showStatusInCard ? getStatusDetail(t) : "";
          const useNeutralStatus = ["Journal", "Note", "Contra", "Salary"].includes(statusLabel);
          const isPaidStatus = statusLabel === "Paid";
          const isUnpaidStatus = statusLabel === "Partial" || statusLabel === "Unpaid" || statusLabel === "Overdue";
          const isPendingApproval = (t as any).isApproved !== true;
          return (
            <Card
              key={t.id}
              className={cn(
                "p-2.5 min-w-0 w-full overflow-hidden border border-border/80 shadow-sm cursor-pointer transition-colors",
                isPendingApproval
                  ? "bg-pink-100 dark:bg-pink-950/40 hover:bg-pink-200 dark:hover:bg-pink-950/50"
                  : "bg-card hover:bg-muted/30"
              )}
              onClick={() => onRowClick?.(t)}
            >
              {/* Row 1: Title (left) | Amount (right) */}
              <div className="flex justify-between items-start gap-2 min-w-0">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="font-bold text-sm truncate">
                    {titleLabel}
                  </p>
                </div>
                <p className={cn("font-bold text-sm shrink-0", isCredit ? "text-green-600" : "text-red-600")}>
                  {amount > 0 ? formatAmountOrQty(amount) : "-"}
                </p>
              </div>
              {/* Narration row: left = narration, right = status (bill-wise) or running balance (statement) */}
              <div className="flex justify-between items-start gap-2 min-w-0 mt-0.5">
                <p className="text-xs text-muted-foreground break-words whitespace-normal line-clamp-none min-w-0 flex-1">
                  <span className="font-semibold">Narration : </span>
                  {t.narration || "—"}
                </p>
                {showStatusInCard && (statusLabel || statusDetailText) ? (
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    {statusLabel ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-semibold h-[22px]",
                          useNeutralStatus
                            ? "text-muted-foreground border-muted-foreground/40"
                            : isPaidStatus
                              ? "text-green-600 border-green-600/50"
                              : isUnpaidStatus
                                ? "text-red-600 border-red-600/50"
                                : "text-muted-foreground border-muted-foreground/40"
                        )}
                      >
                        {statusLabel}
                      </Badge>
                    ) : null}
                    {statusDetailText ? (
                      <span className="text-[10px] text-muted-foreground">{statusDetailText}</span>
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
              {/* Details below: groupAccountName, date, user; balance only in bill-wise (statement shows balance in narration row) */}
              <div className="flex justify-between items-end gap-2 min-w-0 mt-0.5">
                <div className="min-w-0 flex-1 overflow-hidden">
                  {groupAccountName ? (
                    <p className="text-xs text-muted-foreground truncate font-medium">
                      Account: {groupAccountName}
                    </p>
                  ) : null}
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
        })}
      </div>
    );
  }

  if (isBillWisePartyOrGroup) {
    return (
      <React.Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
      <BillwiseTransactionTable
        transactions={transactions}
        context={context}
        contextId={contextId}
        openingBalance={openingBalance}
        openingBalanceOutstanding={openingBalanceOutstanding}
        openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
        showNarration={showNarration}
        stockView={stockView}
        item={item}
        displayUnit={displayUnit}
        setDisplayUnit={setDisplayUnit}
        journalAccountNames={journalAccountNames}
        userNames={userNames}
        filters={filters}
        setFilters={setFilters}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        onRowClick={onRowClick}
        onDeleteVoucher={onDeleteVoucher}
        onHistoryVoucher={onHistoryVoucher}
        onAddLink={onAddLink}
        onApproveVoucher={effectiveOnApproveVoucher}
        periodDr={periodDr}
        periodCr={periodCr}
        closingBalance={closingBalance}
        isTaxContext={isTaxContext}
        hideDebitColumn={hideDebitColumn}
        hideCreditColumn={hideCreditColumn}
        hideBalanceColumn={hideBalanceColumn}
        hideFooter={hideFooter}
        getDisplayValue={getDisplayValueProp}
        voucherTypes={voucherTypes}
        onVoucherTypeChange={onVoucherTypeChange}
        isBalanceMasked={isBalanceMasked}
        visibleColumns={visibleColumns}
        openingBalanceActions={openingBalanceActions}
        scrollOnlyTransactions={scrollOnlyTransactions}
        statusFilter={statusFilter}
        statusFilterAllChecked={statusFilterAllChecked}
        onStatusFilterAll={onStatusFilterAll}
        onStatusFilterChange={onStatusFilterChange}
        statusFilterIdPrefix={statusFilterIdPrefix}
      />
      </React.Suspense>
    );
  }

  return (
    <div
      ref={tableContainerRef}
      tabIndex={0}
      role="grid"
      aria-label="Transactions"
      className="w-full min-w-full overflow-x-auto scrollbar-slim-dim outline-none focus:outline-none"
      onKeyDown={handleTableKeyDown}
      onClick={() => tableContainerRef.current?.focus()}
    >
      <Table
        className={cn(ensureMinGaps ? "table-auto w-full min-w-full" : "table-fixed w-full")}
        scrollContainer={false}
      >
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
          {context === 'item' && <TableHead className="font-semibold p-0" style={ensureMinGaps ? { minWidth: "90px" } : undefined}>Party</TableHead>}
          {showCol("user") && context !== 'note' && renderHeaderWithFilter("user", "User", false, ensureMinGaps ? 85 : undefined)}
          {showFileColumn && <TableHead className="font-semibold p-0 text-center" style={ensureMinGaps ? { minWidth: "44px" } : undefined}>File</TableHead>}
          {showCol("dr") && !hideDebitColumn && renderHeaderWithFilter("debit", stockView === 'amount' ? "Debit" : "In", true, ensureMinGaps ? 100 : undefined)}
          {showCol("cr") && !hideCreditColumn && renderHeaderWithFilter("credit", stockView === 'amount' ? "Credit" : "Out", true, ensureMinGaps ? 100 : undefined)}
          {showCol("status") && !hideStatusColumn && renderHeaderWithFilter("status", "Status", false, ensureMinGaps ? 95 : undefined)}
          {showCol("runningBalance") && !hideBalanceColumn && renderHeaderWithFilter("balance", stockView === 'amount' ? "Balance" : "Stock", true, ensureMinGaps ? 115 : undefined)}
          <TableHead className="w-10 p-0" />
        </TableRow>
      </TableHeader>
      
      <TableBody>
        <AnimatePresence>
            {showOpeningBalance && (
              <motion.tr 
                key="opening-balance-row" 
                layout 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                transition={{ duration: isRowAnimationEnabled ? rowAnimationDuration : 0 }}
              >
                <TableCell colSpan={openingBalanceColSpan - (showFileColumn ? 1 : 0)} className="font-semibold">
                    <div className="flex items-center gap-2">
                      {openingBalanceLeftContent}
                      {openingBalanceSearch}
                      <span>{openingBalanceLabel}</span>
                    </div>
                </TableCell>
                {showFileColumn && <TableCell className="text-center">-</TableCell>}
                {showCol("dr") && !hideDebitColumn && <TableCell className={cn("text-right text-green-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {displayOpeningBalanceDr > 0 ? formatFooterAmount(displayOpeningBalanceDr) : '-'}
                </TableCell>}
                {showCol("cr") && !hideCreditColumn && <TableCell className={cn("text-right text-red-700 font-semibold", ensureMinGaps && "min-w-[100px] px-[5px]")}>
                    {displayOpeningBalanceCr > 0 ? formatFooterAmount(displayOpeningBalanceCr) : '-'}
                </TableCell>}
                {showCol("status") && !hideStatusColumn && (
                  <TableCell className={cn("text-center align-baseline", ensureMinGaps && "min-w-[95px] px-[5px]")}>
                    {openingBalanceOutstanding != null ? (
                      <div className="flex flex-col items-center gap-[1px] leading-tight">
                        <Badge
                          variant="outline"
                          className={cn(
                            "inline-flex h-[22px] font-semibold shrink-0",
                            openingBalanceOutstanding <= 0 ? "text-green-600 border-green-600/50" : "text-red-600 border-red-600/50"
                          )}
                        >
                          {openingBalanceOutstanding <= 0 ? "Paid" : openingBalanceOutstanding >= Math.abs(openingBalance ?? 0) ? "Unpaid" : "Partial"}
                        </Badge>
                        {openingBalanceLinkedVoucherNos?.length ? (
                          <span className="text-[10px] text-muted-foreground">
                            {openingBalanceLinkedVoucherNos.length > 1 ? "Multi link" : `to ${openingBalanceLinkedVoucherNos[0]}`}
                          </span>
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
              </motion.tr>
            )}
            {transactions.length > 0 ? (
              transactions.map((t: any) => (
                <TransactionRow
                    key={t.id}
                    transaction={t}
                    showNarration={showNarration}
                    userNames={userNames}
                    journalAccountNames={journalAccountNames}
                    accountNames={accountNames}
                    context={context}
                    contextId={contextId}
                    groupEntityType={groupEntityType}
                    stockView={stockView}
                    displayUnit={displayUnit}
                    item={item}
                    onRowClick={onRowClick}
                    onAddLink={onAddLink}
                    onHistoryVoucher={onHistoryVoucher}
                    onApproveVoucher={effectiveOnApproveVoucher}
                    onRowSelect={(tx: { id: string }) => setSelectedId(tx.id)}
                    isSelected={selectedId === t.id}
                    getDisplayValue={getDisplayValue}
                    isTaxContext={isTaxContext}
                    isBalanceMasked={isBalanceMasked}
                    hideBalanceColumn={hideBalanceColumn}
                    hideStatusColumn={hideStatusColumn}
                    visibleColumns={visibleColumns}
                    useOutstandingForBalance={false}
                    ensureMinGaps={ensureMinGaps}
                    showFileColumn={showFileColumn}
                />
              ))
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
        </AnimatePresence>
      </TableBody>
       
       {!hideFooter && (
        <TableFooter className="bg-white shadow-inner border-t">
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
            <TableRow className="border-t-2 border-black font-bold text-base bg-muted/30">
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
    </div>
  );
}

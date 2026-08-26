"use client";

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CheckCircle, CheckSquare, Filter, History, MoreVertical, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import type { DateRange } from "@/components/ui/ad-calendar";
import { approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { dispatchVoucherLivePatch } from "@/lib/voucherFormAttachmentSave";
import { isLedgerTransactionUnapproved } from "@/lib/ledgerPendingApproval";
import { useAuth } from "@/hooks/useAuth";
import { openPrintDirect } from "@/lib/printDirect";
import { applyLedgerPageToPrintPayload } from "@/lib/ledgerPagePrint";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { txnSelectedMainRowCn, txnSelectedNarrationRowCn, txnTableIconBtnCn } from "@/lib/listSelectionChrome";
import { DEFAULT_TRANSACTION_SORT_ORDER } from "@/lib/transactionSort";
import { ROWS_PER_PAGE_OPTIONS_DEFAULT } from "@/lib/rowsPerPageSelect";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { useRowsPerPageSelectControl } from "@/hooks/useRowsPerPageSelect";
import { useStatementCheckMode } from "@/hooks/useStatementCheckMode";
import { LedgerDesktopFooter } from "@/components/vouchers/LedgerDesktopFooter";
import { LedgerFooterCheckboxPill } from "@/components/vouchers/ledgerFooterChrome";
import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";
import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";
import { useShowNotes } from "@/components/vouchers/transactionColumnVisibility";
import { OpeningBalanceFileCellContent, resolveTxnDrCrSide, voucherTypePillClassName, readSavedFileColumnViewPrefs, saveFileColumnViewPrefs, type FileColumnDisplayMode } from "@/components/vouchers/transactionTableShared";
import type { TransactionSortBy, TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import type { LoanTransaction } from "../types/loanTransactionTypes";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { parseIsoDate, tryParseIsoDate, todayIso } from "../utils/loanDateUtils";
import { mergeLoanAccountingTransactions } from "../utils/loanAccountingRows";
import { roundMoney } from "../utils/loanRounding";
import { compareLoanTxnChronological, loanLiabilityDrCr } from "../utils/loanLedgerMovement";
import { getVoucherAttachmentUrlsForUi, normalizeFileUrlsField } from "@/lib/voucherAttachmentNormalize";
import { loanTxnPaymentDateInRange } from "../utils/loanAccountingDateFilter";

const LOAN_COL_STORAGE = "loanAccountingVisibleColumns";
const LOAN_OPENING_BALANCE_ROW_ID = "__loan_opening_balance__";

export type LoanAccountingHandle = {
  print: () => Promise<void>;
};

type LoanColKey =
  | "file"
  | "date"
  | "kind"
  | "principal"
  | "interest"
  | "charges"
  | "total"
  | "type"
  | "debit"
  | "credit"
  | "balance";

const LOAN_COL_LABELS: Record<LoanColKey, string> = {
  file: "File",
  date: "Date",
  kind: "Kind",
  principal: "Principal",
  interest: "Interest",
  charges: "Charges",
  total: "Total",
  type: "Type",
  debit: "Debit",
  credit: "Credit",
  balance: "Balance",
};

const DEFAULT_LOAN_COLS: Record<LoanColKey, boolean> = {
  file: true,
  date: true,
  kind: true,
  principal: true,
  interest: true,
  charges: true,
  total: true,
  type: true,
  debit: true,
  credit: true,
  balance: true,
};

type LedgerRow = { row: LoanTransaction; debit: number; credit: number; signed: number };

function withRunning(list: LoanTransaction[]): LedgerRow[] {
  const opening = list.find((r) => r.id === LOAN_OPENING_BALANCE_ROW_ID);
  const rest = list.filter((r) => r.id !== LOAN_OPENING_BALANCE_ROW_ID);
  const chronological = [...rest].sort(compareLoanTxnChronological);
  const ordered = opening ? [opening, ...chronological] : chronological;
  let signed = 0;
  return ordered.map((row) => {
    const move = loanLiabilityDrCr(row);
    signed = roundMoney(signed + move.debit - move.credit);
    return { row, debit: move.debit, credit: move.credit, signed };
  });
}

export const LoanTransactions = forwardRef(function LoanTransactions(
  {
    rows,
    ledger = false,
    loanAccountId,
    loanId,
    loanName,
    openingBalanceAttachmentUrls,
    openingBalanceDate,
    dateRange,
    unapprovedOnly = false,
    onEditVoucher,
    onHistoryVoucher,
  }: {
    rows: LoanTransaction[];
    ledger?: boolean;
    loanAccountId?: string;
    loanId?: string;
    loanName?: string;
    openingBalanceAttachmentUrls?: string[] | null;
    openingBalanceDate?: string;
    dateRange?: DateRange;
    unapprovedOnly?: boolean;
    onEditVoucher?: (voucher: Record<string, unknown>) => void;
    onHistoryVoucher?: (voucher: Record<string, unknown>) => void;
  },
  ref: React.Ref<LoanAccountingHandle>
) {
  const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
  const { company } = useCompany();
  const { vouchers } = useVouchers();
  const { user, customUser } = useAuth();
  const { can, canAddFileImagePdf } = usePermissions();
  const showFileColumn = ledger && canAddFileImagePdf === true;
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [fileFilterPopoverOpen, setFileFilterPopoverOpen] = useState(false);
  const [fileDisplayMode, setFileDisplayMode] = useState<FileColumnDisplayMode>(
    () => readSavedFileColumnViewPrefs().displayMode
  );
  const [fileShowAll, setFileShowAll] = useState(() => readSavedFileColumnViewPrefs().showAll);
  const filterInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [showNarration, setShowNarration] = useState(true);
  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  const both = dateSystem === "Both";
  const money = (n: number) =>
    formatCurrency(n, { noAnimation: true, noSuffix: true, showDrCr: false, context: "transaction" });
  const moneyDash = (n: number) => (Math.abs(n) < 1e-6 ? "—" : money(n));

  const mergedRows = useMemo(() => {
    if (!ledger || !loanAccountId) return rows.filter((r) => !!r.journalEntryId);
    const companyId = rows[0]?.companyId || company?.id || "";
    const lid = loanId || rows[0]?.loanId || "";
    return mergeLoanAccountingTransactions(
      rows.filter((r) => !!r.journalEntryId),
      (vouchers || []) as Record<string, unknown>[],
      loanAccountId,
      lid,
      companyId
    );
  }, [rows, ledger, loanAccountId, loanId, vouchers, company?.id]);

  const openingAttachmentUrls = useMemo(
    () => normalizeFileUrlsField(openingBalanceAttachmentUrls),
    [openingBalanceAttachmentUrls]
  );

  const openingBalanceRow = useMemo((): LoanTransaction | null => {
    if (!ledger) return null;
    const companyId = rows[0]?.companyId || company?.id || "";
    const lid = loanId || rows[0]?.loanId || "";
    if (!companyId || !lid) return null;
    const payDate = String(openingBalanceDate || rows[0]?.paymentDate || "").trim() || todayIso();
    return {
      id: LOAN_OPENING_BALANCE_ROW_ID,
      companyId,
      loanId: lid,
      scheduleId: null,
      kind: "note",
      amount: 0,
      principalAmount: 0,
      interestAmount: 0,
      chargeAmount: 0,
      lateFeeAmount: 0,
      paymentDate: payDate,
      journalDate: payDate,
      dueDate: null,
      bankAccountId: "",
      journalEntryId: null,
      reversedTransactionId: null,
      reversalJournalId: null,
      referenceNumber: "",
      chequeNumber: "",
      bankTransactionId: "",
      paymentMode: "other",
      notes: "Opening Balance",
      createdAt: payDate,
      createdBy: "",
      isReversed: false,
    };
  }, [ledger, rows, company?.id, loanId, openingBalanceDate]);

  const visibleRows = useMemo(() => {
    let list = mergedRows;
    if (ledger && !includeNotesInTable) {
      list = list.filter((r) => r.kind !== "note" || r.id === LOAN_OPENING_BALANCE_ROW_ID);
    }
    if (ledger && openingBalanceRow) {
      list = [openingBalanceRow, ...list.filter((r) => r.id !== LOAN_OPENING_BALANCE_ROW_ID)];
    }
    return list;
  }, [mergedRows, ledger, includeNotesInTable, openingBalanceRow]);

  const voucherById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const v of vouchers || []) {
      if (v?.id) map.set(String(v.id), v as Record<string, unknown>);
    }
    return map;
  }, [vouchers]);

  const fileUrlsForRow = (row: LoanTransaction): string[] => {
    if (row.id === LOAN_OPENING_BALANCE_ROW_ID) return openingAttachmentUrls;
    const id = row.journalEntryId;
    if (!id) return [];
    const voucher = voucherById.get(id);
    if (!voucher) return [];
    return getVoucherAttachmentUrlsForUi(voucher).map((u) => String(u)).filter(Boolean);
  };

  const rowHasFileAttachment = (row: LoanTransaction): boolean => fileUrlsForRow(row).length > 0;

  const voucherForRow = useCallback(
    (row: LoanTransaction): Record<string, unknown> | null => {
      if (row.id === LOAN_OPENING_BALANCE_ROW_ID) return null;
      const id = row.journalEntryId;
      if (!id) return null;
      return voucherById.get(id) ?? null;
    },
    [voucherById]
  );

  const rowIsUnapproved = useCallback(
    (row: LoanTransaction): boolean => {
      const voucher = voucherForRow(row);
      if (!voucher) return false;
      return isLedgerTransactionUnapproved(voucher as { isApproved?: boolean; type?: string; id?: string });
    },
    [voucherForRow]
  );

  const handleApproveVoucher = useCallback(
    async (row: LoanTransaction) => {
      const voucher = voucherForRow(row);
      const companyId = String(company?.id || rows[0]?.companyId || "").trim();
      const voucherId = String(voucher?.id || row.journalEntryId || "").trim();
      if (!companyId || !voucherId || !user?.uid) return;
      try {
        const approverName = customUser?.displayName || user.displayName || user.email || user.uid;
        await approveVoucherWithHistory(companyId, voucherId, user.uid, approverName);
        dispatchVoucherLivePatch(companyId, voucherId, {
          id: voucherId,
          isApproved: true,
          approvedByUserId: user.uid,
          approvedByUserName: approverName,
        });
        toast.success("Transaction approved.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to approve transaction.");
      }
    },
    [voucherForRow, company?.id, rows, user, customUser?.displayName]
  );

  const [visibleColumns, setVisibleColumns] = useState<Record<LoanColKey, boolean>>(DEFAULT_LOAN_COLS);
  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(DEFAULT_TRANSACTION_SORT_ORDER);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const { selectValue: rowsPerPageSelectValue, onSelectValueChange: handleRowsPerPageChange } =
    useRowsPerPageSelectControl(rowsPerPage, setRowsPerPage, setCurrentPage, ROWS_PER_PAGE_OPTIONS_DEFAULT, "10");

  useEffect(() => {
    try {
      setShowNarration(sessionStorage.getItem("showNarration") !== "false");
      const saved = sessionStorage.getItem(LOAN_COL_STORAGE);
      if (saved) setVisibleColumns({ ...DEFAULT_LOAN_COLS, ...JSON.parse(saved) });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const saved = readSavedFileColumnViewPrefs();
    if (saved.filterMode === "all") return;
    setFilters((prev) => {
      if (prev.file === "with" || prev.file === "without") return prev;
      return { ...prev, file: saved.filterMode };
    });
  }, []);

  const showCol = (key: LoanColKey) => !ledger || visibleColumns[key] !== false;

  const dateParts = (iso: string) => {
    const d = tryParseIsoDate(iso);
    if (!d) return { bs: iso || "—", ad: iso || "—", single: iso || "—" };
    return {
      bs: formatDateBS(d) || "—",
      ad: formatDate(d) || "—",
      single: dateSystem === "AD" ? formatDate(d) : formatDateBS(d),
    };
  };

  const rowVoucherType = (row: LoanTransaction): string => {
    if (row.id === LOAN_OPENING_BALANCE_ROW_ID) return "opening_balance";
    if (row.kind === "note") return "note";
    const voucher = row.journalEntryId ? voucherById.get(row.journalEntryId) : null;
    return String(voucher?.type || "journal");
  };

  const rowKindLabel = (row: LoanTransaction) =>
    row.id === LOAN_OPENING_BALANCE_ROW_ID ? "Opening Balance" : row.kind.replace(/_/g, " ");

  const rowTypeLabel = (row: LoanTransaction) => rowVoucherType(row).replace(/_/g, " ");

  const sourced = useMemo(() => withRunning(visibleRows), [visibleRows]);

  const dateFiltered = useMemo(() => {
    if (!ledger || (!dateRange?.from && !dateRange?.to)) return sourced;
    return sourced.filter(({ row }) => loanTxnPaymentDateInRange(row.paymentDate, dateRange));
  }, [sourced, ledger, dateRange]);

  const approvalFiltered = useMemo(() => {
    if (!ledger || !unapprovedOnly) return dateFiltered;
    return dateFiltered.filter(({ row }) => rowIsUnapproved(row));
  }, [dateFiltered, ledger, unapprovedOnly, rowIsUnapproved]);

  const columnFiltered = useMemo(() => {
    const fileMode = (filters.file || "").trim().toLowerCase();
    return approvalFiltered.filter(({ row, debit, credit, signed }) => {
      if (fileMode === "with" && !rowHasFileAttachment(row)) return false;
      if (fileMode === "without" && rowHasFileAttachment(row)) return false;
      const dates = dateParts(row.paymentDate);
      const hay: Record<string, string> = {
        date: dates.single,
        date_bs: dates.bs,
        date_ad: dates.ad,
        kind: rowKindLabel(row),
        principal: money(row.principalAmount),
        interest: money(row.interestAmount),
        charges: money(row.chargeAmount + row.lateFeeAmount),
        total: money(row.amount),
        type: rowTypeLabel(row),
        debit: moneyDash(debit),
        credit: moneyDash(credit),
        balance: String(signed),
      };
      return Object.entries(filters).every(([key, value]) => {
        if (key === "file" || !value.trim()) return true;
        return String(hay[key] ?? "").toLowerCase().includes(value.trim().toLowerCase());
      });
    });
  }, [approvalFiltered, filters, dateSystem, formatDate, formatDateBS, voucherById, openingAttachmentUrls]);

  const companyId = rows[0]?.companyId;
  const resolvedLoanId = loanId ?? rows[0]?.loanId;
  const statementCheck = useStatementCheckMode({
    companyId,
    context: "loan",
    contextId: resolvedLoanId,
    viewMode: "statement",
    orderedTransactions: columnFiltered.map((r) => r.row),
  });

  const afterCheck = useMemo(() => {
    if (!ledger) return columnFiltered;
    const visible = statementCheck.filterTransactions(columnFiltered.map((r) => r.row)) as LoanTransaction[];
    const ids = new Set(visible.map((r) => r.id));
    const kept = columnFiltered.filter((r) => ids.has(r.row.id));
    if (!statementCheck.checkModeActive) return kept;
    return withRunning(kept.map((r) => r.row));
  }, [columnFiltered, ledger, statementCheck.filterTransactions, statementCheck.checkModeActive]);

  const sortedRows = useMemo(() => {
    if (!ledger) return afterCheck;
    const list = [...afterCheck];
    const dir = sortOrder === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === "amount") return dir * (a.row.amount - b.row.amount);
      if (sortBy === "voucherNo") return dir * rowTypeLabel(a.row).localeCompare(rowTypeLabel(b.row));
      const dateCmp = compareLoanTxnChronological(a.row, b.row);
      return dir * dateCmp;
    });
    return list;
  }, [afterCheck, ledger, sortBy, sortOrder]);

  const n = sortedRows.length;
  const totalPages = rowsPerPage <= 0 ? 1 : Math.max(1, Math.ceil(n / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const { pageRows, beforeCount, afterCount } = useMemo(() => {
    if (!ledger || rowsPerPage <= 0) {
      return { pageRows: sortedRows, beforeCount: 0, afterCount: 0 };
    }
    const end = n - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return {
      pageRows: sortedRows.slice(start, end),
      beforeCount: start,
      afterCount: Math.max(0, n - end),
    };
  }, [ledger, sortedRows, n, rowsPerPage, safePage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const displayRows = ledger ? pageRows : columnFiltered;
  const periodDr = roundMoney(displayRows.reduce((s, r) => s + r.debit, 0));
  const periodCr = roundMoney(displayRows.reduce((s, r) => s + r.credit, 0));
  const closingSigned = displayRows.length ? displayRows[displayRows.length - 1]!.signed : 0;

  useImperativeHandle(ref, () => ({
    print: async () => {
      if (!ledger || !company) return;
      const toastId = toast.loading("Preparing print...");
      const printRows = sortedRows.map(({ row, debit, credit, signed }) => ({
        id: row.journalEntryId || row.id,
        date: parseIsoDate(row.paymentDate),
        type: row.kind === "note" ? "note" : "journal",
        voucherNumber: row.referenceNumber || row.journalEntryId || "",
        narration: row.notes || "",
        debit,
        credit,
        balance: signed,
        fileUrls: fileUrlsForRow(row),
      }));
      try {
        await openPrintDirect(
          applyLedgerPageToPrintPayload(
            {
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
              title: `Loan Accounting: ${loanName || "Loan"}`,
              context: "staff",
              contextId: loanAccountId || "",
              dateSystem,
              dateRangeText: "All Time",
              vouchersCount: printRows.length,
              openingBalance: 0,
              transactions: printRows,
              showNarration,
              includeNotes: includeNotesInTable,
              visibleColumns: { ...visibleColumns, file: showFileColumn },
              billWise: false,
            },
            {
              paginatedTransactions: printRows,
              openingForPage: 0,
              periodDrForPage: periodDr,
              periodCrForPage: periodCr,
              closingForPage: closingSigned,
              booksOpeningBalance: 0,
              ledgerShowBookOpeningRow: true,
              ledgerDateFilterActive: false,
            }
          ),
          true
        );
        toast.dismiss(toastId);
      } catch (e) {
        toast.dismiss(toastId);
        toast.error(e instanceof Error ? e.message : "Print failed.");
      }
    },
  }));

  const colSpanAll =
    (showCol("date") ? (both ? 2 : 1) : 0) +
    (showCol("kind") ? 1 : 0) +
    (showCol("principal") ? 1 : 0) +
    (showCol("interest") ? 1 : 0) +
    (showCol("charges") ? 1 : 0) +
    (showCol("total") ? 1 : 0) +
    (showFileColumn && showCol("file") ? 1 : 0) +
    (showCol("type") ? 1 : 0) +
    (ledger && showCol("debit") ? 1 : 0) +
    (ledger && showCol("credit") ? 1 : 0) +
    (ledger && showCol("balance") ? 1 : 0) +
    (ledger ? 1 : 0);

  const colSpanBeforeDr =
    (showCol("date") ? (both ? 2 : 1) : 0) +
    (showCol("kind") ? 1 : 0) +
    (showCol("principal") ? 1 : 0) +
    (showCol("interest") ? 1 : 0) +
    (showCol("charges") ? 1 : 0) +
    (showCol("total") ? 1 : 0) +
    (showFileColumn && showCol("file") ? 1 : 0) +
    (showCol("type") ? 1 : 0);

  const renderRowActions = (row: LoanTransaction) => {
    const voucher = voucherForRow(row);
    if (!voucher || row.id === LOAN_OPENING_BALANCE_ROW_ID) {
      return <TableCell className="w-11 min-w-[44px] p-1" />;
    }
    const unapproved = rowIsUnapproved(row);
    return (
      <TableCell className="w-11 min-w-[44px] p-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-pl-txn-icon-btn="" className={cn(txnTableIconBtnCn, "h-8 w-8 shrink-0")}>
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {can("approve_transactions") && unapproved ? (
              <DropdownMenuItem onClick={() => void handleApproveVoucher(row)} className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5" />
                Approve
              </DropdownMenuItem>
            ) : null}
            {onEditVoucher ? (
              <DropdownMenuItem onClick={() => onEditVoucher(voucher)} className="flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
            ) : null}
            {can("view_voucher_history") && onHistoryVoucher ? (
              <DropdownMenuItem onClick={() => onHistoryVoucher(voucher)} className="flex items-center gap-2">
                <History className="h-3.5 w-3.5" />
                History
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    );
  };

  const formatBalance = (signed: number) => {
    if (Math.abs(signed) < 1e-6) {
      return <span className="font-bold text-green-700">Settled</span>;
    }
    const suffix = signed >= 0 ? "Dr" : "Cr";
    return (
      <span className={cn("font-bold", signed >= 0 ? "text-green-700" : "text-red-700")}>
        {formatCurrency(Math.abs(signed), { noSuffix: true, showDrCr: false, noAnimation: true, context: "transaction" })} {suffix}
      </span>
    );
  };

  const renderHeaderWithFilter = (key: string, label: string, isNumeric = false) => {
    const isFiltered = !!(filters[key] || "").trim();
    const filterValue = filters[key] || "";
    return (
      <TableHead className={cn("p-0", isNumeric && "text-right")}>
        <div
          className={cn(
            "flex items-center gap-1 whitespace-nowrap px-[10px] py-3 font-bold text-black",
            isFiltered ? "text-red-600" : "text-black",
            isNumeric ? "justify-end" : "justify-start"
          )}
        >
          <span>{label}</span>
          <Popover modal open={activeFilter === key} onOpenChange={(open) => setActiveFilter(open ? key : null)}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" data-pl-txn-icon-btn="" className={cn(txnTableIconBtnCn, "ml-1 h-6 w-6")}>
                <Filter className={cn("h-4 w-4", isFiltered && "text-red-600")} />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={6}
              className="w-48 overflow-hidden p-0"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                requestAnimationFrame(() => filterInputRefs.current[key]?.focus());
              }}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="relative">
                <Input
                  ref={(el) => {
                    filterInputRefs.current[key] = el;
                  }}
                  className={cn("border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0", filterValue && "pr-9")}
                  placeholder={`Filter ${label}...`}
                  value={filterValue}
                  onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setActiveFilter(null);
                  }}
                />
                {filterValue ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, [key]: "" }));
                      requestAnimationFrame(() => filterInputRefs.current[key]?.focus());
                    }}
                    aria-label={`Clear ${label} filter`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </TableHead>
    );
  };

  const renderFileHeaderWithFilter = () => {
    const fileFilterRaw = filters.file ?? "";
    const fileFilterMode: "all" | "with" | "without" =
      fileFilterRaw === "with" || fileFilterRaw === "without" ? fileFilterRaw : "all";
    const setFileFilter = (mode: "all" | "with" | "without") => {
      setFilters((prev) => ({ ...prev, file: mode === "all" ? "" : mode }));
    };
    const saveFileView = (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      saveFileColumnViewPrefs(fileDisplayMode, fileShowAll, fileFilterMode);
      toast.success("File view saved.");
      setFileFilterPopoverOpen(false);
      setActiveFilter(null);
    };

    return (
      <TableHead className="p-0 text-center" data-theme-header="file">
        <div className="flex items-center justify-center gap-1 whitespace-nowrap px-[10px] py-3 font-bold text-black">
          <span>File</span>
          <Popover
            modal
            open={fileFilterPopoverOpen}
            onOpenChange={(open) => {
              setFileFilterPopoverOpen(open);
              setActiveFilter(open ? "file" : null);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-pl-txn-icon-btn=""
                className={cn(txnTableIconBtnCn, "h-6 w-6")}
                aria-label="Filter by file attachment"
              >
                <CheckSquare className={cn("h-4 w-4", fileFilterMode !== "all" && "text-red-600")} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="center" onCloseAutoFocus={(e) => e.preventDefault()}>
              <div className="mb-1 flex items-center gap-2 border-b pb-2">
                <Checkbox
                  id="loan-file-filter-all"
                  checked={fileFilterMode === "all"}
                  onCheckedChange={() => setFileFilter("all")}
                />
                <label htmlFor="loan-file-filter-all" className="flex-1 cursor-pointer text-sm font-medium">
                  All
                </label>
              </div>
              <div className="flex items-center gap-2 py-1">
                <Checkbox
                  id="loan-file-filter-with"
                  checked={fileFilterMode === "with"}
                  onCheckedChange={() => setFileFilter("with")}
                />
                <label htmlFor="loan-file-filter-with" className="flex-1 cursor-pointer text-sm font-medium">
                  With file
                </label>
              </div>
              <div className="flex items-center gap-2 py-1">
                <Checkbox
                  id="loan-file-filter-without"
                  checked={fileFilterMode === "without"}
                  onCheckedChange={() => setFileFilter("without")}
                />
                <label htmlFor="loan-file-filter-without" className="flex-1 cursor-pointer text-sm font-medium">
                  Without file
                </label>
              </div>
              <div className="mt-2 border-t pt-2">
                <p className="mb-1 px-0.5 text-xs font-semibold uppercase text-muted-foreground">View</p>
                <div className="flex items-center gap-4 py-1">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Checkbox
                      id="loan-file-display-preview"
                      checked={fileDisplayMode === "preview"}
                      onCheckedChange={() => setFileDisplayMode("preview")}
                    />
                    <label htmlFor="loan-file-display-preview" className="flex-1 cursor-pointer text-sm font-medium">
                      Preview
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="loan-file-display-show-all"
                      checked={fileShowAll}
                      disabled={fileDisplayMode !== "preview"}
                      onCheckedChange={(checked) => setFileShowAll(checked === true)}
                    />
                    <label
                      htmlFor="loan-file-display-show-all"
                      className={cn(
                        "cursor-pointer whitespace-nowrap text-sm font-medium",
                        fileDisplayMode !== "preview" && "cursor-not-allowed opacity-50"
                      )}
                    >
                      Show all
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <Checkbox
                    id="loan-file-display-tick"
                    checked={fileDisplayMode === "tick"}
                    onCheckedChange={() => setFileDisplayMode("tick")}
                  />
                  <label htmlFor="loan-file-display-tick" className="flex-1 cursor-pointer text-sm font-medium">
                    Tick only
                  </label>
                </div>
                <div className="mt-2 border-t pt-2">
                  <Button type="button" size="sm" className="h-8 w-full" onClick={(e) => saveFileView(e)}>
                    Save
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </TableHead>
    );
  };

  const table = (
    <Table className="border-b-2 border-border">
      <TableHeader>
        <TableRow className="border-b-2 border-black hover:bg-transparent [&>th]:border-b-2 [&>th]:border-black">
          {showCol("date") &&
            (both ? (
              <>
                {renderHeaderWithFilter("date_bs", "Date (BS)")}
                {renderHeaderWithFilter("date_ad", "Date (AD)")}
              </>
            ) : (
              renderHeaderWithFilter("date", "Date")
            ))}
          {showCol("kind") && renderHeaderWithFilter("kind", "Kind")}
          {showCol("principal") && renderHeaderWithFilter("principal", "Principal", true)}
          {showCol("interest") && renderHeaderWithFilter("interest", "Interest", true)}
          {showCol("charges") && renderHeaderWithFilter("charges", "Charges", true)}
          {showCol("total") && renderHeaderWithFilter("total", "Total", true)}
          {showFileColumn && showCol("file") ? renderFileHeaderWithFilter() : null}
          {showCol("type") && renderHeaderWithFilter("type", "Type")}
          {ledger && showCol("debit") ? renderHeaderWithFilter("debit", "Debit", true) : null}
          {ledger && showCol("credit") ? renderHeaderWithFilter("credit", "Credit", true) : null}
          {ledger && showCol("balance") ? renderHeaderWithFilter("balance", "Balance", true) : null}
          {ledger ? <TableHead className="w-11 min-w-[44px] p-1" aria-label="Actions" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {displayRows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={Math.max(1, colSpanAll)} className="py-8 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No payments yet." : includeNotesInTable ? "No rows match the filter." : "No rows match the filter. Try enabling Note in the footer."}
            </TableCell>
          </TableRow>
        ) : (
          displayRows.map(({ row, debit, credit, signed }, i) => {
            const dates = dateParts(row.paymentDate);
            const focused = ledger && statementCheck.tableProps.statementCheckModeActive && statementCheck.focusId === row.id;
            const marked = ledger && statementCheck.markedIds?.has(row.id);
            const notes = String(row.notes || "").trim();
            const isOpeningRow = row.id === LOAN_OPENING_BALANCE_ROW_ID;
            const showNotesRow = ledger && showNarration && !!notes && !isOpeningRow;
            const rowFiles = fileUrlsForRow(row);
            const pendingApproval = ledger && rowIsUnapproved(row);
            return (
              <Fragment key={row.id}>
                <TableRow
                  data-txn-stripe={i % 2}
                  data-pl-txn-selected={focused ? "" : undefined}
                  data-pl-check-marked={marked ? "" : undefined}
                  data-pl-pending-approval={pendingApproval ? "" : undefined}
                  data-check-focus={focused ? "true" : undefined}
                  className={cn(
                    "transaction-main-row",
                    row.isReversed && "opacity-60",
                    row.kind === "note" && !isOpeningRow && "opacity-90",
                    focused && txnSelectedMainRowCn(showNotesRow)
                  )}
                  onClick={() => statementCheck.tableProps.onStatementCheckRowFocus?.({ id: row.id })}
                >
                  {showCol("date") &&
                    (both ? (
                      <>
                        <TableCell className="align-top px-[5px]">{dates.bs}</TableCell>
                        <TableCell className="align-top px-[5px]">{dates.ad}</TableCell>
                      </>
                    ) : (
                      <TableCell className="align-top px-[5px]">{dates.single}</TableCell>
                    ))}
                  {showCol("kind") && <TableCell className="px-[5px]">{rowKindLabel(row)}</TableCell>}
                  {showCol("principal") && (
                    <TableCell className="px-[5px] text-right tabular-nums">{isOpeningRow ? "—" : money(row.principalAmount)}</TableCell>
                  )}
                  {showCol("interest") && (
                    <TableCell className="px-[5px] text-right tabular-nums">{isOpeningRow ? "—" : money(row.interestAmount)}</TableCell>
                  )}
                  {showCol("charges") && (
                    <TableCell className="px-[5px] text-right tabular-nums">
                      {isOpeningRow ? "—" : money(row.chargeAmount + row.lateFeeAmount)}
                    </TableCell>
                  )}
                  {showCol("total") && (
                    <TableCell className="px-[5px] text-right tabular-nums">{isOpeningRow ? "—" : money(row.amount)}</TableCell>
                  )}
                  {showFileColumn && showCol("file") ? (
                    <TableCell className="px-[5px] align-top text-center" onClick={(e) => e.stopPropagation()}>
                      <OpeningBalanceFileCellContent
                        fileUrls={rowFiles}
                        displayMode={fileDisplayMode}
                        showAll={fileShowAll}
                      />
                    </TableCell>
                  ) : null}
                  {showCol("type") && (
                    <TableCell className="px-[5px] align-middle">
                      <Badge
                        variant="outline"
                        className={voucherTypePillClassName(
                          rowVoucherType(row) === "note" ? null : resolveTxnDrCrSide(debit, credit, signed)
                        )}
                      >
                        {rowTypeLabel(row)}
                      </Badge>
                    </TableCell>
                  )}
                  {ledger && showCol("debit") ? (
                    <TableCell className="min-w-[100px] px-[5px] text-right align-top font-semibold text-green-700 tabular-nums">
                      {moneyDash(debit)}
                    </TableCell>
                  ) : null}
                  {ledger && showCol("credit") ? (
                    <TableCell className="min-w-[100px] px-[5px] text-right align-top font-semibold text-red-700 tabular-nums">
                      {moneyDash(credit)}
                    </TableCell>
                  ) : null}
                  {ledger && showCol("balance") ? (
                    <TableCell className="min-w-[115px] px-[5px] text-right align-top tabular-nums">{formatBalance(signed)}</TableCell>
                  ) : null}
                  {ledger ? renderRowActions(row) : null}
                </TableRow>
                {showNotesRow ? (
                  <TableRow
                    className={cn("narration-row", focused && txnSelectedNarrationRowCn())}
                    data-pl-txn-selected={focused ? "" : undefined}
                    data-pl-check-marked={marked ? "" : undefined}
                  >
                    <TableCell colSpan={Math.max(1, colSpanAll)} className="px-[10px] py-1 text-xs italic text-muted-foreground">
                      {notes}
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })
        )}
      </TableBody>
      {ledger && displayRows.length > 0 ? (
        <TableFooter>
          <TableRow className="border-t-2 border-black font-semibold">
            <TableCell colSpan={Math.max(1, colSpanBeforeDr)} className="text-right">
              Total
            </TableCell>
            {showCol("debit") ? (
              <TableCell className="px-[5px] text-right font-semibold text-green-700 tabular-nums">{moneyDash(periodDr)}</TableCell>
            ) : null}
            {showCol("credit") ? (
              <TableCell className="px-[5px] text-right font-semibold text-red-700 tabular-nums">{moneyDash(periodCr)}</TableCell>
            ) : null}
            {showCol("balance") ? <TableCell className="px-[5px]">—</TableCell> : null}
            {ledger ? <TableCell className="w-11 p-1" /> : null}
          </TableRow>
          <TableRow className="border-b-2 border-t-2 border-black bg-muted/30 text-base font-bold">
            <TableCell
              colSpan={Math.max(1, colSpanBeforeDr + (showCol("debit") ? 1 : 0) + (showCol("credit") ? 1 : 0))}
              className="text-right"
            >
              Closing Balance
            </TableCell>
            {showCol("balance") ? <TableCell className="px-[5px] text-right">{formatBalance(closingSigned)}</TableCell> : null}
            {ledger ? <TableCell className="w-11 p-1" /> : null}
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );

  if (!ledger) {
    return (
      <div data-theme-table="transactions" className="min-h-0 min-w-0 flex-1 overflow-x-auto">
        {table}
      </div>
    );
  }

  return (
    <div className="pl-ledger-detail-table-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-theme-table="transactions"
        className="min-h-0 w-full min-w-full flex-1 overflow-x-auto border-b-2 border-border scrollbar-slim-dim"
      >
        {table}
      </div>
      <LedgerDesktopFooter
        left={
          <>
            <LedgerFooterCheckboxPill
              id="show-narration-loan"
              checked={showNarration}
              onCheckedChange={(checked) => {
                const next = Boolean(checked);
                setShowNarration(next);
                try {
                  sessionStorage.setItem("showNarration", String(next));
                } catch {
                  /* ignore */
                }
              }}
              label="Show Narration"
            />
            <LedgerFooterColumnsMenu>
              <DropdownMenuContent align="start" className="w-52 p-2">
                {(Object.keys(LOAN_COL_LABELS) as LoanColKey[])
                  .filter((key) => key !== "file" || showFileColumn)
                  .map((key) => (
                  <DropdownMenuItem
                    key={key}
                    onSelect={(e) => e.preventDefault()}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Checkbox
                      id={`loan-col-${key}`}
                      checked={visibleColumns[key] !== false}
                      onCheckedChange={(c) => {
                        setVisibleColumns((prev) => {
                          const next = { ...prev, [key]: Boolean(c) };
                          try {
                            sessionStorage.setItem(LOAN_COL_STORAGE, JSON.stringify(next));
                          } catch {
                            /* ignore */
                          }
                          return next;
                        });
                      }}
                    />
                    <label htmlFor={`loan-col-${key}`} className="flex-1 cursor-pointer text-sm font-medium">
                      {LOAN_COL_LABELS[key]}
                    </label>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </LedgerFooterColumnsMenu>
            <LedgerFooterCheckboxPill
              id="show-notes-loan"
              checked={includeNotesInTable}
              disabled={notesPreferenceLockedOnMobile}
              onCheckedChange={(c) => setShowNotes(Boolean(c))}
              label="Note"
            />
            <StatementCheckModeFooterControls
              idPrefix="loan"
              enabled={statementCheck.checkModeEnabled}
              onEnabledChange={statementCheck.setCheckModeEnabled}
              viewMode="statement"
              hiddenCount={statementCheck.hiddenCount}
            />
          </>
        }
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(by, order) => {
          setSortBy(by);
          setSortOrder(order);
          setCurrentPage(1);
        }}
        viewMode="statement"
        currentPage={safePage}
        totalPages={totalPages}
        setCurrentPage={setCurrentPage}
        rowsPerPageSelectValue={rowsPerPageSelectValue}
        onRowsPerPageChange={handleRowsPerPageChange}
        beforeCount={beforeCount}
        afterCount={afterCount}
        totalCount={n}
      />
    </div>
  );
});

export const LoanAccounting = forwardRef<
  LoanAccountingHandle,
  {
    rows: LoanTransaction[];
    loanAccountId: string;
    loanId: string;
    loanName: string;
    openingBalanceAttachmentUrls?: string[] | null;
    openingBalanceDate?: string;
    dateRange?: DateRange;
    unapprovedOnly?: boolean;
    onEditVoucher?: (voucher: Record<string, unknown>) => void;
    onHistoryVoucher?: (voucher: Record<string, unknown>) => void;
  }
>(function LoanAccounting(
  {
    rows,
    loanAccountId,
    loanId,
    loanName,
    openingBalanceAttachmentUrls,
    openingBalanceDate,
    dateRange,
    unapprovedOnly,
    onEditVoucher,
    onHistoryVoucher,
  },
  ref
) {
  return (
    <LoanTransactions
      ref={ref}
      rows={rows}
      ledger
      loanAccountId={loanAccountId}
      loanId={loanId}
      loanName={loanName}
      openingBalanceAttachmentUrls={openingBalanceAttachmentUrls}
      openingBalanceDate={openingBalanceDate}
      dateRange={dateRange}
      unapprovedOnly={unapprovedOnly}
      onEditVoucher={onEditVoucher}
      onHistoryVoucher={onHistoryVoucher}
    />
  );
});

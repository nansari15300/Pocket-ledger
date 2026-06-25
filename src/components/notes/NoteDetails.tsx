
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Edit,
  FilePlus,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Printer,
  ArrowLeft,
  Search,
} from "lucide-react";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { LedgerFooterChromePill } from "@/components/vouchers/ledgerFooterChrome";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
import { MobileDetailSummaryCollapsible } from "@/components/layout/MobileDetailSummaryCollapsible";
import { ReportMobileLedgerFooter } from "@/components/reports/ReportMobileLedgerFooter";

import { sortTransactionsWithFiscalMergeForCompany, sortTransactions, DEFAULT_TRANSACTION_SORT_ORDER } from "@/lib/transactionSort";
import { useDate } from "@/hooks/useDate";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { useIsMobile } from "@/hooks/use-mobile";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { ScrollArea } from "../ui/scroll-area";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { openPrintDirect } from "@/lib/printDirect";
import { useCompany } from "@/hooks/useCompany";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { cn } from "@/lib/utils";
import { mdc, mobileTxnScrollBodyClass } from "@/lib/mobileDetailChrome";
import * as XLSX from "xlsx";

export function NoteDetails({
  entity,
  transactions,
  userNames,
  onShowAll,
  isAllVouchersView,
  onBack,
  mobileFooterVariant = "ledger",
  mobileReportStickyTitle,
}: {
  entity: any;
  transactions: any[];
  userNames?: Record<string, string>;
  onShowAll?: () => void;
  isAllVouchersView?: boolean;
  onBack?: () => void;
  mobileFooterVariant?: "ledger" | "report";
  mobileReportStickyTitle?: string;
}) {
  const { formatDate, formatDateBS, dateSystem } = useDate();
  const { company } = useCompany();
  const isMobile = useIsMobile();
  const [selectedVoucher, setSelectedVoucher] = React.useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = React.useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = React.useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showTitle, setShowTitle] = useState(true);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");

  // Account / "All Vouchers" switch par purana page index mat rakho — nahi to nayi list pe galat slice dikhti hai.
  useEffect(() => {
    setCurrentPage(1);
  }, [entity?.id, entity?.type, isAllVouchersView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [mobileSearchTerm]);

  const handleEditVoucher = (voucher: any) => {
    setSelectedVoucher(voucher);
    setIsVoucherDialogOpen(true);
  };

  const currentTransactions = useMemo(() => {
    let baseTransactions = transactions;

    if (!isAllVouchersView && entity) {
      baseTransactions = transactions.filter(
        (v) => v.entityId === entity.id && v.context === entity.type
      );
    }

    if (Object.values(filters).some((v) => v)) {
      return baseTransactions.filter((t: any) => {
        return Object.entries(filters).every(([key, value]) => {
          if (!value) return true;
          const lowerCaseValue = value.toLowerCase();

          let cellValue = "";
          switch (key) {
            case "voucherNumber":
              cellValue = t.voucherNumber || "";
              break;
            case "title":
              cellValue = t.title || "";
              break;
            case "date_bs": {
              const d_bs = t.date?.toDate ? t.date.toDate() : new Date(t.date);
              cellValue = d_bs ? formatDateBS(d_bs) : "";
              break;
            }
            case "date_ad": {
              const d_ad = t.date?.toDate ? t.date.toDate() : new Date(t.date);
              cellValue = d_ad ? formatDate(d_ad) : "";
              break;
            }
            case "type":
              cellValue = t.type ? t.type.replace(/_/g, " ") : "";
              break;
            default:
              return true;
          }
          return cellValue.toLowerCase().includes(lowerCaseValue);
        });
      });
    }

    return baseTransactions;
  }, [transactions, filters, isAllVouchersView, entity, formatDate, formatDateBS]);

  const handleShowTitleChange = (checked: boolean) => {
    setShowTitle(checked);
  };

  const handlePrint = () => {
    if (!company) return;

    const title = isAllVouchersView ? "All Notes" : `Notes: ${entity.name}`;

    openPrintDirect(
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
        title: title,
        context: "note",
        contextId: entity.id,
        dateSystem: dateSystem,
        dateRangeText: "All Time",
        vouchersCount: currentTransactions.length,
        openingBalance: 0,
        transactions: currentTransactions,
        showNarration: showTitle,
        userNames: userNames,
      },
      true
    );
  };

  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(DEFAULT_TRANSACTION_SORT_ORDER);
  const sortedTransactions = useMemo(
    () => sortTransactionsWithFiscalMergeForCompany(currentTransactions, "date", DEFAULT_TRANSACTION_SORT_ORDER, undefined, company),
    [currentTransactions, company]
  );

  const searchFilteredTransactions = useMemo(() => {
    if (!mobileSearchTerm.trim()) return sortedTransactions;
    const q = mobileSearchTerm.toLowerCase();
    return sortedTransactions.filter((t: any) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      return (
        String(t.voucherNumber || "")
          .toLowerCase()
          .includes(q) ||
        String(t.title || "")
          .toLowerCase()
          .includes(q) ||
        String(t.narration || "")
          .toLowerCase()
          .includes(q) ||
        formatDate(d).toLowerCase().includes(q) ||
        formatDateBS(d).toLowerCase().includes(q)
      );
    });
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS]);

  // All Notes: page 1 = latest batch (party tail jaisa); single account = page 1 = oldest (head).
  const useTailPaging = Boolean(isAllVouchersView);

  const notePagingWindow = useMemo(() => {
    const list = searchFilteredTransactions;
    const total = list.length;
    const totalPagesLocal = rowsPerPage > 0 ? Math.max(1, Math.ceil(total / rowsPerPage)) : 1;
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    if (rowsPerPage <= 0) {
      return { totalPages: 1, pageTransactions: sortTransactions(list, sortBy, sortOrder), before: 0, after: 0 };
    }
    if (useTailPaging) {
      const end = total - (safePage - 1) * rowsPerPage;
      const start = Math.max(0, end - rowsPerPage);
      const pageSlice = list.slice(start, end);
      return {
        totalPages: totalPagesLocal,
        pageTransactions: sortTransactions(pageSlice, sortBy, sortOrder),
        before: start,
        after: Math.max(0, total - end),
      };
    }
    const start = (safePage - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, total);
    const pageSlice = list.slice(start, end);
    return {
      totalPages: totalPagesLocal,
      pageTransactions: sortTransactions(pageSlice, sortBy, sortOrder),
      before: start,
      after: Math.max(0, total - end),
    };
  }, [searchFilteredTransactions, currentPage, rowsPerPage, useTailPaging, sortBy, sortOrder]);

  const totalPages = notePagingWindow.totalPages;
  const paginatedTransactions = notePagingWindow.pageTransactions;
  const mobilePagerEdgeCounts = { before: notePagingWindow.before, after: notePagingWindow.after };
  const noteBeforeCount = notePagingWindow.before;
  const noteAfterCount = notePagingWindow.after;

  // List size / page-size change par page valid range me rakho (tail: 1 = latest).
  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  const reportStickyTitle = mobileReportStickyTitle ?? "Notes";
  const reportHeaderTitleOnly = isAllVouchersView || entity?.id === "all";

  const handleExcelLedger = useCallback(() => {
    const rows = searchFilteredTransactions.map((t: Record<string, unknown>) => {
      const dRaw = (t as { date?: { toDate?: () => Date } }).date;
      const d = dRaw?.toDate ? dRaw.toDate() : new Date((t as { date?: unknown }).date as string | number | Date);
      return {
        "Date (BS)": formatDateBS(d),
        "Date (AD)": formatDate(d),
        "Voucher No.": (t as { voucherNumber?: string }).voucherNumber,
        Title: String((t as { title?: string }).title || ""),
        Narration: String((t as { narration?: string }).narration || ""),
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Notes");
    const safeName = (isAllVouchersView ? "All_Notes" : entity?.name || "notes").replace(/[/\\?%*:|"<>]/g, "-");
    XLSX.writeFile(workbook, `${safeName}.xlsx`);
  }, [searchFilteredTransactions, formatDate, formatDateBS, isAllVouchersView, entity?.name]);

  if (isMobile) {
    const isReportMobileChrome = mobileFooterVariant === "report";

    return (
      <>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
          {onBack ? (
            <header className="sticky top-0 z-10 flex-shrink-0 border-b bg-white p-3 dark:bg-card">
              <div className="flex min-w-0 items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onBack} aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {reportHeaderTitleOnly ? (
                  <h1 className="min-w-0 flex-1 text-base font-bold text-muted-foreground">
                    {isReportMobileChrome ? reportStickyTitle : entity.name}
                  </h1>
                ) : (
                  <h1 className="min-w-0 flex-1 truncate text-base font-bold text-muted-foreground">{entity.name}</h1>
                )}
              </div>
            </header>
          ) : (
            <div className="flex-shrink-0 border-b px-3 py-2">
              <h1 className="text-base font-bold text-muted-foreground">{entity.name}</h1>
            </div>
          )}
          <MobileDetailSummaryCollapsible>
            <div className="flex flex-shrink-0 items-center justify-center gap-1 border-b px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground">
                {searchFilteredTransactions.length} note(s) · All Time
              </span>
            </div>
            <div className="flex-shrink-0 border-b p-2 space-y-2">
              <div className="flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1 h-9">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
                  <Input
                    placeholder="Search notes"
                    className="h-9 w-full pl-8 text-sm"
                    value={mobileSearchTerm}
                    onChange={(e) => setMobileSearchTerm(e.target.value)}
                  />
                </div>
                {onShowAll ? (
                  <Button
                    variant={isAllVouchersView ? "default" : "outline"}
                    size="sm"
                    className="h-9 shrink-0 text-xs"
                    onClick={onShowAll}
                  >
                    All Vouchers
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-title-note-mobile"
                  checked={showTitle}
                  onCheckedChange={(checked) => handleShowTitleChange(Boolean(checked))}
                />
                <label htmlFor="show-title-note-mobile" className="text-xs font-medium leading-none">
                  Show Title
                </label>
              </div>
            </div>
          </MobileDetailSummaryCollapsible>
          <div
            className={mobileTxnScrollBodyClass(isReportMobileChrome)}
            style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            <div className="pb-2 px-0.5">
              {paginatedTransactions.length > 0 ? (
                <TransactionsTable
                  transactions={paginatedTransactions}
                  context="note"
                  userNames={userNames}
                  onRowClick={handleEditVoucher}
                  filters={filters}
                  setFilters={setFilters}
                  activeFilter={activeFilter}
                  setActiveFilter={setActiveFilter}
                  showNarration={showTitle}
                  scrollOnlyTransactions
                  transactionCardSearchHighlight={mobileSearchTerm}
                />
              ) : (
                <div className="py-16 text-center text-sm text-muted-foreground">No notes found.</div>
              )}
            </div>
          </div>
          {isReportMobileChrome ? (
            <MobileTransactionsPager
              className={mdc.reportTxnPagerOutside}
              currentPage={currentPage}
              totalItems={searchFilteredTransactions.length}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(nextRows) => {
                setRowsPerPage(nextRows);
                setCurrentPage(1);
              }}
              onPageChange={setCurrentPage}
              edgeCounts={rowsPerPage > 0 ? mobilePagerEdgeCounts : undefined}
              pagingMode={useTailPaging ? "newest-first" : "oldest-first"}
            />
          ) : null}
          {!isReportMobileChrome ? (
            <MobileTransactionsPager
              className={mdc.ledgerTxnPagerOutside}
              currentPage={currentPage}
              totalItems={searchFilteredTransactions.length}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(nextRows) => {
                setRowsPerPage(nextRows);
                setCurrentPage(1);
              }}
              onPageChange={setCurrentPage}
              edgeCounts={rowsPerPage > 0 ? mobilePagerEdgeCounts : undefined}
              pagingMode={useTailPaging ? "newest-first" : "oldest-first"}
            />
          ) : null}
        </div>
        {isReportMobileChrome ? (
          <ReportMobileLedgerFooter
            onPrint={handlePrint}
            onExcel={handleExcelLedger}
            onDateOpen={() => setIsNoteDialogOpen(true)}
            showBillWise={false}
            showChart={false}
          />
        ) : (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around gap-1 border-t bg-background/95 p-1.5 backdrop-blur">
            <Button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md bg-green-600 py-1 text-xs text-white hover:bg-green-700"
              onClick={handlePrint}
            >
              <Printer className="mb-0 h-4 w-4" />
              <span className="text-[10px] leading-tight">Print</span>
            </Button>
            <Button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-md bg-blue-600 py-1 text-xs text-white hover:bg-blue-700"
              onClick={() => setIsNoteDialogOpen(true)}
            >
              <FilePlus className="mb-0 h-4 w-4" />
              <span className="text-[10px] leading-tight">Add Note</span>
            </Button>
          </div>
        )}
        <AddVoucherDialog
          isOpen={isVoucherDialogOpen}
          onOpenChange={setIsVoucherDialogOpen}
          voucher={selectedVoucher}
          onVoucherCreated={() => setSelectedVoucher(null)}
        />
        <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Note</DialogTitle>
              <DialogDescription>
                Create a new note for {entity.id === "all" ? "any entity" : entity.name}.
              </DialogDescription>
            </DialogHeader>
            <CreateNoteForm
              initialEntityId={entity.id === "all" ? undefined : entity.id}
              initialContext={entity.id === "all" ? undefined : entity.type}
              onVoucherAction={() => {
                setIsNoteDialogOpen(false);
              }}
              compactFooter
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{entity.name}</CardTitle>
              {entity.id !== "all" && <CardDescription>Notes related to this entity.</CardDescription>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsNoteDialogOpen(true)}>
                <FilePlus className="mr-2 h-4 w-4" /> Add Note
              </Button>
              {onShowAll && (
                <Button
                  variant={isAllVouchersView ? "default" : "outline"}
                  size="sm"
                  onClick={onShowAll}
                  className={isAllVouchersView ? "bg-primary text-primary-foreground" : ""}
                >
                  All Vouchers
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 flex flex-col min-h-0">
          <ScrollArea className="flex-1">
            <div className="p-4">
              <TransactionsTable
                transactions={paginatedTransactions}
                context="note"
                userNames={userNames}
                onRowClick={handleEditVoucher}
                filters={filters}
                setFilters={setFilters}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                showNarration={showTitle}
              />
              {transactions.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">No notes found for this entity.</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="flex items-center justify-end space-x-2 py-2 px-4 border-t">
          <div className="flex-1 text-sm text-muted-foreground flex items-center gap-4">
            <span>{currentTransactions.length} note(s).</span>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-title-note"
                checked={showTitle}
                onCheckedChange={(checked) => handleShowTitleChange(Boolean(checked))}
              />
              <label htmlFor="show-title-note" className="text-sm font-medium leading-none">
                Show Title
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TransactionTableSortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(by, order) => {
                setSortBy(by);
                setSortOrder(order);
              }}
              viewMode="statement"
            />
            <p className="text-sm font-medium tabular-nums">({noteBeforeCount})</p>
            <div className="flex items-center space-x-1">
              <Button
                type="button"
                variant="chromePill"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="chromePill"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <LedgerFooterChromePill className="px-1">
                <Select
                  value={`${rowsPerPage}`}
                  onValueChange={(value) => {
                    setRowsPerPage(Number(value) || 0);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-[64px] border-0 bg-transparent shadow-none focus:ring-0">
                    <SelectValue placeholder={`${rowsPerPage}`} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10, 20, 30, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                    <SelectItem value="0">All</SelectItem>
                  </SelectContent>
                </Select>
              </LedgerFooterChromePill>
              <Button
                type="button"
                variant="chromePill"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="chromePill"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm font-medium tabular-nums">({noteAfterCount})</p>
            <p className="text-sm font-medium tabular-nums whitespace-nowrap">
              Page {currentPage} of {totalPages} · Total Trxn {searchFilteredTransactions.length}
            </p>
          </div>
        </div>
      </Card>
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={setIsVoucherDialogOpen}
        voucher={selectedVoucher}
        onVoucherCreated={() => setSelectedVoucher(null)}
      />
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Create a new note for {entity.id === "all" ? "any entity" : entity.name}.
            </DialogDescription>
          </DialogHeader>
          <CreateNoteForm
            initialEntityId={entity.id === "all" ? undefined : entity.id}
            initialContext={entity.id === "all" ? undefined : entity.type}
            onVoucherAction={() => {
              setIsNoteDialogOpen(false);
            }}
            compactFooter
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

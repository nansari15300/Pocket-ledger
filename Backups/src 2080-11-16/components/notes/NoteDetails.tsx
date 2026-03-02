
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Edit, FilePlus, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Filter, XCircle, Printer } from "lucide-react";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { openPrintDirect } from "@/lib/printDirect";
import { useCompany } from "@/hooks/useCompany";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";

export function NoteDetails({ 
  entity,
  transactions,
  userNames,
  onShowAll,
  isAllVouchersView,
}: { 
  entity: any;
  transactions: any[];
  userNames?: Record<string, string>;
  onShowAll?: () => void;
  isAllVouchersView?: boolean;
}) {
  const { formatDate, formatDateBS, dateSystem } = useDate();
  const { company } = useCompany();
  const [selectedVoucher, setSelectedVoucher] = React.useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = React.useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = React.useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showTitle, setShowTitle] = useState(true);

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
            case "date_bs":
               const d_bs = t.date?.toDate ? t.date.toDate() : new Date(t.date);
               cellValue = d_bs ? formatDateBS(d_bs) : "";
              break;
            case "date_ad":
               const d_ad = t.date?.toDate ? t.date.toDate() : new Date(t.date);
               cellValue = d_ad ? formatDate(d_ad) : "";
              break;
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
    
    const title = isAllVouchersView ? 'All Notes' : `Notes: ${entity.name}`;
    
    openPrintDirect({
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
    }, true);
  };

  const totalPages = rowsPerPage > 0 ? Math.ceil(currentTransactions.length / rowsPerPage) : 1;
  const paginatedTransactions = rowsPerPage > 0
    ? currentTransactions.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
      )
    : currentTransactions;
  
  return (
    <>
    <Card className="h-full flex flex-col">
        <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle>{entity.name}</CardTitle>
                    {entity.id !== 'all' && <CardDescription>Notes related to this entity.</CardDescription>}
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
                <div className="text-center py-16 text-muted-foreground">
                    No notes found for this entity.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="flex items-center justify-end space-x-2 py-2 px-4 border-t">
          <div className="flex-1 text-sm text-muted-foreground flex items-center gap-4">
            <span>{currentTransactions.length} note(s).</span>
             <div className="flex items-center space-x-2">
              <Checkbox id="show-title-note" checked={showTitle} onCheckedChange={(checked) => handleShowTitleChange(Boolean(checked))} />
              <label htmlFor="show-title-note" className="text-sm font-medium leading-none">Show Title</label>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
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
          </div>
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
    </Card>
     <AddVoucherDialog isOpen={isVoucherDialogOpen} onOpenChange={setIsVoucherDialogOpen} voucher={selectedVoucher} onVoucherCreated={() => setSelectedVoucher(null)} />
     <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Add Note</DialogTitle>
                <DialogDescription>
                    Create a new note for {entity.id === 'all' ? 'any entity' : entity.name}.
                </DialogDescription>
            </DialogHeader>
            <CreateNoteForm
                initialEntityId={entity.id === 'all' ? undefined : entity.id}
                initialContext={entity.id === 'all' ? undefined : entity.type}
                onVoucherAction={() => {
                    setIsNoteDialogOpen(false);
                }}
            />
        </DialogContent>
    </Dialog>
    </>
  );
}

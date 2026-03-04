"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { Combobox } from "@/components/ui/combobox";
import { ArrowLeft, Calendar as CalendarIcon, File as FileIcon, Printer, Share2, BarChart2, X } from "lucide-react";
import type { Item, ItemGroup } from "@/components/items/types";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useTransactions } from "@/hooks/use-transactions";
import { useCompany } from "@/hooks/useCompany";
import { openPrintDirect, getPdfBlob, type Context } from "@/lib/printDirect";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import type { BSDate } from "@/lib/bs-date";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import * as XLSX from "xlsx";
import { RunningBalanceFullChart } from "@/components/reports/RunningBalanceFullChart";
import { getConversionFactor, formatQuantity } from "@/components/vouchers/transactionTableShared";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";


const ReportSummaryCard = React.memo(function ReportSummaryCard({
  title,
  amount,
  color,
  customFormatted,
}: {
  title: string;
  amount: number;
  color: string;
  customFormatted?: string;
}) {
  const { formatCurrency, formatCurrencyForPrint } = useDate();
  const formatted = customFormatted ?? formatCurrency(amount, { showDrCr: title === "Balance" });
  const titleStr = customFormatted ?? formatCurrencyForPrint(amount, { showDrCr: title === "Balance" });
  return (
    <div className="px-2 py-1.5 h-10 min-h-10 flex items-center justify-center w-fit flex-shrink-0 border rounded-lg overflow-hidden bg-card">
      <div className="flex flex-col">
        <p className="text-xs text-muted-foreground whitespace-nowrap">{title}</p>
        <p className={cn("text-sm sm:text-base font-bold whitespace-nowrap tabular-nums", color)} title={titleStr}>
          {formatted}
        </p>
      </div>
    </div>
  );
}, (prev, next) => prev.title === next.title && prev.amount === next.amount && prev.color === next.color && prev.customFormatted === next.customFormatted);

export default function DesktopItemStatementPage() {
  const { processedItems, processedItemGroups, vouchers, loading, journalAccountNames } = useVouchers();
  const { company } = useCompany();
  const { formatDateBS, formatDate, formatCurrency, dateSystem } = useDate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
              <NepaliCalendar onSelect={handleNepaliSelect} valueAD={dateRange} isRange={true} numberOfMonths={calendarMonths} />

            )}
            {(dateSystem === "AD" || dateSystem === "Both") && (
              <div className="flex-1">
                <Calendar
                  className="p-0 w-full"
                  classNames={{ table: "w-full" }}
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={asCalendarRange(dateRange)}

                  onSelect={(range) => {
                    setDateRange(range as DateRange | undefined);
                    if (range?.from && range.to) setIsCalendarOpen(false);
                  }}
                  numberOfMonths={calendarMonths}

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

      {/* Mobile: no pb-20 so scroll extends to footer; inner pb-24 so last row clears fixed footer */}
      <main className={cn("flex-1 flex flex-col min-h-0 px-4 pt-0.5", !isMobile && "pb-20")}>

        {view === "chart" ? (
          <div className="-mx-4 w-[calc(100%+2rem)] max-w-none flex-shrink-0">
            <RunningBalanceFullChart transactions={reportDisplayTransactions} openingBalance={openingBalanceForPeriod} />
          </div>
        ) : (
          <>
            <div className="flex flex-nowrap gap-2 pt-0.5 pb-3 overflow-x-auto scrollbar-slim-dim flex-shrink-0 items-center">
              {summaryCards.map((card) => {
                const convFactor = selectedItem && reportStockView === "qty" ? getConversionFactor(selectedItem, effectiveDisplayUnit) : 1;
                let customFormatted: string | undefined;
                if (selectedItem && reportStockView === "qty" && effectiveDisplayUnit) {
                  if (card.title === "Balance") {
                    customFormatted = `${formatQuantity(Math.abs(card.amount) / convFactor)} ${effectiveDisplayUnit}`;
                  } else if (card.title === "Sales" || card.title === "Purchases") {
                    const qtyInUnit = (card as { qty?: number }).qty != null ? (card as { qty: number }).qty / convFactor : card.amount / convFactor;
                    customFormatted = `${formatQuantity(Math.abs(qtyInUnit))} ${effectiveDisplayUnit}`;
                  }
                }
                return (
                  <React.Fragment key={card.title}>
                    <ReportSummaryCard title={card.title} amount={card.amount} color={card.color} customFormatted={customFormatted} />
                    {card.title === "Balance" && selectedItem && unitOptions.length > 0 && (
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={reportStockView === "amount" ? "amount" : effectiveDisplayUnit}
                          onValueChange={(v) => {
                            if (v === "amount") {
                              setReportStockView("amount");
                            } else {
                              setReportStockView("qty");
                              setReportDisplayUnit(v);
                            }
                          }}
                        >
                          <SelectTrigger className="h-10 min-w-[80px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amount">Amounts</SelectItem>
                            {unitOptions.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-0.5 -mx-4 md:mx-0 md:px-0" data-floating-button-scroll>
              {isMobile ? (
                <div className="pb-24">
                  <TransactionsTable
                    transactions={filteredReportTransactions}
                    context={activeContext}
                    contextId={activeEntity?.id}
                    openingBalance={openingBalanceForPeriod}
                    userNames={userNames}
                    journalAccountNames={journalAccountNames}
                    accountNames={{}}
                    stockView={selectedItem ? reportStockView : "amount"}
                    displayUnit={selectedItem && reportStockView === "qty" ? effectiveDisplayUnit : undefined}
                    item={selectedItem || undefined}
                    onRowClick={handleEditVoucher}
                    openingBalanceLabel="Opening"
                    openingBalanceSearch={
                      <Input
                        placeholder="Search..."
                        value={transactionSearch}
                        onChange={(e) => setTransactionSearch(e.target.value)}
                        className="h-9 w-32 max-w-[140px] text-sm"
                      />
                    }
                  />
                </div>
              ) : (
                <TransactionsTable
                  transactions={filteredReportTransactions}
                  context={activeContext}
                  contextId={activeEntity?.id}
                  openingBalance={openingBalanceForPeriod}
                  userNames={userNames}
                  journalAccountNames={journalAccountNames}
                  accountNames={{}}
                  stockView={selectedItem ? reportStockView : "amount"}
                  displayUnit={selectedItem && reportStockView === "qty" ? effectiveDisplayUnit : undefined}
                  item={selectedItem || undefined}
                  onRowClick={handleEditVoucher}
                  openingBalanceLabel="Opening"
                  openingBalanceSearch={
                    <Input
                      placeholder="Search..."
                      value={transactionSearch}
                      onChange={(e) => setTransactionSearch(e.target.value)}
                      className="h-9 w-32 max-w-[140px] text-sm"
                    />
                  }
                />
              )}

            </div>
          </>
        )}
      </main>

      <footer className="flex items-stretch justify-around p-1.5 border-t bg-white gap-1 fixed bottom-0 left-0 right-0">
        <PermissionButton permission="export_data" className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-green-500 hover:bg-green-600 text-white rounded-md" onClick={handlePrint}>
          <Printer className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Print</span>
        </PermissionButton>
        <PermissionButton permission="export_data" className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md" onClick={handleExcel}>
          <FileIcon className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Excel</span>
        </PermissionButton>
        <Button className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md" onClick={handleShare}>
          <Share2 className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Share</span>
        </Button>
        <Button
          className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-slate-500 hover:bg-slate-600 text-white rounded-md"
          onClick={() => {
            openingModalRef.current = true;
            openModalInUrl();
            setIsCalendarOpen(true);
          }}
        >
          <CalendarIcon className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Date</span>
        </Button>
        <Button className="flex-1 flex flex-col items-center justify-center py-1 min-w-0 bg-violet-500 hover:bg-violet-600 text-white rounded-md" onClick={() => setView((v) => (v === "list" ? "chart" : "list"))}>
          <BarChart2 className="w-4 h-4 mb-0" /> <span className="text-[10px] leading-tight">Chart</span>
        </Button>
      </footer>

      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setIsVoucherDialogOpen(false);
            setSelectedVoucher(null);
            closeModalInUrl();
          }
        }}
        voucher={selectedVoucher}
        onVoucherAction={() => setSelectedVoucher(null)}
      />
    </div>
  );
}


"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { Combobox } from "@/components/ui/combobox";
import { ArrowLeft, Calendar as CalendarIcon, File, Printer, Share2, Layers, BarChart2 } from "lucide-react";
import type { DateRange } from "@/components/ui/ad-calendar";

import { startOfMonth, endOfMonth, isSameDay, startOfDay } from "date-fns";
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
  DrawerTrigger,
  DrawerDescription,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import * as XLSX from 'xlsx';
import { RunningBalanceFullChart } from "@/components/reports/RunningBalanceFullChart";
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from "@/lib/firebase";
import AdCalendar from "@/components/ui/ad-calendar";
import { toast } from "sonner";
import type { Account } from "@/components/bank-cash/types";
import { useCalendarMonths } from "@/hooks/use-mobile";


export default function ContraReportPage() {
    const { vouchers, loading, processedAccounts } = useVouchers();
    const { company, companyId } = useCompany();
    const { formatDateBS, formatDate, formatCurrency, dateSystem } = useDate();
                              numberOfMonths={calendarMonths}
                              />
                          )}
                          {(dateSystem === 'AD' || dateSystem === 'Both') && (
                          <div className="flex-1 w-full min-w-0">
                              <AdCalendar
                              valueAD={dateRange}
                              isRange
                              numberOfMonths={calendarMonths}
                              transactionDates={[]}
                              onSelect={(adDate) => {
                                  const range = dateRange;
                                  if (!range?.from || (range.from && range.to)) {
                                      setDateRange({ from: adDate, to: undefined });
                                  } else if (adDate < range.from) {
                                      setDateRange({ from: adDate, to: range.from });
                                      setIsCalendarOpen(false);
                                  } else {
                                      setDateRange({ from: range.from, to: adDate });
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
                 <Button className="flex-1 flex flex-col h-auto bg-green-500 hover:bg-green-600 text-white" variant="outline" onClick={(e) => { e.stopPropagation(); setView(v => v === 'list' ? 'chart' : 'list')}}>
                  {view === 'list' ? <BarChart2 className="w-5 h-5 mb-1" /> : <Layers className="w-5 h-5 mb-1" />}
                  <span className="text-xs">{view === 'list' ? 'Chart' : 'List'}</span>
                </Button>
            </footer>
        </div>
    );
}

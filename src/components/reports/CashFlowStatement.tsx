"use client";

import React, { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableCaption,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Search, Loader2, Printer, CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useVouchers } from "@/hooks/useVouchers";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { openPrintDirect } from "@/lib/printDirect";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { useTransactions } from "@/hooks/use-transactions";
import { cn } from "@/lib/utils";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";

import { format, startOfDay, endOfDay } from "date-fns";
import BsDatePicker from "@/components/ui/BsDatePicker";

type CashFlowRow = {
  id: string;
  particulars: string;
  group: "Operating" | "Investing" | "Financing";
  inflow: number;
  outflow: number;
  transactions?: any[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const toNepaliCurrency = (n: number) =>
  n === 0
    ? "-"
    : new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

export function CashFlowStatementPage() {
  const isMobile = useIsMobile();
                      selected={asCalendarRange(dateRange)}

                      onSelect={(range) => {
                        if (range) {
                          const normalizedRange: DateRange = {
                            from: range.from ? startOfDay(range.from) : undefined,
                            to: range.to ? endOfDay(range.to) : undefined,
                          };
                          setDateRange(normalizedRange);
                          setIsCalendarOpen(false);
                        } else {
                          setDateRange(undefined);
                          setIsCalendarOpen(false);
                        }
                      }}
                      numberOfMonths={calendarMonths}

                    />
                  </PopoverContent>
                </Popover>
              )}
              {dateRange && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateRange(undefined)}
                  className="flex-shrink-0"
                >
                  Clear
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={handlePrintDetail} className="gap-2" disabled={!activeRow}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" onClick={closeDrawer}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

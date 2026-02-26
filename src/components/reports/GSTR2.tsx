"use client";

import { useVouchers } from "@/hooks/useVouchers";
import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { DateRange } from "react-day-picker";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "../ui/BsDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Printer } from "lucide-react";
import { Calendar } from "../ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

export function GSTR2Report() {
  const { vouchers, loading, processedParties } = useVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const { dateSystem, formatCurrency, formatDate, formatDateBS } = useDate();

  const gstr2Data = useMemo(() => {
    let filtered = vouchers.filter(v => v.type === 'purchase');
    
    if (dateRange?.from) {
      const from = dateRange.from;
      const to = dateRange.to || from;
      filtered = filtered.filter(v => {
        const vDate = v.date?.toDate ? v.date.toDate() : new Date(v.date);
        return vDate >= from && vDate <= to;
      });
    }

    return filtered.map(v => {
      const party = processedParties.find(p => p.id === v.partyId);
      const taxableAmount = Number(v.subTotal || v.total || 0);
      const taxAmount = Number(v.taxAmount || 0);
      const totalAmount = taxableAmount + taxAmount;
      
      return {
        date: v.date,
        voucherNumber: v.voucherNumber || v.id,
        partyName: party?.name || "N/A",
        partyGSTIN: party?.pan || "N/A",
        taxableAmount,
        taxAmount,
        totalAmount,
        type: v.type,
      };
    });
  }, [vouchers, dateRange, processedParties]);

  const totals = useMemo(() => {
    return gstr2Data.reduce(
      (acc, row) => ({
        taxableAmount: acc.taxableAmount + row.taxableAmount,
        taxAmount: acc.taxAmount + row.taxAmount,
        totalAmount: acc.totalAmount + row.totalAmount,
      }),
      { taxableAmount: 0, taxAmount: 0, totalAmount: 0 }
    );
  }, [gstr2Data]);

  const displayDate = (date: any) => {
    if (!date) return "N/A";
    const d = date?.toDate ? date.toDate() : new Date(date);
    return dateSystem === 'AD' ? formatDate(d) : formatDateBS(d);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-4 h-full flex flex-col overflow-hidden">
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="flex-shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>GSTR-2</CardTitle>
              <CardDescription>Summary of all inward supplies (purchases).</CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 pt-4">
            {(dateSystem === 'BS' || dateSystem === 'Both') && (
              <BsDatePicker valueAD={dateRange} onChangeAD={(range) => setDateRange(range as DateRange)} />
            )}
            {(dateSystem === 'AD' || dateSystem === 'Both') && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn("w-auto justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
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
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          <ScrollArea className="flex-1">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher No.</TableHead>
                  <TableHead>Party Name</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Taxable Amount</TableHead>
                  <TableHead className="text-right">Tax Amount</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gstr2Data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{displayDate(row.date)}</TableCell>
                    <TableCell>{row.voucherNumber}</TableCell>
                    <TableCell>{row.partyName}</TableCell>
                    <TableCell>{row.partyGSTIN}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.taxableAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.taxAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.totalAmount)}</TableCell>
                  </TableRow>
                ))}
                {gstr2Data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No purchase transactions found for the selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          {gstr2Data.length > 0 && (
            <div className="border-t p-4 flex-shrink-0">
              <Table>
                <TableBody>
                  <TableRow className="font-bold">
                    <TableCell colSpan={4}>TOTAL</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.taxableAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.taxAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.totalAmount)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

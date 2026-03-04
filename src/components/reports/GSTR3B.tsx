"use client";

import { useVouchers } from "@/hooks/useVouchers";
import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
<<<<<<< HEAD
import { DateRange } from "react-day-picker";
import { useDate } from "@/hooks/useDate";
=======
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { useCalendarMonths } from "@/hooks/use-mobile";
>>>>>>> 6a1ec26 (Animation Fixed)
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

export function GSTR3BReport() {
  const { vouchers, loading, processedParties } = useVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const { dateSystem, formatCurrency, formatDate, formatDateBS } = useDate();
<<<<<<< HEAD
=======
  const calendarMonths = useCalendarMonths();
>>>>>>> 6a1ec26 (Animation Fixed)

  const gstr3bData = useMemo(() => {
    let filtered = vouchers.filter(v => ['sale', 'purchase'].includes(v.type));
    
    if (dateRange?.from) {
      const from = dateRange.from;
      const to = dateRange.to || from;
      filtered = filtered.filter(v => {
        const vDate = v.date?.toDate ? v.date.toDate() : new Date(v.date);
        return vDate >= from && vDate <= to;
      });
    }

    const sales = filtered.filter(v => v.type === 'sale');
    const purchases = filtered.filter(v => v.type === 'purchase');

    const salesTotal = sales.reduce((sum, v) => sum + Number(v.subTotal || v.total || 0), 0);
    const salesTax = sales.reduce((sum, v) => sum + Number(v.taxAmount || 0), 0);
    const purchaseTotal = purchases.reduce((sum, v) => sum + Number(v.subTotal || v.total || 0), 0);
    const purchaseTax = purchases.reduce((sum, v) => sum + Number(v.taxAmount || 0), 0);
    const netTax = salesTax - purchaseTax;

    return {
      sales: {
        count: sales.length,
        taxableAmount: salesTotal,
        taxAmount: salesTax,
        totalAmount: salesTotal + salesTax,
      },
      purchases: {
        count: purchases.length,
        taxableAmount: purchaseTotal,
        taxAmount: purchaseTax,
        totalAmount: purchaseTotal + purchaseTax,
      },
      netTax,
    };
  }, [vouchers, dateRange]);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-4 h-full flex flex-col overflow-hidden">
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="flex-shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>GSTR-3B</CardTitle>
              <CardDescription>Monthly summary return of sales and purchases.</CardDescription>
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
<<<<<<< HEAD
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
=======
                    selected={asCalendarRange(dateRange)}
                    onSelect={setDateRange}
                    numberOfMonths={calendarMonths}
>>>>>>> 6a1ec26 (Animation Fixed)
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
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Taxable Amount</TableHead>
                  <TableHead className="text-right">Tax Amount</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-semibold">Outward Supplies (Sales)</TableCell>
                  <TableCell className="text-right">{gstr3bData.sales.count}</TableCell>
                  <TableCell className="text-right">{formatCurrency(gstr3bData.sales.taxableAmount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(gstr3bData.sales.taxAmount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(gstr3bData.sales.totalAmount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Inward Supplies (Purchases)</TableCell>
                  <TableCell className="text-right">{gstr3bData.purchases.count}</TableCell>
                  <TableCell className="text-right">{formatCurrency(gstr3bData.purchases.taxableAmount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(gstr3bData.purchases.taxAmount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(gstr3bData.purchases.totalAmount)}</TableCell>
                </TableRow>
                <TableRow className="bg-muted font-bold">
                  <TableCell>Net Tax Payable</TableCell>
                  <TableCell colSpan={3}></TableCell>
                  <TableCell className="text-right">{formatCurrency(gstr3bData.netTax)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

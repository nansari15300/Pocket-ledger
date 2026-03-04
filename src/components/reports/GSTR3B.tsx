"use client";

import { useVouchers } from "@/hooks/useVouchers";
import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { useCalendarMonths } from "@/hooks/use-mobile";

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
                    selected={asCalendarRange(dateRange)}
                    onSelect={setDateRange}
                    numberOfMonths={calendarMonths}

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

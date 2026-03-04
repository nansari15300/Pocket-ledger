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

export function GSTR2Report() {
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

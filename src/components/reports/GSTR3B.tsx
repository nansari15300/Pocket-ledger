"use client";

import { useFyScopedVouchers } from "@/hooks/useFyScopedVouchers";
import { useCallback, useMemo, useState } from "react";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useCalendarMonths } from "@/hooks/use-mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  collectGstrInvoiceTaxAccountIds,
  formatGstrDrCrAmount,
  gstrTaxPaymentAmount,
  gstrVoucherInDateRange,
  isGstrTaxAccountPayment,
  resolveGstrSalePurchaseAmounts,
  resolveGstrVoucherDateSpan,
} from "@/lib/reports/gstrVoucherAmounts";
import { openGstr3bPrint } from "@/lib/reports/gstrReportPrint";
import { GstrDateRangeControls, GstrReportShell, GstrReportTableScroll, GSTR_TABLE_CLASS, GSTR_AMOUNT_DR_CN, GSTR_AMOUNT_CR_CN, gstrAmountClass, gstrFormatCurrency, GstrSelectableTableRow, useGstrReportDateRange } from "@/components/reports/GstrReportShell";
import { cn } from "@/lib/utils";

export function GSTR3BReport() {
  const { company } = useCompany();
  const { vouchers } = useFyScopedVouchers();
  const { dateRange, setDateRange, clearDateRange } = useGstrReportDateRange();
  const { dateSystem, formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS } = useDate();
  const calendarMonths = useCalendarMonths();
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const showDrCr = company?.showDrCr ?? true;
  const money = (amount: number, side: "dr" | "cr") => gstrFormatCurrency(formatCurrency, amount, side, showDrCr);

  const gstVouchers = useMemo(
    () => vouchers.filter((v) => v.type === "sale" || v.type === "purchase"),
    [vouchers]
  );
  const invoiceTaxAccountIds = useMemo(() => collectGstrInvoiceTaxAccountIds(vouchers), [vouchers]);
  const taxSettlementVouchers = useMemo(
    () => vouchers.filter((v) => isGstrTaxAccountPayment(v, invoiceTaxAccountIds)),
    [vouchers, invoiceTaxAccountIds]
  );
  const allTimeRange = useMemo(
    () => resolveGstrVoucherDateSpan([...gstVouchers, ...taxSettlementVouchers]),
    [gstVouchers, taxSettlementVouchers]
  );

  const gstr3bData = useMemo(() => {
    const filtered = gstVouchers.filter((v) => gstrVoucherInDateRange(v, dateRange));
    const taxPayments = taxSettlementVouchers.filter((v) => gstrVoucherInDateRange(v, dateRange));

    const sales = filtered.filter((v) => v.type === "sale");
    const purchases = filtered.filter((v) => v.type === "purchase");
    const paidRows = taxPayments.filter((v) => v.type === "payment_out");
    const receivedRows = taxPayments.filter((v) => v.type === "payment_in");

    const sumBucket = (rows: typeof filtered) =>
      rows.reduce(
        (acc, v) => {
          const { taxableAmount, taxAmount, totalAmount } = resolveGstrSalePurchaseAmounts(v);
          acc.taxableAmount += taxableAmount;
          acc.taxAmount += taxAmount;
          acc.totalAmount += totalAmount;
          return acc;
        },
        { taxableAmount: 0, taxAmount: 0, totalAmount: 0 }
      );

    const salesAgg = sumBucket(sales);
    const purchasesAgg = sumBucket(purchases);
    const taxPaid = paidRows.reduce((sum, v) => sum + gstrTaxPaymentAmount(v), 0);
    const taxReceived = receivedRows.reduce((sum, v) => sum + gstrTaxPaymentAmount(v), 0);
    const netTax = salesAgg.taxAmount - purchasesAgg.taxAmount - taxPaid + taxReceived;

    return {
      sales: {
        count: sales.length,
        ...salesAgg,
      },
      purchases: {
        count: purchases.length,
        ...purchasesAgg,
      },
      taxPaid: { count: paidRows.length, amount: taxPaid },
      taxReceived: { count: receivedRows.length, amount: taxReceived },
      netTax,
    };
  }, [gstVouchers, taxSettlementVouchers, dateRange]);

  const handlePrint = useCallback(() => {
    if (!company) return;
    void openGstr3bPrint({
      company,
      dateSystem,
      dateRange,
      allTimeRange,
      formatDate,
      formatDateBS,
      data: gstr3bData,
      formatAmount: (amount, side) =>
        formatGstrDrCrAmount(formatCurrencyForPrint, amount, side, showDrCr),
    });
  }, [company, dateSystem, dateRange, allTimeRange, formatDate, formatDateBS, formatCurrencyForPrint, gstr3bData, showDrCr]);

  return (
    <GstrReportShell
      title="GSTR-3B"
      description="Monthly summary return of sales and purchases."
      onPrint={handlePrint}
      dateControls={
        <GstrDateRangeControls
          dateRange={dateRange}
          setDateRange={setDateRange}
          onClear={clearDateRange}
          dateSystem={dateSystem}
          calendarMonths={calendarMonths}
          allTimeRange={allTimeRange}
        />
      }
    >
      <GstrReportTableScroll>
        <Table scrollContainer={false} className={GSTR_TABLE_CLASS}>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Taxable Amount</TableHead>
              <TableHead className="text-right">Tax Amount</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <GstrSelectableTableRow rowId="sales" selectedRowId={selectedRowId} onSelect={setSelectedRowId}>
              <TableCell className="font-semibold">Outward Supplies (Sales)</TableCell>
              <TableCell className="text-right tabular-nums">{gstr3bData.sales.count}</TableCell>
              <TableCell className={GSTR_AMOUNT_DR_CN}>{money(gstr3bData.sales.taxableAmount, "dr")}</TableCell>
              <TableCell className={GSTR_AMOUNT_DR_CN}>{money(gstr3bData.sales.taxAmount, "dr")}</TableCell>
              <TableCell className={GSTR_AMOUNT_DR_CN}>{money(gstr3bData.sales.totalAmount, "dr")}</TableCell>
            </GstrSelectableTableRow>
            <GstrSelectableTableRow rowId="purchases" selectedRowId={selectedRowId} onSelect={setSelectedRowId}>
              <TableCell className="font-semibold">Inward Supplies (Purchases)</TableCell>
              <TableCell className="text-right tabular-nums">{gstr3bData.purchases.count}</TableCell>
              <TableCell className={GSTR_AMOUNT_CR_CN}>{money(gstr3bData.purchases.taxableAmount, "cr")}</TableCell>
              <TableCell className={GSTR_AMOUNT_CR_CN}>{money(gstr3bData.purchases.taxAmount, "cr")}</TableCell>
              <TableCell className={GSTR_AMOUNT_CR_CN}>{money(gstr3bData.purchases.totalAmount, "cr")}</TableCell>
            </GstrSelectableTableRow>
            <GstrSelectableTableRow rowId="taxPaid" selectedRowId={selectedRowId} onSelect={setSelectedRowId}>
              <TableCell className="font-semibold">Net Tax Paid</TableCell>
              <TableCell className="text-right tabular-nums">{gstr3bData.taxPaid.count}</TableCell>
              <TableCell />
              <TableCell className={GSTR_AMOUNT_CR_CN}>{money(gstr3bData.taxPaid.amount, "cr")}</TableCell>
              <TableCell />
            </GstrSelectableTableRow>
            <GstrSelectableTableRow rowId="taxReceived" selectedRowId={selectedRowId} onSelect={setSelectedRowId}>
              <TableCell className="font-semibold">Net Tax Received</TableCell>
              <TableCell className="text-right tabular-nums">{gstr3bData.taxReceived.count}</TableCell>
              <TableCell />
              <TableCell className={GSTR_AMOUNT_DR_CN}>{money(gstr3bData.taxReceived.amount, "dr")}</TableCell>
              <TableCell />
            </GstrSelectableTableRow>
            <GstrSelectableTableRow rowId="netPayable" selectedRowId={selectedRowId} onSelect={setSelectedRowId}>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className={cn(gstrAmountClass(gstr3bData.netTax >= 0 ? "dr" : "cr"), "font-bold")}>
                <div className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                  <span>Net Tax Payable</span>
                  <span className="tabular-nums">
                    {money(gstr3bData.netTax, gstr3bData.netTax >= 0 ? "dr" : "cr")}
                  </span>
                </div>
              </TableCell>
              <TableCell />
            </GstrSelectableTableRow>
          </TableBody>
        </Table>
      </GstrReportTableScroll>
    </GstrReportShell>
  );
}

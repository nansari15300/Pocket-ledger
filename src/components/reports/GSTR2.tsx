"use client";

import { useFyScopedVouchers } from "@/hooks/useFyScopedVouchers";
import { useCallback, useMemo } from "react";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { useCalendarMonths } from "@/hooks/use-mobile";
import {
  formatGstrDrCrAmount,
  groupGstrLinesByAccount,
  resolveGstrSalePurchaseAmounts,
  resolveGstrVoucherDateSpan,
  type GstrLineRow,
} from "@/lib/reports/gstrVoucherAmounts";
import { openGstrLineItemsPrint } from "@/lib/reports/gstrReportPrint";
import {
  GstrDateRangeControls,
  GstrReportShell,
  GstrReportTableScroll,
  GSTR_AMOUNT_CR_CN,
  gstrFormatCurrency,
  GstrVoucherEditDialog,
  useGstrVoucherEditDialog,
  useGstrReportDateRange,
} from "@/components/reports/GstrReportShell";
import { GstrAccountGroupedTable, GstrExpandCollapsePills, useGstrAccountExpand } from "@/components/reports/GstrAccountGroupedTable";

export function GSTR2Report() {
  const { company } = useCompany();
  const { vouchers, processedParties } = useFyScopedVouchers();
  const { dateRange, setDateRange, clearDateRange } = useGstrReportDateRange();
  const { dateSystem, formatCurrency, formatCurrencyForPrint, formatDate, formatDateBS } = useDate();
  const calendarMonths = useCalendarMonths();
  const showDrCr = company?.showDrCr ?? true;
  const money = (amount: number) => gstrFormatCurrency(formatCurrency, amount, "cr", showDrCr);
  const {
    selectedVoucherId,
    selectVoucher,
    openVoucherEdit,
    editVoucher,
    isVoucherDialogOpen,
    setIsVoucherDialogOpen,
    closeVoucherEdit,
  } = useGstrVoucherEditDialog();

  const purchaseVouchers = useMemo(() => vouchers.filter((v) => v.type === "purchase"), [vouchers]);
  const allTimeRange = useMemo(() => resolveGstrVoucherDateSpan(purchaseVouchers), [purchaseVouchers]);

  const gstr2Data = useMemo((): GstrLineRow[] => {
    let filtered = purchaseVouchers;

    if (dateRange?.from) {
      const from = dateRange.from;
      const to = dateRange.to || from;
      filtered = filtered.filter((v) => {
        const vDate = v.date?.toDate ? v.date.toDate() : new Date(v.date);
        return vDate >= from && vDate <= to;
      });
    }

    return filtered.map((v) => {
      const party = processedParties.find((p) => p.id === v.partyId);
      const { taxableAmount, taxAmount, totalAmount } = resolveGstrSalePurchaseAmounts(v);

      return {
        id: v.id,
        voucher: v,
        date: v.date,
        voucherNumber: v.voucherNumber || v.id,
        partyId: String(v.partyId || ""),
        partyName: party?.name || "N/A",
        partyGSTIN: party?.pan || "N/A",
        taxableAmount,
        taxAmount,
        totalAmount,
      };
    });
  }, [purchaseVouchers, dateRange, processedParties]);

  const groups = useMemo(() => groupGstrLinesByAccount(gstr2Data), [gstr2Data]);
  const { expandedKeys, toggleAccount, expandAll, collapseAll, allExpanded, noneExpanded } =
    useGstrAccountExpand(groups);

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

  const displayDate = (date: unknown) => {
    if (!date) return "N/A";
    const d =
      date && typeof date === "object" && "toDate" in date && typeof (date as { toDate: () => Date }).toDate === "function"
        ? (date as { toDate: () => Date }).toDate()
        : new Date(date as string | number | Date);
    return dateSystem === "AD" ? formatDate(d) : formatDateBS(d);
  };

  const handlePrint = useCallback(() => {
    if (!company) return;
    void openGstrLineItemsPrint({
      company,
      title: "GSTR-2",
      dateSystem,
      dateRange,
      allTimeRange,
      formatDate,
      formatDateBS,
      rows: gstr2Data.map((row) => ({
        date: displayDate(row.date),
        voucherNumber: String(row.voucherNumber ?? ""),
        partyName: row.partyName,
        partyGSTIN: row.partyGSTIN,
        taxableAmount: row.taxableAmount,
        taxAmount: row.taxAmount,
        totalAmount: row.totalAmount,
      })),
      formatAmount: (amount) => formatGstrDrCrAmount(formatCurrencyForPrint, amount, "cr", showDrCr),
      emptyMessage: "No purchase transactions found for the selected period.",
      amountSide: "cr",
    });
  }, [company, dateSystem, dateRange, allTimeRange, formatDate, formatDateBS, formatCurrencyForPrint, gstr2Data, showDrCr]);

  return (
    <GstrReportShell
      title="GSTR-2"
      description="Summary of all inward supplies (purchases)."
      onPrint={handlePrint}
      headerActions={
        <GstrExpandCollapsePills
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          allExpanded={allExpanded}
          noneExpanded={noneExpanded}
          disabled={groups.length === 0}
        />
      }
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
        <GstrAccountGroupedTable
          groups={groups}
          amountClass={GSTR_AMOUNT_CR_CN}
          money={money}
          displayDate={displayDate}
          selectedRowId={selectedVoucherId}
          onSelect={selectVoucher}
          onEdit={openVoucherEdit}
          emptyMessage="No purchase transactions found for the selected period."
          totals={totals}
          expandedKeys={expandedKeys}
          onToggleAccount={toggleAccount}
        />
      </GstrReportTableScroll>
      <GstrVoucherEditDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={setIsVoucherDialogOpen}
        voucher={editVoucher}
        onClosed={closeVoucherEdit}
      />
    </GstrReportShell>
  );
}

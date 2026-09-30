"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import { LEDGER_HEADER_PILL_CN, LEDGER_HEADER_PILL_ICON_SIZE_CN } from "@/lib/ledgerHeaderChrome";
import { useDate } from "@/hooks/useDate";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVouchers } from "@/hooks/useVouchers";
import { getCurrentMonthDateRange } from "@/components/dashboard/MonthYearFilter";
import type { DateRange } from "@/components/ui/ad-calendar";
import { openPrintDirect } from "@/lib/printDirect";
import { computeReceivablesPayablesFinancialSummary } from "@/lib/receivablesPayablesFinancialSummary";
import {
  buildRpDialogSections,
  countRpDeadlineDueAccounts,
  countRpDialogSide,
  filterRpDialogSectionsForDeadlineDue,
  normalizeReceivablesPayablesSummary,
  readRpDeadlinesFromStorage,
  rpDialogRowSelectionKey,
  RP_DIALOG_FILTER_OPTIONS,
  sumRpDialogSide,
  writeRpDeadlinesToStorage,
  wasRpDeadlineDialogAutoShownToday,
  markRpDeadlineDialogAutoShownToday,
  type RpDeadlinesMap,
  type RpDialogRow,
} from "@/lib/receivablesPayablesDialogUi";
import { ReceivablesPayablesDialogFooter } from "@/components/reports/ReceivablesPayablesDialogFooter";
import { ReceivablesPayablesMobileSidePills } from "@/components/reports/ReceivablesPayablesMobileSidePills";
import {
  ReceivablesPayablesDialogEntityList,
  rpDialogListScrollHandlers,
  rpDialogPreventDismissForNestedPopover,
  RP_DIALOG_SHELL_ATTR,
  RP_DIALOG_HEADER_DIVIDER_CN,
} from "@/components/reports/ReceivablesPayablesDialogEntityList";
import { useReceivablesPayablesLedgerPopup } from "@/components/reports/ReceivablesPayablesLedgerPopup";
import { useReceivablesPayablesEntityVisibility } from "@/hooks/useReceivablesPayablesEntityVisibility";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { RP_DIALOG_SCROLL_CN } from "@/lib/receivablesPayablesEntityKeys";
import { useServerReceivablesPayablesSummary } from "@/hooks/useServerReceivablesPayablesSummary";
import { useRpOutstandingDialog } from "@/contexts/RpOutstandingDialogContext";
import type { ReceivablesPayablesSideTab } from "@/components/reports/ReceivablesPayablesMobileSidePills";

export function RpOutstandingDialogHost() {
  const { can } = usePermissions();
  const { company } = useCompany();
  const isMobile = useIsMobile();
  const { formatCurrency, formatCurrencyForPrint, dateSystem, formatDate, formatDateBS } = useDate();
  const {
    open,
    tab,
    filter: receivablePayableFilter,
    setOutstandingOpen,
    setOutstandingTab,
    setOutstandingFilter,
    openOutstandingDialog,
  } = useRpOutstandingDialog();

  const {
    vouchers,
    loading,
    processedParties,
    processedStaff,
    processedTaxes,
    processedAccounts,
    expenseAccounts,
  } = useVouchers();

  const [receivablesDateRange] = useState<DateRange | undefined>(() => getCurrentMonthDateRange(dateSystem));
  const [rpDeadlines, setRpDeadlines] = useState<RpDeadlinesMap>({});

  const { filterSummary: filterRpSummary } = useReceivablesPayablesEntityVisibility();
  const rpListMotion = useMasterListRowMotion();
  const rpListScrollHandlers = rpDialogListScrollHandlers(rpListMotion);
  const rpLedgerPopup = useReceivablesPayablesLedgerPopup();

  const {
    summary: serverRpSummary,
    loading: serverRpLoading,
    useClientFallback: serverRpClientFb,
    preferServer: preferServerRp,
  } = useServerReceivablesPayablesSummary({
    companyId: company?.id,
    storageOption: company?.storageOption,
    receivablesDateRange,
    enabled: true,
  });

  const needClientRp = !preferServerRp || serverRpClientFb || (!serverRpSummary && !serverRpLoading);

  const clientFinancialSummary = useMemo(() => {
    if (!needClientRp) {
      return computeReceivablesPayablesFinancialSummary({
        vouchers,
        processedParties,
        processedStaff,
        processedTaxes,
        processedAccounts,
        processedExpenseAccounts: expenseAccounts,
        receivablesDateRange,
        loading: true,
      });
    }
    return computeReceivablesPayablesFinancialSummary({
      vouchers,
      processedParties,
      processedStaff,
      processedTaxes,
      processedAccounts,
      processedExpenseAccounts: expenseAccounts,
      receivablesDateRange,
      loading: !!loading,
    });
  }, [
    needClientRp,
    loading,
    vouchers,
    processedParties,
    processedStaff,
    processedTaxes,
    processedAccounts,
    expenseAccounts,
    receivablesDateRange,
  ]);

  const rawFinancialSummary = useMemo(() => {
    let raw;
    if (preferServerRp && !serverRpClientFb && serverRpSummary) raw = serverRpSummary;
    else if (preferServerRp && !serverRpClientFb && serverRpLoading) {
      raw = computeReceivablesPayablesFinancialSummary({
        vouchers,
        processedParties,
        processedStaff,
        processedTaxes,
        processedAccounts,
        processedExpenseAccounts: expenseAccounts,
        receivablesDateRange,
        loading: true,
      });
    } else raw = clientFinancialSummary;
    return normalizeReceivablesPayablesSummary(raw);
  }, [
    preferServerRp,
    serverRpClientFb,
    serverRpSummary,
    serverRpLoading,
    clientFinancialSummary,
    vouchers,
    processedParties,
    processedStaff,
    processedTaxes,
    processedAccounts,
    expenseAccounts,
    receivablesDateRange,
  ]);

  const financialSummary = useMemo(
    () => filterRpSummary(rawFinancialSummary),
    [rawFinancialSummary, filterRpSummary]
  );

  useEffect(() => {
    const id = company?.id;
    if (!id) {
      setRpDeadlines({});
      return;
    }
    setRpDeadlines(readRpDeadlinesFromStorage(id));
  }, [company?.id]);

  const handleRpDeadlineChange = useCallback(
    (side: "receivables" | "payables", row: RpDialogRow, ymd: string | null) => {
      const id = company?.id;
      if (!id) return;
      const key = rpDialogRowSelectionKey(side, row);
      setRpDeadlines((prev) => {
        const next = { ...prev };
        if (ymd) next[key] = ymd;
        else delete next[key];
        writeRpDeadlinesToStorage(id, next);
        return next;
      });
    },
    [company?.id]
  );

  const receivablesDialogSections = useMemo(
    () => buildRpDialogSections("receivables", financialSummary, receivablePayableFilter),
    [financialSummary, receivablePayableFilter]
  );
  const payablesDialogSections = useMemo(
    () => buildRpDialogSections("payables", financialSummary, receivablePayableFilter),
    [financialSummary, receivablePayableFilter]
  );
  const receivablesDialogCount = useMemo(
    () => countRpDialogSide("receivables", financialSummary, receivablePayableFilter),
    [financialSummary, receivablePayableFilter]
  );
  const payablesDialogCount = useMemo(
    () => countRpDialogSide("payables", financialSummary, receivablePayableFilter),
    [financialSummary, receivablePayableFilter]
  );

  const rpDeadlineDueCount = useMemo(
    () => countRpDeadlineDueAccounts(financialSummary, receivablePayableFilter, rpDeadlines, new Date()),
    [financialSummary, receivablePayableFilter, rpDeadlines]
  );

  const receivablesDeadlineSections = useMemo(
    () => filterRpDialogSectionsForDeadlineDue(receivablesDialogSections, "receivables", rpDeadlines, new Date()),
    [receivablesDialogSections, rpDeadlines]
  );
  const payablesDeadlineSections = useMemo(
    () => filterRpDialogSectionsForDeadlineDue(payablesDialogSections, "payables", rpDeadlines, new Date()),
    [payablesDialogSections, rpDeadlines]
  );

  const receivablesPayablesDialogListTotals = useMemo(
    () => ({
      receivableSum: sumRpDialogSide("receivables", financialSummary, receivablePayableFilter),
      payableSum: sumRpDialogSide("payables", financialSummary, receivablePayableFilter),
    }),
    [financialSummary, receivablePayableFilter]
  );

  const receivablesPayablesDialogBalance = useMemo(() => {
    const { receivableSum, payableSum } = receivablesPayablesDialogListTotals;
    const amount = Math.abs(receivableSum - payableSum);
    if (receivableSum > payableSum) return { amount, side: "receivable" as const };
    if (payableSum > receivableSum) return { amount, side: "payable" as const };
    return { amount: 0, side: "equal" as const };
  }, [receivablesPayablesDialogListTotals]);

  const formatRpDialogAmount = (amount: number, absAmount = false) =>
    formatCurrency(absAmount ? Math.abs(amount) : amount, {
      noSuffix: true,
      showDrCr: true,
      context: "transaction",
    });

  const rpDeadlineRowProps = useMemo(
    () => ({
      deadlines: rpDeadlines,
      onDeadlineChange: handleRpDeadlineChange,
      showDeadlineControls: true,
    }),
    [rpDeadlines, handleRpDeadlineChange]
  );

  const rpDataReady = !loading && !(preferServerRp && serverRpLoading);

  useEffect(() => {
    if (!rpDataReady || !company?.id || !can("view_receivable_payable_summary")) return;
    if (rpDeadlineDueCount <= 0) return;
    if (wasRpDeadlineDialogAutoShownToday(company.id)) return;
    markRpDeadlineDialogAutoShownToday(company.id);
    setOutstandingFilter("all");
    openOutstandingDialog("deadline");
  }, [rpDataReady, company?.id, rpDeadlineDueCount, can, openOutstandingDialog, setOutstandingFilter]);

  const handlePrint = () => {
    const filterLabel =
      RP_DIALOG_FILTER_OPTIONS.find((o) => o.id === receivablePayableFilter)?.label ??
      receivablePayableFilter;
    const printTotalReceivable = sumRpDialogSide("receivables", financialSummary, receivablePayableFilter);
    const printTotalPayable = sumRpDialogSide("payables", financialSummary, receivablePayableFilter);
    const buildTableBody = (side: "receivables" | "payables") => {
      const sections = buildRpDialogSections(side, financialSummary, receivablePayableFilter);
      const body: any[] = [["Account", { text: "Amount", alignment: "right" }]];
      for (const section of sections) {
        if (section.rows.length === 0) continue;
        body.push([
          { text: `${section.label} (${section.rows.length})`, bold: true, color: "#64748b" },
          "",
        ]);
        for (const item of section.rows) {
          body.push([
            item.party,
            {
              text: formatCurrencyForPrint(Math.abs(item.balance), { noSuffix: true, noAnimation: true }),
              alignment: "right",
            },
          ]);
        }
      }
      return body;
    };
    const receivablesBody = buildTableBody("receivables");
    const payablesBody = buildTableBody("payables");
    receivablesBody.push([
      { text: "Total Receivable", bold: true, alignment: "right" },
      {
        text: formatCurrencyForPrint(printTotalReceivable, { noSuffix: true, noAnimation: true }),
        bold: true,
        alignment: "right",
        color: "#059669",
      },
    ]);
    payablesBody.push([
      { text: "Total Payable", bold: true, alignment: "right" },
      {
        text: formatCurrencyForPrint(printTotalPayable, { noSuffix: true, noAnimation: true }),
        bold: true,
        alignment: "right",
        color: "#DC2626",
      },
    ]);
    const printRecCount = countRpDialogSide("receivables", financialSummary, receivablePayableFilter);
    const printPayCount = countRpDialogSide("payables", financialSummary, receivablePayableFilter);
    const asOfDate = dateSystem === "BS" ? formatDateBS(new Date()) : formatDate(new Date());
    openPrintDirect(
      {
        company: {
          name: company?.name || "",
          pan: company?.pan,
          phone: company?.phone,
          address: company?.address,
          decimalPlaces: company?.decimalPlaces,
          showDrCr: company?.showDrCr,
          showCurrencySymbol: company?.showCurrencySymbol,
          logoUrl: company?.logoUrl,
        },
        dateSystem,
        title: `Receivables & Payables (${filterLabel})`,
        context: "daybook",
        dateRangeText: `As of ${asOfDate}`,
        vouchersCount: printRecCount + printPayCount,
        openingBalance: 0,
        transactions: [],
        showNarration: false,
        customContent: [
          {
            columns: [
              {
                width: "*",
                stack: [
                  { text: "Receivables", style: "subheader", color: "#059669" },
                  {
                    table: { headerRows: 1, widths: ["*", "auto"], body: receivablesBody },
                    layout: "lightHorizontalLines",
                    margin: [0, 5, 0, 15],
                  },
                ],
              },
              {
                width: "*",
                stack: [
                  { text: "Payables", style: "subheader", color: "#DC2626" },
                  {
                    table: { headerRows: 1, widths: ["*", "auto"], body: payablesBody },
                    layout: "lightHorizontalLines",
                  },
                ],
              },
            ],
            columnGap: 20,
          },
        ],
      },
      true
    );
  };

  if (!can("view_receivable_payable_summary")) return null;

  return (
    <>
                                <Dialog open={open} onOpenChange={(nextOpen) => {
                                    setOutstandingOpen(nextOpen);
                                    if (nextOpen) setOutstandingFilter("all");
                                    if (!nextOpen) {
                                        setOutstandingTab("both");
                                        rpLedgerPopup.resetDialogInteraction();
                                    }
                                }}>
                                    <DialogContent
                                        overlayClassName="bg-black/45 backdrop-blur-none"
                                        className="dashboard-financial-popup max-w-6xl gap-0 p-0 h-[90vh] rounded-lg flex flex-col overflow-hidden"
                                        onPointerDownOutside={rpDialogPreventDismissForNestedPopover}
                                        onInteractOutside={rpDialogPreventDismissForNestedPopover}
                                        {...RP_DIALOG_SHELL_ATTR}
                                    >
                                        <DialogHeader className={cn("shrink-0 flex flex-col border-0", isMobile ? "space-y-0 px-3 pb-1.5 pt-1.5" : "space-y-2 p-4 pb-3")}>
                                            <DialogTitle className={cn("whitespace-nowrap text-base md:text-lg", isMobile && "sr-only")}>
                                                Receivables & Payables Details
                                            </DialogTitle>
                                            {isMobile ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <ReceivablesPayablesMobileSidePills
                                                        tab={tab}
                                                        receivablesCount={receivablesDialogCount}
                                                        payablesCount={payablesDialogCount}
                                                        deadlineCount={rpDeadlineDueCount}
                                                        onSelect={setOutstandingTab}
                                                    />
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePrint();
                                                        }}
                                                        className={cn(
                                                            "data-pl-rp-side-pill pl-chrome-btn-drop flex items-center gap-1.5 border border-solid !border-[1px] !border-blue-300",
                                                            chromeProPillCn,
                                                            LEDGER_HEADER_PILL_CN
                                                        )}
                                                    >
                                                        Print <Printer className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex w-full items-center gap-2">
                                                    <Tabs
                                                        value={
                                                            tab === "both"
                                                                ? "receivables"
                                                                : tab
                                                        }
                                                        onValueChange={(v) =>
                                                            setOutstandingTab(v as ReceivablesPayablesSideTab)
                                                        }
                                                        className="min-w-0 flex-1"
                                                    >
                                                        <TabsList className="inline-flex h-auto w-auto gap-1 rounded-full bg-transparent p-0">
                                                            <TabsTrigger
                                                                value="receivables"
                                                                className={cn(
                                                                    "data-pl-rp-side-pill pl-chrome-btn-drop rounded-full border border-solid px-2.5 py-0.5 text-xs shadow-none",
                                                                    "data-[state=active]:!border-[1px] data-[state=active]:!border-green-600",
                                                                    "data-[state=inactive]:!border-[1px] data-[state=inactive]:!border-blue-300",
                                                                    chromeProPillCn,
                                                                    LEDGER_HEADER_PILL_CN
                                                                )}
                                                            >
                                                                Receivables ({receivablesDialogCount})
                                                            </TabsTrigger>
                                                            <TabsTrigger
                                                                value="payables"
                                                                className={cn(
                                                                    "data-pl-rp-side-pill pl-chrome-btn-drop rounded-full border border-solid px-2.5 py-0.5 text-xs shadow-none",
                                                                    "data-[state=active]:!border-[1px] data-[state=active]:!border-green-600",
                                                                    "data-[state=inactive]:!border-[1px] data-[state=inactive]:!border-blue-300",
                                                                    chromeProPillCn,
                                                                    LEDGER_HEADER_PILL_CN
                                                                )}
                                                            >
                                                                Payables ({payablesDialogCount})
                                                            </TabsTrigger>
                                                            <TabsTrigger
                                                                value="deadline"
                                                                className={cn(
                                                                    "data-pl-rp-side-pill pl-chrome-btn-drop rounded-full border border-solid px-2.5 py-0.5 text-xs shadow-none",
                                                                    "data-[state=active]:!border-[1px] data-[state=active]:!border-green-600",
                                                                    "data-[state=inactive]:!border-[1px] data-[state=inactive]:!border-blue-300",
                                                                    chromeProPillCn,
                                                                    LEDGER_HEADER_PILL_CN
                                                                )}
                                                            >
                                                                Deadline ({rpDeadlineDueCount})
                                                            </TabsTrigger>
                                                        </TabsList>
                                                    </Tabs>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePrint();
                                                        }}
                                                        className={cn(
                                                            "data-pl-rp-side-pill pl-chrome-btn-drop shrink-0 flex items-center gap-1.5 border border-solid !border-[1px] !border-blue-300",
                                                            chromeProPillCn,
                                                            LEDGER_HEADER_PILL_CN
                                                        )}
                                                    >
                                                        Print <Printer className={LEDGER_HEADER_PILL_ICON_SIZE_CN} />
                                                    </Button>
                                                </div>
                                            )}
                                        </DialogHeader>
                                        <div className={RP_DIALOG_HEADER_DIVIDER_CN} aria-hidden />
                                        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-2 pt-[3px] pb-0">
                                            {isMobile ? (
                                                <div className={cn("flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-0", RP_DIALOG_SCROLL_CN)} {...rpListScrollHandlers}>
                                                    {(tab === "receivables" || tab === "both") && (
                                                            <ReceivablesPayablesDialogEntityList
                                                                sections={receivablesDialogSections}
                                                                side="receivables"
                                                                formatAmount={formatRpDialogAmount}
                                                                isMobile={isMobile}
                                                                listMotion={rpListMotion}
                                                                selectedKey={rpLedgerPopup.selectedKey}
                                                                onSelectRow={rpLedgerPopup.selectRow}
                                                                onOpenRow={rpLedgerPopup.openRowLedger}
                                                                {...rpDeadlineRowProps}
                                                            />
                                                    )}
                                                    {tab === "payables" && (
                                                            <ReceivablesPayablesDialogEntityList
                                                                sections={payablesDialogSections}
                                                                side="payables"
                                                                formatAmount={formatRpDialogAmount}
                                                                isMobile={isMobile}
                                                                listMotion={rpListMotion}
                                                                selectedKey={rpLedgerPopup.selectedKey}
                                                                onSelectRow={rpLedgerPopup.selectRow}
                                                                onOpenRow={rpLedgerPopup.openRowLedger}
                                                                {...rpDeadlineRowProps}
                                                            />
                                                    )}
                                                    {tab === "deadline" && (
                                                        <div className="flex min-h-0 flex-col gap-3">
                                                            {receivablesDeadlineSections.length > 0 ? (
                                                                <div className="min-h-0">
                                                                    <h3 className="mb-2 text-base font-semibold text-green-600">Receivables</h3>
                                                                    <ReceivablesPayablesDialogEntityList
                                                                        sections={receivablesDeadlineSections}
                                                                        side="receivables"
                                                                        formatAmount={formatRpDialogAmount}
                                                                        isMobile={isMobile}
                                                                        listMotion={rpListMotion}
                                                                        selectedKey={rpLedgerPopup.selectedKey}
                                                                        onSelectRow={rpLedgerPopup.selectRow}
                                                                        onOpenRow={rpLedgerPopup.openRowLedger}
                                                                        {...rpDeadlineRowProps}
                                                                    />
                                                                </div>
                                                            ) : null}
                                                            {payablesDeadlineSections.length > 0 ? (
                                                                <div className="min-h-0">
                                                                    <h3 className="mb-2 text-base font-semibold text-red-600">Payables</h3>
                                                                    <ReceivablesPayablesDialogEntityList
                                                                        sections={payablesDeadlineSections}
                                                                        side="payables"
                                                                        formatAmount={formatRpDialogAmount}
                                                                        isMobile={isMobile}
                                                                        listMotion={rpListMotion}
                                                                        selectedKey={rpLedgerPopup.selectedKey}
                                                                        onSelectRow={rpLedgerPopup.selectRow}
                                                                        onOpenRow={rpLedgerPopup.openRowLedger}
                                                                        {...rpDeadlineRowProps}
                                                                    />
                                                                </div>
                                                            ) : null}
                                                            {receivablesDeadlineSections.length === 0 &&
                                                            payablesDeadlineSections.length === 0 ? (
                                                                <p className="py-8 text-center text-sm text-muted-foreground">
                                                                    No accounts due on or before today with an outstanding balance.
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : tab === "deadline" ? (
                                                <div className={cn("grid min-h-0 flex-1 min-w-0 grid-cols-2 gap-4 overflow-y-auto", RP_DIALOG_SCROLL_CN)} {...rpListScrollHandlers}>
                                                    <div className="flex min-h-0 flex-col">
                                                        <h3 className="mb-0.5 shrink-0 text-lg font-semibold text-green-600">Receivables</h3>
                                                        <ReceivablesPayablesDialogEntityList
                                                            sections={receivablesDeadlineSections}
                                                            side="receivables"
                                                            formatAmount={formatRpDialogAmount}
                                                            isMobile={isMobile}
                                                            listMotion={rpListMotion}
                                                            selectedKey={rpLedgerPopup.selectedKey}
                                                            onSelectRow={rpLedgerPopup.selectRow}
                                                            onOpenRow={rpLedgerPopup.openRowLedger}
                                                            {...rpDeadlineRowProps}
                                                        />
                                                    </div>
                                                    <div className="flex min-h-0 flex-col">
                                                        <h3 className="mb-0.5 shrink-0 text-lg font-semibold text-red-600">Payables</h3>
                                                        <ReceivablesPayablesDialogEntityList
                                                            sections={payablesDeadlineSections}
                                                            side="payables"
                                                            formatAmount={formatRpDialogAmount}
                                                            isMobile={isMobile}
                                                            listMotion={rpListMotion}
                                                            selectedKey={rpLedgerPopup.selectedKey}
                                                            onSelectRow={rpLedgerPopup.selectRow}
                                                            onOpenRow={rpLedgerPopup.openRowLedger}
                                                            {...rpDeadlineRowProps}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid flex-1 min-h-0 min-w-0 grid-cols-2 gap-4">
                                                    <div className="flex flex-col min-h-0 h-full">
                                                        <h3 className="text-lg font-semibold mb-0.5 text-green-600 shrink-0">Receivables ({receivablesDialogCount})</h3>
                                                        <div className={cn("flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-0.5", RP_DIALOG_SCROLL_CN)} {...rpListScrollHandlers}>
                                                            <ReceivablesPayablesDialogEntityList
                                                                sections={receivablesDialogSections}
                                                                side="receivables"
                                                                formatAmount={formatRpDialogAmount}
                                                                isMobile={isMobile}
                                                                listMotion={rpListMotion}
                                                                selectedKey={rpLedgerPopup.selectedKey}
                                                                onSelectRow={rpLedgerPopup.selectRow}
                                                                onOpenRow={rpLedgerPopup.openRowLedger}
                                                                {...rpDeadlineRowProps}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col min-h-0 h-full">
                                                        <h3 className="text-lg font-semibold mb-0.5 text-red-600 shrink-0">Payables ({payablesDialogCount})</h3>
                                                        <div className={cn("flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-0.5", RP_DIALOG_SCROLL_CN)} {...rpListScrollHandlers}>
                                                            <ReceivablesPayablesDialogEntityList
                                                                sections={payablesDialogSections}
                                                                side="payables"
                                                                formatAmount={formatRpDialogAmount}
                                                                isMobile={isMobile}
                                                                listMotion={rpListMotion}
                                                                selectedKey={rpLedgerPopup.selectedKey}
                                                                onSelectRow={rpLedgerPopup.selectRow}
                                                                onOpenRow={rpLedgerPopup.openRowLedger}
                                                                {...rpDeadlineRowProps}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <ReceivablesPayablesDialogFooter
                                            receivableSum={receivablesPayablesDialogListTotals.receivableSum}
                                            payableSum={receivablesPayablesDialogListTotals.payableSum}
                                            balance={receivablesPayablesDialogBalance}
                                            isMobile={isMobile}
                                            formatAmount={(amount) =>
                                                formatCurrency(amount, { noSuffix: true, context: "transaction" })
                                            }
                                        />
                                    </DialogContent>
      </Dialog>
      {rpLedgerPopup.popup}
    </>
  );
}

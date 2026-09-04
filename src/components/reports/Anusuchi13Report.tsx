"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import type { Party } from "@/components/party/types";
import { PartyDetails } from "@/components/party/PartyDetails";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/components/ui/ad-calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mdc, mdcNoEdgeSwipeCapture } from "@/lib/mobileDetailChrome";
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { MasterListRow } from "@/components/ui/master-list-row";
import { useReportPage } from "@/contexts/ReportPageContext";
import { Anusuchi13ConfirmationRibbon } from "@/components/reports/Anusuchi13ConfirmationRibbon";
import {
  type Anusuchi13ConfirmationFilter,
  countAnusuchi13ConfirmationFilter,
  computePartyFyTransactionTotal,
  filterVouchersInFy,
  getAnusuchi13FyKey,
  getFiscalRangeForFyKey,
  listAnusuchi13EligibleParties,
  listAvailableAnusuchi13FyKeys,
  matchesAnusuchi13ConfirmationFilter,
  formatAnusuchi13FyRangeLabel,
} from "@/lib/reports/anusuchi13Confirmation";
import {
  readAnusuchi13ReportMemory,
  writeAnusuchi13ReportMemory,
} from "@/lib/reports/anusuchi13ReportMemory";
import { LEDGER_HEADER_RIBBON_WRAP_CN } from "@/lib/ledgerHeaderChrome";
import { ResizeWidthHandle, useResizablePixelWidth } from "@/components/layout/ResizablePaneWidth";

export function Anusuchi13Report() {
  const isMobile = useIsMobile();
  const { formatCurrency, formatDateBySystem } = useDate();
  const { company } = useCompany();
  const { setDetailRibbonContent } = useReportPage();
  const {
    vouchers: allVouchers,
    loading: vouchersLoading,
    processedParties,
    journalAccountNames,
    userNames: vouchersUserNames,
  } = useVouchers();

  const initialMemory = useMemo(() => readAnusuchi13ReportMemory(), []);
  const runningFyKey = useMemo(
    () => getAnusuchi13FyKey(company?.country, new Date()),
    [company?.country]
  );

  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [confirmationRunning, setConfirmationRunning] = useState(
    Boolean(initialMemory.confirmationRunning)
  );
  const [confirmationFilter, setConfirmationFilter] = useState<Anusuchi13ConfirmationFilter>(
    initialMemory.confirmationFilter ?? "all"
  );
  const [selectedFyKey, setSelectedFyKey] = useState(
    initialMemory.selectedFyKey ?? runningFyKey
  );
  const hasAutoSelected = useRef(false);
  const { widthPx: accountListWidthPx, beginResize: beginAccountListResize } = useResizablePixelWidth({
    storageKey: "pl-confirmation-account-list-width-px",
    defaultPx: 320,
    minPx: Math.round(256 * 0.7),
    maxPx: Math.round(256 * 1.3),
  });

  const availableFyKeys = useMemo(
    () => listAvailableAnusuchi13FyKeys(processedParties, allVouchers, company?.country),
    [processedParties, allVouchers, company?.country]
  );

  const fyKey = availableFyKeys.includes(selectedFyKey)
    ? selectedFyKey
    : availableFyKeys[0] ?? runningFyKey;

  const fyRange = useMemo(
    () => getFiscalRangeForFyKey(company?.country, fyKey),
    [company?.country, fyKey]
  );

  const fyVouchers = useMemo(
    () => filterVouchersInFy(allVouchers, fyRange.start, fyRange.end),
    [allVouchers, fyRange.start, fyRange.end]
  );

  const partiesWithOneLacOrAbove = useMemo(
    () => listAnusuchi13EligibleParties(processedParties, allVouchers, fyRange.start, fyRange.end),
    [processedParties, allVouchers, fyRange.start, fyRange.end]
  );

  const confirmationCounts = useMemo(
    () => ({
      all: countAnusuchi13ConfirmationFilter(partiesWithOneLacOrAbove, fyKey, "all"),
      sent: countAnusuchi13ConfirmationFilter(partiesWithOneLacOrAbove, fyKey, "sent"),
      unsent: countAnusuchi13ConfirmationFilter(partiesWithOneLacOrAbove, fyKey, "unsent"),
      completed: countAnusuchi13ConfirmationFilter(partiesWithOneLacOrAbove, fyKey, "completed"),
      uncompleted: countAnusuchi13ConfirmationFilter(partiesWithOneLacOrAbove, fyKey, "uncompleted"),
    }),
    [partiesWithOneLacOrAbove, fyKey]
  );

  const filteredParties: Party[] = useMemo(() => {
    let list = partiesWithOneLacOrAbove;
    if (confirmationRunning && confirmationFilter !== "all") {
      list = list.filter((p) => matchesAnusuchi13ConfirmationFilter(p, fyKey, confirmationFilter));
    }
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(term));
  }, [
    partiesWithOneLacOrAbove,
    searchTerm,
    confirmationRunning,
    confirmationFilter,
    fyKey,
  ]);

  const partyTransactions = useMemo(() => {
    if (!selectedParty) return [];
    return allVouchers.filter(
      (v) =>
        v.partyId === selectedParty.id ||
        (Array.isArray(v.entries) && v.entries.some((e: any) => e.accountId === selectedParty.id))
    );
  }, [allVouchers, selectedParty]);

  const handleConfirmationRunningChange = useCallback((next: boolean) => {
    setConfirmationRunning(next);
    writeAnusuchi13ReportMemory({ confirmationRunning: next });
  }, []);

  const handleConfirmationFilterChange = useCallback((next: Anusuchi13ConfirmationFilter) => {
    setConfirmationFilter(next);
    writeAnusuchi13ReportMemory({ confirmationFilter: next });
  }, []);

  const handleSelectedFyKeyChange = useCallback((next: string) => {
    setSelectedFyKey(next);
    writeAnusuchi13ReportMemory({ selectedFyKey: next });
  }, []);

  const fyKeyLabel = useMemo(
    () => formatAnusuchi13FyRangeLabel(company?.country, fyKey, formatDateBySystem),
    [company?.country, fyKey, formatDateBySystem]
  );

  const ribbonElement = useMemo(
    () => (
      <Anusuchi13ConfirmationRibbon
        confirmationRunning={confirmationRunning}
        onConfirmationRunningChange={handleConfirmationRunningChange}
        confirmationFilter={confirmationFilter}
        onConfirmationFilterChange={handleConfirmationFilterChange}
        counts={confirmationCounts}
        fyOptions={availableFyKeys}
        selectedFyKey={fyKey}
        onSelectedFyKeyChange={handleSelectedFyKeyChange}
      />
    ),
    [
      confirmationRunning,
      confirmationFilter,
      confirmationCounts,
      availableFyKeys,
      fyKey,
      handleConfirmationRunningChange,
      handleConfirmationFilterChange,
      handleSelectedFyKeyChange,
    ]
  );

  useEffect(() => {
    if (isMobile) {
      setDetailRibbonContent(null);
      return;
    }
    setDetailRibbonContent(ribbonElement);
    return () => setDetailRibbonContent(null);
  }, [isMobile, setDetailRibbonContent, ribbonElement]);

  useEffect(() => {
    if (vouchersLoading || partiesWithOneLacOrAbove.length === 0 || hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (isMobile) return;
    const saved = readAnusuchi13ReportMemory();
    if (saved?.partyId) {
      const found = partiesWithOneLacOrAbove.find((p) => p.id === saved.partyId);
      if (found) {
        setSelectedParty(found);
        return;
      }
    }
    setSelectedParty(partiesWithOneLacOrAbove[0]);
  }, [vouchersLoading, partiesWithOneLacOrAbove, isMobile]);

  useEffect(() => {
    if (!selectedParty) return;
    if (filteredParties.some((p) => p.id === selectedParty.id)) return;
    setSelectedParty(filteredParties[0] ?? null);
  }, [filteredParties, selectedParty]);

  const handleSelectParty = useCallback((party: Party) => {
    setSelectedParty(party);
    writeAnusuchi13ReportMemory({ partyId: party.id });
  }, []);

  const handlePartyUpdated = useCallback((updated?: Partial<Party>) => {
    if (!updated?.id) return;
    setSelectedParty((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }, []);

  const partyList = (
    <ul className="pl-master-list-ul">
      {filteredParties.map((party) => {
        const total = computePartyFyTransactionTotal(party, fyVouchers);
        const isSelected = selectedParty?.id === party.id;
        return (
          <li key={party.id}>
            <MasterListRow
              selected={isSelected}
              className={masterListRowUnselectedCn(isSelected)}
              onClick={() => handleSelectParty(party)}
            >
              <div className="pl-master-list-row grid-cols-1">
                <div className="pl-master-list-row-leading items-start">
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <span className="block min-w-0 truncate text-left text-sm font-medium">
                      {party.name}
                    </span>
                    <span className="pl-master-list-row-amount ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </div>
            </MasterListRow>
          </li>
        );
      })}
    </ul>
  );

  const listHeader = (
    <>
      <div
        className={cn(
          isMobile ? "p-4 border-b space-y-3 flex-shrink-0" : "px-3 pt-3 pb-2 border-b space-y-2 flex-shrink-0"
        )}
      >
        {isMobile ? (
          <div className={cn(LEDGER_HEADER_RIBBON_WRAP_CN, "-mx-0 rounded-none border-x-0 px-2 py-1")}>
            {ribbonElement}
          </div>
        ) : null}
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Parties with FY transaction ≥ 1 Lac</p>
          <p className="text-xl font-bold">{partiesWithOneLacOrAbove.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{fyKeyLabel}</p>
        </Card>
      </div>
      <div className="p-3 border-b flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search parties..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="px-3 pt-2 pb-1 border-b flex-shrink-0">
        <h3 className="text-sm font-semibold">Parties ({filteredParties.length})</h3>
      </div>
    </>
  );

  if (vouchersLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (isMobile) {
    if (selectedParty) {
      return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div className={mdc.reportBackRow} {...mdcNoEdgeSwipeCapture}>
            <Button
              variant="ghost"
              size="icon"
              className={mdc.reportBackBtn}
              onClick={() => setSelectedParty(null)}
            >
              <ArrowLeft className="h-3 w-3" />
            </Button>
            <span className="font-semibold truncate">{selectedParty.name}</span>
          </div>
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <PartyDetails
              party={selectedParty}
              allParties={processedParties.filter((p) => !(p as any).isSystemAccount)}
              transactions={partyTransactions}
              onPartyUpdated={handlePartyUpdated}
              onPartyDeleted={() => setSelectedParty(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={vouchersUserNames}
              journalAccountNames={journalAccountNames}
              context="report"
              confirmationFyKey={fyKey}
              confirmationFyRange={fyRange}
              confirmationAllVouchers={allVouchers}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {listHeader}
        <ScrollArea
          listChrome
          className="flex-1 min-h-0"
          data-pl-master-list-chrome
          data-theme-list="account-list"
        >
          {partyList}
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div
        className="flex-1 grid grid-cols-1 min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: `${accountListWidthPx}px minmax(0, 1fr)` }}
      >
        <div
          className={cn(
            masterListShellCn,
            "relative flex flex-col min-h-0 border-r overflow-hidden bg-muted/30"
          )}
          data-pl-master-list-chrome
          data-theme-list="account-list"
        >
          <ResizeWidthHandle onPointerDown={beginAccountListResize} title="Resize confirmation account list" />
          {listHeader}
          <ScrollArea listChrome className="flex-1 min-h-0">
            {partyList}
          </ScrollArea>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selectedParty ? (
            <PartyDetails
              party={selectedParty}
              allParties={processedParties.filter((p) => !(p as any).isSystemAccount)}
              transactions={partyTransactions}
              onPartyUpdated={handlePartyUpdated}
              onPartyDeleted={() => setSelectedParty(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={vouchersUserNames}
              journalAccountNames={journalAccountNames}
              context="report"
              confirmationFyKey={fyKey}
              confirmationFyRange={fyRange}
              confirmationAllVouchers={allVouchers}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <Card className="w-full max-w-md text-center">
                <CardHeader>
                  <CardTitle>Select a party</CardTitle>
                  <CardDescription>
                    Choose a party from the list to view all its transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {partiesWithOneLacOrAbove.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No parties with FY transaction of one lac or above.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

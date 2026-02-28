"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { getTransactionAmounts } from "@/hooks/use-transactions";
import type { Party } from "@/components/party/types";
import { PartyDetails } from "@/components/party/PartyDetails";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ONE_LAC = 100_000;
const REPORT_MEMORY_KEY = "reportAnusuchi13State";

export function Anusuchi13Report() {
  const isMobile = useIsMobile();
  const { formatCurrency } = useDate();
  const {
    vouchers: allVouchers,
    loading: vouchersLoading,
    processedParties,
    journalAccountNames,
    userNames: vouchersUserNames,
  } = useVouchers();
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const hasAutoSelected = useRef(false);

  const partiesWithOneLacOrAbove = useMemo(() => {
    const list = processedParties.filter((p) => !(p as any).isSystemAccount);
    const withTotal = list.map((party) => {
      let total = 0;
      for (const t of allVouchers) {
        const { debit, credit } = getTransactionAmounts(t, "party", party);
        total += (debit || 0) + (credit || 0);
      }
      return { party, total };
    });
    return withTotal
      .filter(({ total }) => total >= ONE_LAC)
      .sort((a, b) => b.total - a.total)
      .map(({ party }) => party);
  }, [processedParties, allVouchers]);

  const filteredParties: Party[] = useMemo(() => {
    if (!searchTerm.trim()) return partiesWithOneLacOrAbove;
    const term = searchTerm.toLowerCase();
    return partiesWithOneLacOrAbove.filter((p) =>
      p.name.toLowerCase().includes(term)
    );
  }, [partiesWithOneLacOrAbove, searchTerm]);

  const partyTransactions = useMemo(() => {
    if (!selectedParty) return [];
    return allVouchers.filter(
      (v) =>
        v.partyId === selectedParty.id ||
        (v.entries && v.entries.some((e: any) => e.accountId === selectedParty.id))
    );
  }, [allVouchers, selectedParty]);

  // Restore last-visited party or auto-open top party (highest amount)
  useEffect(() => {
    if (vouchersLoading || partiesWithOneLacOrAbove.length === 0 || hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (isMobile) return; // Mobile: don't auto-select, show list first
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(REPORT_MEMORY_KEY) : null;
      const saved = raw ? (JSON.parse(raw) as { partyId?: string }) : null;
      if (saved?.partyId) {
        const found = partiesWithOneLacOrAbove.find((p) => p.id === saved.partyId);
        if (found) {
          setSelectedParty(found);
          return;
        }
      }
    } catch (_) {}
    setSelectedParty(partiesWithOneLacOrAbove[0]);
  }, [vouchersLoading, partiesWithOneLacOrAbove, isMobile]);

  const handleSelectParty = useCallback((party: Party) => {
    setSelectedParty(party);
    try {
      localStorage.setItem(REPORT_MEMORY_KEY, JSON.stringify({ partyId: party.id }));
    } catch (_) {}
  }, []);

  if (vouchersLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  // Mobile: show list first, then details when selected (like party page)
  if (isMobile) {
    if (selectedParty) {
      return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div className="p-2 border-b flex-shrink-0 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSelectedParty(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="font-semibold truncate">{selectedParty.name}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PartyDetails
              party={selectedParty}
              allParties={processedParties.filter((p) => !(p as any).isSystemAccount)}
              transactions={partyTransactions}
              onPartyUpdated={() => {}}
              onPartyDeleted={() => setSelectedParty(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={vouchersUserNames}
              journalAccountNames={journalAccountNames}
              context="report"
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="p-4 border-b space-y-3 flex-shrink-0">
          <h2 className="text-lg font-bold font-headline">Anusuchi 13</h2>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Parties with transaction ≥ 1 Lac</p>
            <p className="text-xl font-bold">{partiesWithOneLacOrAbove.length}</p>
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
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
            {filteredParties.map((party: Party) => {
              const total = (() => {
                let sum = 0;
                for (const t of allVouchers) {
                  const { debit, credit } = getTransactionAmounts(t, "party", party);
                  sum += (debit || 0) + (credit || 0);
                }
                return sum;
              })();
              const isSelected = (selectedParty as Party | null)?.id === (party as Party).id;
              return (
                <li key={party.id}>
                  <Card
                    className={cn(
                      "p-2 cursor-pointer border transition-colors",
                      isSelected
                        ? "border-primary bg-secondary"
                        : "hover:border-primary/50"
                    )}
                    onClick={() => handleSelectParty(party)}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{party.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                        {formatCurrency(total, { noAnimation: true })}
                      </span>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,max-content)_minmax(0,1fr)] min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 border-r overflow-hidden bg-muted/30">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <h2 className="text-lg font-bold font-headline">Anusuchi 13</h2>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Parties with transaction ≥ 1 Lac</p>
              <p className="text-xl font-bold">{partiesWithOneLacOrAbove.length}</p>
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
          <ScrollArea className="flex-1 min-h-0">
            <ul className="p-2 space-y-1">
              {filteredParties.map((party) => {
                const total = (() => {
                  let sum = 0;
                  for (const t of allVouchers) {
                    const { debit, credit } = getTransactionAmounts(t, "party", party);
                    sum += (debit || 0) + (credit || 0);
                  }
                  return sum;
                })();
                const isSelected = (selectedParty as Party | null)?.id === (party as Party).id;
                return (
                  <li key={party.id}>
                    <Card
                      className={cn(
                        "p-2 cursor-pointer border transition-colors",
                        isSelected
                          ? "border-primary bg-secondary"
                          : "hover:border-primary/50"
                      )}
                      onClick={() => handleSelectParty(party)}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{party.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                          {formatCurrency(total, { noAnimation: true })}
                        </span>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          {selectedParty ? (
            <PartyDetails
              party={selectedParty}
              allParties={processedParties.filter((p) => !(p as any).isSystemAccount)}
              transactions={partyTransactions}
              onPartyUpdated={() => {}}
              onPartyDeleted={() => setSelectedParty(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={vouchersUserNames}
              journalAccountNames={journalAccountNames}
              context="report"
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
                      No parties with transaction of one lac or above.
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

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Search } from "lucide-react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { PartyDetails } from "@/components/party/PartyDetails";
import { PartyList } from "@/components/party/PartyList";
import type { Party } from "@/components/party/types";
import { useVouchers } from "@/hooks/useVouchers";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import type { DateRange } from "react-day-picker";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SaleReportDetail() {
  const isMobile = useIsMobile();
  const { companyId } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedParties } = useVouchers();
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllCompanyVouchers, setShowAllCompanyVouchers] = useState(false);
  const hasAutoSelected = useRef(false);

  const saleVouchers = useMemo(() => allVouchers.filter((v) => v.type === "sale"), [allVouchers]);

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    try {
      const userDoc = await getDoc(doc(firestore, "users", userId));
      if (userDoc.exists()) {
        return userDoc.data().displayName || userDoc.data().email || "Unknown";
      }
    } catch (_) {}
    return "Unknown";
  }, []);

  useEffect(() => {
    const uids = new Set(allVouchers.map((t) => t.userId).filter(Boolean) as string[]);
    uids.forEach(async (uid) => {
      if (!userNames[uid]) {
        const name = await fetchUserName(uid);
        setUserNames((prev) => ({ ...prev, [uid]: name }));
      }
    });
  }, [allVouchers, userNames, fetchUserName]);

  const partiesWithSales = useMemo(() => {
    if (vouchersLoading || saleVouchers.length === 0) return [];
    const partyIdsWithSales = new Set(saleVouchers.map((v) => v.partyId));
    return processedParties
      .filter((p) => partyIdsWithSales.has(p.id))
      .map((p) => {
        const saleTotal = saleVouchers
          .filter((v) => v.partyId === p.id)
          .reduce((sum, v) => sum + (v.total || 0), 0);
        return { ...p, saleTotal };
      });
  }, [saleVouchers, processedParties, vouchersLoading]);

  const totalSales = useMemo(
    () => saleVouchers.reduce((sum, v) => sum + (v.total || 0), 0),
    [saleVouchers]
  );

  const partyTransactions = useMemo(() => {
    if (!selectedParty) return [];
    return saleVouchers.filter((v) => v.partyId === selectedParty.id);
  }, [saleVouchers, selectedParty]);

  const allSalesParty = useMemo(() => {
    if (!showAllCompanyVouchers) return null;
    const totalAmount = saleVouchers.reduce((sum, v) => sum + (v.total || 0), 0);
    return {
      id: "all",
      name: "All Sale Vouchers",
      debit: totalAmount,
      credit: 0,
      balance: totalAmount,
      openingBalance: 0,
      saleTotal: totalAmount,
      companyId: companyId || "",
    };
  }, [showAllCompanyVouchers, saleVouchers, companyId]);

  const currentParty = showAllCompanyVouchers ? allSalesParty : selectedParty;
  const currentTransactions = showAllCompanyVouchers ? saleVouchers : partyTransactions;

  const filteredParties = useMemo(() => {
    return partiesWithSales.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [partiesWithSales, searchTerm]);

  const REPORT_MEMORY_KEY = "reportSaleRegisterState";

  useEffect(() => {
    if (partiesWithSales.length === 0) return;
    if (hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (isMobile) return; // Mobile: don't auto-select, show list first
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(REPORT_MEMORY_KEY) : null;
      const saved = raw ? (JSON.parse(raw) as { partyId?: string }) : null;
      const partyId = saved?.partyId;
      if (partyId) {
        const found = partiesWithSales.find((p) => p.id === partyId);
        if (found) {
          setSelectedParty(found);
          return;
        }
      }
    } catch (_) {}
    setSelectedParty(partiesWithSales[0]);
  }, [partiesWithSales, isMobile]);

  const handleSelectParty = useCallback((party: Party) => {
    setShowAllCompanyVouchers(false);
    setSelectedParty(party);
    try {
      localStorage.setItem(REPORT_MEMORY_KEY, JSON.stringify({ partyId: party.id }));
    } catch (_) {}
  }, []);

  if (vouchersLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  // Mobile: show list first, then details when selected (like party page)
  if (isMobile) {
    if (currentParty) {
      return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div className="p-2 border-b flex-shrink-0 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedParty(null); setShowAllCompanyVouchers(false); }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="font-semibold truncate">{currentParty.name}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PartyDetails
              party={currentParty}
              transactions={currentTransactions}
              onPartyUpdated={() => {}}
              onPartyDeleted={() => { setSelectedParty(null); setShowAllCompanyVouchers(false); }}
              onShowAll={() => setShowAllCompanyVouchers(true)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              isAllVouchersView={showAllCompanyVouchers}
              userNames={userNames}
              context="sale"
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="p-4 border-b space-y-3 flex-shrink-0">
          <h2 className="text-lg font-bold font-headline">Sales</h2>
          <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="sale">
            <PermissionButton permission="create_records" className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Sale Invoice
            </PermissionButton>
          </AddVoucherDialog>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-xl font-bold text-green-600">
              {formatCurrency(totalSales, { noSuffix: true })}
            </p>
          </Card>
        </div>
        <div className="p-3 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="px-3 pt-2 pb-1 border-b flex-shrink-0">
          <h3 className="text-sm font-semibold">Sale accounts ({filteredParties.length})</h3>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PartyList
            parties={filteredParties}
            onSelectParty={handleSelectParty}
            selectedParty={selectedParty}
            searchTerm={searchTerm}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,max-content)_minmax(0,1fr)] min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 border-r overflow-hidden bg-muted/30">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <h2 className="text-lg font-bold font-headline">Sales</h2>
            <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="sale">
              <PermissionButton permission="create_records" className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Sale Invoice
              </PermissionButton>
            </AddVoucherDialog>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Sales</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(totalSales, { noSuffix: true })}
              </p>
            </Card>
          </div>
          <div className="p-3 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="px-3 pt-2 pb-1 border-b flex-shrink-0">
            <h3 className="text-sm font-semibold">Sale accounts ({filteredParties.length})</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PartyList
              parties={filteredParties}
              onSelectParty={handleSelectParty}
              selectedParty={selectedParty}
              searchTerm={searchTerm}
            />
          </div>
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          {currentParty ? (
            <PartyDetails
              party={currentParty}
              transactions={currentTransactions}
              onPartyUpdated={() => {}}
              onPartyDeleted={() => setSelectedParty(null)}
              onShowAll={() => setShowAllCompanyVouchers(true)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              isAllVouchersView={showAllCompanyVouchers}
              userNames={userNames}
              context="sale"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <Card className="w-full max-w-md text-center">
                <CardHeader>
                  <CardTitle>Select an account</CardTitle>
                  <CardDescription>
                    Choose a sale account from the list to view transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {partiesWithSales.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No sales recorded yet. Create a sale invoice to see accounts here.
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

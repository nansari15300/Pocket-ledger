"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Search } from "lucide-react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AccountDetails } from "@/components/account/AccountDetails";
import { AccountList } from "@/components/bank-cash/AccountList";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import type { DateRange } from "@/components/ui/ad-calendar";

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type JournalAccount = {
  id: string;
  accountName: string;
  accountType: string;
  balance: number;
  openingBalance?: number;
  [key: string]: any;
};

export function JournalReportDetail() {
  const isMobile = useIsMobile();
  const { formatCurrency } = useDate();
  const {
    vouchers: allVouchers,
    loading: vouchersLoading,
    processedAccounts,
    journalAccountNames,
    processedParties,
    processedStaff,
    processedTaxes,
    expenseAccounts: unprocessedExpenseAccounts,
  } = useVouchers();
  const [selectedAccount, setSelectedAccount] = useState<JournalAccount | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllCompanyVouchers, setShowAllCompanyVouchers] = useState(false);
  const hasAutoSelected = useRef(false);

  const journalVouchers = useMemo(
    () => allVouchers.filter((v) => v.type === "journal" && v.subType !== "add_salary"),
    [allVouchers]
  );

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

  const allAccounts = useMemo(() => {
    const accounts: JournalAccount[] = [];
    processedParties.forEach((p) => accounts.push({ ...p, id: p.id, accountName: p.name, accountType: "Party" }));
    processedStaff.forEach((s) => accounts.push({ ...s, id: s.id, accountName: s.name, accountType: "Staff" }));
    processedAccounts.forEach((a) => accounts.push({ ...a, id: a.id, accountName: a.accountName, accountType: a.accountType }));
    processedTaxes.forEach((t) => accounts.push({ ...t, id: t.id, accountName: t.name, accountType: "Tax" }));
    unprocessedExpenseAccounts.forEach((e) => accounts.push({ ...e, id: e.id, accountName: e.name, accountType: "Expense" }));
    return accounts;
  }, [processedParties, processedStaff, processedAccounts, processedTaxes, unprocessedExpenseAccounts]);

  const accountsWithJournal = useMemo(() => {
    if (vouchersLoading || journalVouchers.length === 0) return [];
    const accountIds = new Set<string>();
    journalVouchers.forEach((v) => {
      (v.entries || []).forEach((e: any) => {
        if (e.accountId) accountIds.add(e.accountId);
      });
    });
    return allAccounts.filter((p) => accountIds.has(p.id));
  }, [journalVouchers, allAccounts, vouchersLoading]);

  const totalJournalAmount = useMemo(
    () => journalVouchers.reduce((sum, v) => sum + (v.total || 0), 0),
    [journalVouchers]
  );

  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return journalVouchers.filter((v) =>
      v.entries?.some((e: any) => e.accountId === selectedAccount.id)
    );
  }, [journalVouchers, selectedAccount]);

  const allJournalAccount = useMemo(() => {
    if (!showAllCompanyVouchers) return null;
    return {
      id: "all",
      accountName: "All Journal Vouchers",
      balance: 0,
      openingBalance: 0,
      accountType: "journal_view",
    } as unknown as JournalAccount;
  }, [showAllCompanyVouchers]);

  const currentAccount = showAllCompanyVouchers ? allJournalAccount : selectedAccount;
  const currentTransactions = showAllCompanyVouchers ? journalVouchers : accountTransactions;

  const filteredAccounts = useMemo(
    () =>
      accountsWithJournal.filter((p) =>
        p.accountName.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [accountsWithJournal, searchTerm]
  );

  const REPORT_MEMORY_KEY = "reportJournalState";

  useEffect(() => {
    if (accountsWithJournal.length === 0) return;
    if (hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (isMobile) return; // Mobile: don't auto-select, show list first
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(REPORT_MEMORY_KEY) : null;
      const saved = raw ? (JSON.parse(raw) as { accountId?: string }) : null;
      const accountId = saved?.accountId;
      if (accountId) {
        const found = accountsWithJournal.find((a) => a.id === accountId);
        if (found) {
          setSelectedAccount(found);
          return;
        }
      }
    } catch (_) {}
    setSelectedAccount(accountsWithJournal[0]);
  }, [accountsWithJournal, isMobile]);

  const handleSelectAccount = useCallback((account: JournalAccount) => {
    setShowAllCompanyVouchers(false);
    setSelectedAccount(account);
    try {
      localStorage.setItem(REPORT_MEMORY_KEY, JSON.stringify({ accountId: account.id }));
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
    if (currentAccount) {
      return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div className="p-2 border-b flex-shrink-0 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedAccount(null); setShowAllCompanyVouchers(false); }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="font-semibold truncate">{currentAccount.accountName}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AccountDetails
              account={currentAccount as any}
              allAccounts={allAccounts as any}
              transactions={currentTransactions}
              onAccountUpdated={() => {}}
              onAccountDeleted={() => { setSelectedAccount(null); setShowAllCompanyVouchers(false); }}
              onShowAll={() => setShowAllCompanyVouchers(true)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={userNames}
              journalAccountNames={journalAccountNames}
              isAllVouchersView={showAllCompanyVouchers}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="p-4 border-b space-y-3 flex-shrink-0">
          <h2 className="text-lg font-bold font-headline">Journals</h2>
          <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="journal">
            <PermissionButton permission="create_records" className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> Create Journal Voucher
            </PermissionButton>
          </AddVoucherDialog>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Journal Amount</p>
            <p className="text-xl font-bold text-blue-600">
              {formatCurrency(totalJournalAmount, { noSuffix: true })}
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
          <h3 className="text-sm font-semibold">Accounts involved ({filteredAccounts.length})</h3>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <AccountList
            accounts={filteredAccounts as any}
            onSelectAccount={handleSelectAccount as any}
            selectedAccount={selectedAccount as any}
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
            <h2 className="text-lg font-bold font-headline">Journals</h2>
            <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="journal">
              <PermissionButton permission="create_records" className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" /> Create Journal Voucher
              </PermissionButton>
            </AddVoucherDialog>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Journal Amount</p>
              <p className="text-xl font-bold text-blue-600">
                {formatCurrency(totalJournalAmount, { noSuffix: true })}
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
            <h3 className="text-sm font-semibold">Accounts involved ({filteredAccounts.length})</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AccountList
              accounts={filteredAccounts as any}
              onSelectAccount={handleSelectAccount as any}
              selectedAccount={selectedAccount as any}
              searchTerm={searchTerm}
            />
          </div>
        </div>
        <div className="flex flex-col min-h-0 overflow-hidden">
          {currentAccount ? (
            <AccountDetails
              account={currentAccount as any}
              allAccounts={allAccounts as any}
              transactions={currentTransactions}
              onAccountUpdated={() => {}}
              onAccountDeleted={() => setSelectedAccount(null)}
              onShowAll={() => setShowAllCompanyVouchers(true)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={userNames}
              journalAccountNames={journalAccountNames}
              isAllVouchersView={showAllCompanyVouchers}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <Card className="w-full max-w-md text-center">
                <CardHeader>
                  <CardTitle>Select an account</CardTitle>
                  <CardDescription>
                    Choose an account from the list to view journal transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {accountsWithJournal.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No journal vouchers yet. Create a journal voucher to see accounts here.
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

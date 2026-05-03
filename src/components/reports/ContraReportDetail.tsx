"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Search } from "lucide-react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AccountDetails } from "@/components/account/AccountDetails";
import { AccountList } from "@/components/bank-cash/AccountList";
import { ReportRegisterMobileListChrome } from "@/components/reports/ReportRegisterMobileListChrome";
import type { Account } from "@/components/bank-cash/types";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "next/navigation";

export function ContraReportDetail() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const { formatCurrency, formatCurrencyForPrint } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedAccounts, userNames } = useVouchers();
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllCompanyVouchers, setShowAllCompanyVouchers] = useState(false);
  const hasAutoSelected = useRef(false);

  const contraVouchers = useMemo(() => allVouchers.filter((v) => v.type === "contra"), [allVouchers]);

  const accountsWithContra = useMemo(() => {
    if (vouchersLoading) return [];
    const accountIds = new Set<string>();
    contraVouchers.forEach((v) => {
      if (v.fromAccountId) accountIds.add(v.fromAccountId);
      if (v.toAccountId) accountIds.add(v.toAccountId);
    });
    return processedAccounts.filter((p) => accountIds.has(p.id));
  }, [contraVouchers, processedAccounts, vouchersLoading]);

  const totalContra = useMemo(
    () => contraVouchers.reduce((sum, v) => sum + (v.total || v.amount || 0), 0),
    [contraVouchers]
  );

  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return contraVouchers.filter(
      (v) => v.fromAccountId === selectedAccount.id || v.toAccountId === selectedAccount.id
    );
  }, [contraVouchers, selectedAccount]);

  const allContraAccount = useMemo(() => {
    if (!showAllCompanyVouchers) return null;
    return {
      id: "all",
      accountName: "All Contra Vouchers",
      balance: 0,
      openingBalance: 0,
    };
  }, [showAllCompanyVouchers]);

  const currentAccount = showAllCompanyVouchers ? allContraAccount : selectedAccount;
  const currentTransactions = showAllCompanyVouchers ? contraVouchers : accountTransactions;

  const filteredAccounts = useMemo(
    () =>
      accountsWithContra.filter((p) =>
        p.accountName.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [accountsWithContra, searchTerm]
  );

  const REPORT_MEMORY_KEY = "reportContraState";

  useEffect(() => {
    if (searchParams.get("allVouchers") === "1") {
      if (!hasAutoSelected.current) {
        hasAutoSelected.current = true;
        setShowAllCompanyVouchers(true);
        setSelectedAccount(null);
      }
      return;
    }
    if (accountsWithContra.length === 0) return;
    if (hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (isMobile) return; // Mobile: don't auto-select, show list first
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(REPORT_MEMORY_KEY) : null;
      const saved = raw ? (JSON.parse(raw) as { accountId?: string }) : null;
      const accountId = saved?.accountId;
      if (accountId) {
        const found = accountsWithContra.find((a) => a.id === accountId);
        if (found) {
          setSelectedAccount(found);
          return;
        }
      }
    } catch (_) {}
    setSelectedAccount(accountsWithContra[0]);
  }, [accountsWithContra, isMobile, searchParams]);

  const handleSelectAccount = useCallback((account: Account) => {
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {/* Sticky Party-style chrome + Print/Excel/Date – header AccountDetails ke andar (duplicate top bar hataya). */}
          <AccountDetails
            account={currentAccount as any}
            allAccounts={processedAccounts}
            transactions={currentTransactions}
            onAccountUpdated={() => {}}
            onAccountDeleted={() => {
              setSelectedAccount(null);
              setShowAllCompanyVouchers(false);
            }}
            onShowAll={() => setShowAllCompanyVouchers(true)}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            isAllVouchersView={showAllCompanyVouchers}
            userNames={userNames}
            onBack={() => {
              setSelectedAccount(null);
              setShowAllCompanyVouchers(false);
            }}
            mobileFooterVariant="report"
            mobileReportStickyTitle="Contra"
          />
        </div>
      );
    }
    return (
      <ReportRegisterMobileListChrome
        title="Contra"
        actionSlot={
          <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="contra">
            <PermissionButton permission="create_records" className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> Create Contra Entry
            </PermissionButton>
          </AddVoucherDialog>
        }
        summary={{
          label: "Total Transferred",
          // Mobile chrome expects string totals; desktop card still uses `formatCurrency` (ReactNode)
          amountText: formatCurrencyForPrint(totalContra, { noSuffix: true }),
          amountClassName: "text-blue-600",
        }}
        searchPlaceholder="Search accounts..."
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        listSectionTitle={`Accounts (${filteredAccounts.length})`}
      >
        <AccountList
          accounts={filteredAccounts}
          onSelectAccount={handleSelectAccount}
          selectedAccount={selectedAccount}
          searchTerm={searchTerm}
        />
      </ReportRegisterMobileListChrome>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,max-content)_minmax(0,1fr)] min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 border-r overflow-hidden bg-muted/30">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <h2 className="text-lg font-bold font-headline">Contra</h2>
            <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="contra">
              <PermissionButton permission="create_records" className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" /> Create Contra Entry
              </PermissionButton>
            </AddVoucherDialog>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Transferred</p>
              <p className="text-xl font-bold text-blue-600">
                {formatCurrency(totalContra, { noSuffix: true })}
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
            <h3 className="text-sm font-semibold">Accounts ({filteredAccounts.length})</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AccountList
              accounts={filteredAccounts}
              onSelectAccount={handleSelectAccount}
              selectedAccount={selectedAccount}
              searchTerm={searchTerm}
            />
          </div>
        </div>
        <div className="flex flex-col min-h-0 overflow-hidden">
          {currentAccount ? (
            <AccountDetails
              account={currentAccount as any}
              allAccounts={processedAccounts}
              transactions={currentTransactions}
              onAccountUpdated={() => {}}
              onAccountDeleted={() => setSelectedAccount(null)}
              onShowAll={() => setShowAllCompanyVouchers(true)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              isAllVouchersView={showAllCompanyVouchers}
              userNames={userNames}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <Card className="w-full max-w-md text-center">
                <CardHeader>
                  <CardTitle>Select an account</CardTitle>
                  <CardDescription>
                    Choose an account from the list to view contra transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {accountsWithContra.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No contra entries yet. Create a contra entry to see accounts here.
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

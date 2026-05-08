
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams, useParams, usePathname } from "next/navigation";
import { AccountList } from "@/components/bank-cash/AccountList";
import { AccountDetails } from "@/components/bank-cash/AccountDetails";
import { AccountGroupList } from "@/components/bank-cash/AccountGroupList";
import { AccountGroupDetails } from "@/components/bank-cash/AccountGroupDetails";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";
import { CreateAccountGroupDialog } from "@/components/bank-cash/CreateAccountGroupDialog";
import { useVouchers } from "@/hooks/useVouchers";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DateRange } from "@/components/ui/ad-calendar";
import { isLocalOnlyMode } from "@/lib/localMode";


export default function BankCashPage() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { formatCurrency } = useDate();
  const {
    vouchers,
    loading: vouchersLoading,
    processedAccounts,
    processedAccountGroups: initialProcessedAccountGroups,
    userNames: vouchersUserNames,
  } = useVouchers();
  const router = useRouter();
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const params = useParams();
  
  const [activeView, setActiveView] = useState("accounts");
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<Account | AccountGroup | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [accountDetailsDateRange, setAccountDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);

  const selectedAccount = activeView === 'accounts' ? selected as Account : null;
  const selectedGroup = activeView === 'groups' ? selected as AccountGroup : null;
  
  const handleSetSelected = (item: Account | AccountGroup | null) => {
    setSelected(item);
  };


   const processedAccountGroups = useMemo(() => {
    // Treat both blank groupId and storage ungrouped id as Ungrouped bucket.
    const ungroupedAccounts = processedAccounts.filter(acc => !acc.groupId || acc.groupId === "ungrouped_account");
    if (ungroupedAccounts.length > 0) {
        const ungroupedBalance = ungroupedAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        const ungroupedGroup: AccountGroup = {
            id: 'ungrouped',
            name: 'Ungrouped',
            balance: ungroupedBalance,
            companyId: companyId || '',
            debit: ungroupedAccounts.reduce((sum, acc) => sum + acc.debit, 0),
            credit: ungroupedAccounts.reduce((sum, acc) => sum + acc.credit, 0),
        };
        return [...initialProcessedAccountGroups, ungroupedGroup];
    }
    return initialProcessedAccountGroups;
  }, [processedAccounts, initialProcessedAccountGroups, companyId]);

  
  useEffect(() => {
    // Bank/Cash page: rely on shared voucher user-name map; avoid per-row Firestore user doc fetch loops.
    setUserNames((prev) => {
      const merged = { ...prev };
      let changed = false;
      for (const [uid, name] of Object.entries(vouchersUserNames || {})) {
        const safe = String(name || "").trim();
        if (!safe) continue;
        if (merged[uid] !== safe) {
          merged[uid] = safe;
          changed = true;
        }
      }
      return changed ? merged : prev;
    });
  }, [vouchersUserNames]);

  useEffect(() => {
    const savedView = localStorage.getItem("bankCashActiveView");
    if (savedView) setActiveView(savedView);
  }, []);

  const lastAutoRouteSyncViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAutoRouteSyncViewRef.current === activeView) return;
    lastAutoRouteSyncViewRef.current = activeView;
    localStorage.setItem("bankCashActiveView", activeView);
    setSelected(null);
    const list = activeView === 'accounts' ? processedAccounts : processedAccountGroups;
    if (list.length > 0 && !isMobile) {
      const newPath = activeView === 'accounts' ? `/bank-cash/${list[0].id}` : (list[0].id === 'ungrouped' ? `/bank-cash?view=groups&id=ungrouped` : `/bank-cash/group/${list[0].id}`);
      // Prevent redundant route replace on list refresh; only navigate when target URL differs.
      const currentPathWithQuery =
        pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
      if (currentPathWithQuery !== newPath) router.replace(newPath);
    } else {
      const fallbackPath = `/bank-cash?view=${activeView}`;
      const currentPathWithQuery =
        pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
      if (currentPathWithQuery !== fallbackPath) router.replace(fallbackPath);
    }
  }, [activeView, router, processedAccounts, processedAccountGroups, isMobile, pathname, searchParams]);

  useEffect(() => {
    if (vouchersLoading) return;

    const view = searchParams.get('view') || 'accounts';
    setActiveView(view);

    const idFromPath = params.id as string;
    const idFromQuery = searchParams.get('id');
    const id = idFromPath || idFromQuery;
    
    const list = view === 'accounts' ? processedAccounts : processedAccountGroups;

    if (id) {
        const itemToSelect = list.find(p => p.id === id);
        setSelected(itemToSelect || null);
    } else if (!isMobile && list.length > 0) {
        setSelected(list[0]);
    } else {
        setSelected(null);
    }
  }, [searchParams, params, vouchersLoading, processedAccounts, processedAccountGroups, isMobile]);



  const totalBalance = useMemo(() => {
    return activeView === 'accounts'
      ? processedAccounts.reduce((acc, account) => acc + account.balance, 0)
      : processedAccountGroups.reduce((acc, group) => acc + group.balance, 0);
  }, [activeView, processedAccounts, processedAccountGroups]);

  const handleSelect = (item: Account | AccountGroup) => {
    // Navigation is handled by Link components in the list now
  };
  
  const accountsForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
        // Keep Ungrouped group selection aligned with stored ungrouped ids.
        return processedAccounts.filter(acc => !acc.groupId || acc.groupId === "ungrouped_account");
    }
    return processedAccounts.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedAccounts]);

  if (vouchersLoading) {
    return <LoadingSpinner />;
  }
  
  if (!companyId) {
    return (
         <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8 h-full">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>No Company Selected</CardTitle>
                    <CardDescription>
                        Please select a company to view bank & cash data.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
  }
  
  const listView = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={activeView === 'accounts' ? 'Search accounts...' : 'Search groups...'} className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
        </div>
        {activeView === 'accounts' ? (
          <CreateBankAccountDialog onAccountCreated={(id) => router.push(`/bank-cash/${id}`)} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen}>
            <Button size="sm" onClick={() => setIsCreateAccountOpen(true)}>+ Add Account</Button>
          </CreateBankAccountDialog>
        ) : (
          <CreateAccountGroupDialog onGroupCreated={(id) => router.push(`/bank-cash/group/${id}`)} groups={processedAccountGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
            <Button size="sm" onClick={() => setIsCreateGroupOpen(true)}>+ Add Group</Button>
          </CreateAccountGroupDialog>
        )}
      </div>
       {activeView === 'accounts' ? (
            <AccountList accounts={processedAccounts} onSelectAccount={handleSelect as any} selectedAccount={selectedAccount} searchTerm={searchTerm} />
        ) : (
            <AccountGroupList groups={processedAccountGroups} onSelectGroup={handleSelect as any} selectedGroup={selectedGroup} searchTerm={searchTerm} />
        )}
    </div>
  );

  const detailView = (
    <>
      {activeView === 'accounts' && selectedAccount && (
        <AccountDetails 
            account={selectedAccount} 
            allAccounts={processedAccounts}
            onAccountUpdated={() => {}}
            onAccountDeleted={() => setSelected(null)} 
            dateRange={accountDetailsDateRange}
            onDateRangeChange={setAccountDetailsDateRange}
            userNames={userNames}
          />
      )}
      {activeView === 'groups' && selectedGroup && (
        <AccountGroupDetails
          group={selectedGroup}
          allGroups={processedAccountGroups}
          accounts={accountsForSelectedGroup}
          onGroupUpdated={() => {}}
          onGroupDeleted={() => setSelected(null)}
          onAccountUpdated={() => {}}
          dateRange={groupDetailsDateRange}
          onDateRangeChange={setGroupDetailsDateRange}
          userNames={userNames}
        />
      )}
      {!selected && <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>}
    </>
  );

  return (
    <ResponsiveMasterDetail
      title="Bank & Cash"
      balance={formatCurrency(totalBalance, { showDrCr: true })}
      tabs={
        <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="accounts" className="flex-1">Accounts</TabsTrigger>
            <TabsTrigger value="groups" className="flex-1">Groups</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      listView={listView}
      detailView={detailView}
      isMobile={isMobile}
    />
  );
}

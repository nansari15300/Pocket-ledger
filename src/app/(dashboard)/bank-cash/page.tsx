
"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { AccountList } from "@/components/bank-cash/AccountList";
import { AccountDetails } from "@/components/bank-cash/AccountDetails";
import { AccountGroupList } from "@/components/bank-cash/AccountGroupList";
import { AccountGroupDetails } from "@/components/bank-cash/AccountGroupDetails";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";
import { CreateAccountGroupDialog } from "@/components/bank-cash/CreateAccountGroupDialog";
import { PermissionButton } from "@/components/permission";
import { useVouchers } from "@/hooks/useVouchers";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import usePermissions from "@/hooks/usePermissions";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";

function BankCashPageContent() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { formatCurrency, formatRunning } = useDate();
  const { vouchers, loading: vouchersLoading, processedAccounts, processedAccountGroups: initialProcessedAccountGroups, userNames } = useVouchers();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    company?.notificationSettings?.approve?.on !== false &&
    company?.notificationSettings?.approve?.onList !== false;
  const pendingApprovalByAccountId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      const ids = Array.from(new Set([v.fromAccountId, v.toAccountId, v.accountId].filter(Boolean)));
      ids.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, showApproveOnList]);
  const pendingApprovalByAccountGroupId = useMemo(() => {
    if (!showApproveOnList) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    processedAccounts.forEach((a: any) => {
      const groupId = a.groupId || "ungrouped";
      map[groupId] = (map[groupId] || 0) + (pendingApprovalByAccountId[a.id] || 0);
    });
    return map;
  }, [processedAccounts, pendingApprovalByAccountId, showApproveOnList]);
  
  const [activeView, setActiveView] = useState("accounts");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<Account | AccountGroup>(`bank_cash_view_${activeView}`);
  const useQueryNav = useMasterDetailQueryNav();

  // Detail → list: replace + Android hardware back (push le history double hunchha)
  const onBackToList = useCallback(() => {
    setSelected(null);
    router.replace(masterDetailListHref("bank-cash"), { scroll: false });
  }, [setSelected, router]);
  useRegisterMasterDetailHardwareBack(onBackToList, isMobile && !!selected);

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [accountDetailsDateRange, setAccountDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);

  const selectedAccount = activeView === 'accounts' ? selected as Account : null;
  const selectedGroup = activeView === 'groups' ? selected as AccountGroup : null;
  useSyncMasterDetailHeaderId("bank-cash", selectedAccount?.id ?? selectedGroup?.id ?? null);
  
   const processedAccountGroups = useMemo(() => {
    const canViewSpecialBalance = can('view_special_account_balance');
    const accountsForUngrouped = processedAccounts.filter((acc: any) => {
        if (!acc.groupId || acc.groupId === "ungrouped_account") {
            return !acc.isSpecial || canViewSpecialBalance;
        }
        return false;
    });

    const ungroupedBalance = accountsForUngrouped.reduce((sum, acc) => sum + acc.balance, 0);

    const initialGroupsWithChildData = initialProcessedAccountGroups
        .filter((group: any) => {
          if (group.isAutoUngrouped === true) return false;
          if (group.isReportOnly === true || group.isSystemReserved === true) return false;
          if (isSystemParentGroup("account_groups", group.id)) return false;
          return true;
        })
        .map(group => {
        const accountsInGroup = processedAccounts.filter(acc => acc.groupId === group.id);
        const hasSpecial = accountsInGroup.some(acc => acc.isSpecial);
        const balance = canViewSpecialBalance || !hasSpecial 
            ? accountsInGroup.reduce((sum, acc) => sum + acc.balance, 0)
            : '*****';
        return { ...group, hasSpecial, balance };
    });

    if (accountsForUngrouped.length > 0) {
        const ungroupedGroup: any = {
            id: 'ungrouped',
            name: 'Ungrouped',
            balance: ungroupedBalance,
            companyId: companyId || '',
            debit: accountsForUngrouped.reduce((sum, acc) => sum + acc.debit, 0),
            credit: accountsForUngrouped.reduce((sum, acc) => sum + acc.credit, 0),
            hasSpecial: false,
        };
        return [...initialGroupsWithChildData, ungroupedGroup];
    }
    return initialGroupsWithChildData;
  }, [processedAccounts, initialProcessedAccountGroups, companyId, can]);


  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "bankCashPageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'accounts' ? processedAccounts : processedAccountGroups, 
    vouchersLoading           
  );
  // ==================================

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
  }, [companyId]);

  // Restore selection when returning from details (e.g. /bank-cash?selected=xyz or /bank-cash?view=groups&selected=xyz)
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedAccountGroups.find((i) => i.id === selectedIdFromUrl);
    const accountItem = processedAccounts.find((i) => i.id === selectedIdFromUrl);
    const item = groupItem || accountItem;
    if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (accountItem) setActiveView("accounts");
    if (item) setSelected(item);
    const canonical =
      viewFromUrl === "groups"
        ? `/bank-cash?view=groups&selected=${encodeURIComponent(selectedIdFromUrl)}`
        : `/bank-cash?selected=${encodeURIComponent(selectedIdFromUrl)}`;
    router.replace(canonical, { scroll: false });
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, processedAccounts, processedAccountGroups, setSelected, setActiveView, router]);
  
  // Initial Mount Safety
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
    }
  }, []);
  
  const totalBalance = useMemo(() => {
    const canViewSpecialBalance = can('view_special_account_balance');
    
    if (activeView === 'accounts') {
        const accountsToSum = processedAccounts.filter(acc => !acc.isSpecial || canViewSpecialBalance);
        return accountsToSum.reduce((acc, account) => acc + account.balance, 0);
    } 
    // activeView === 'groups'
    return processedAccountGroups
      .filter((g) => {
        const anyG = g as any;
        const isSystemParent =
          anyG.isSystemReserved === true ||
          isSystemParentGroup("account_groups", anyG.id);
        return typeof g.balance === "number" && !isSystemParent;
      })
      .reduce((acc, group) => acc + (group.balance as number), 0);
  }, [activeView, processedAccounts, processedAccountGroups, can]);


  const handleSelect = (item: Account | AccountGroup) => {
    if (useQueryNav) {
        // Static export ke liye query params – /bank-cash/[id] path refresh/redirect de sakta hai
        const path = 'accountName' in item ? `/bank-cash?selected=${item.id}` : `/bank-cash?view=groups&selected=${item.id}`;
        router.push(path);
    } else {
        setSelected(item);
    }
  };
  
  const accountsForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
        return processedAccounts.filter((acc: any) => !acc.groupId || acc.groupId === "ungrouped_account");
    }
    return processedAccounts.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedAccounts]);

  // Filtered group count (matches AccountGroupList: search + exclude report-only + exclude system groups)
  const filteredGroupCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (processedAccountGroups || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true) return false;
      const isSystemParent = anyG.isSystemReserved === true || isSystemParentGroup("account_groups", anyG.id);
      if (isSystemParent) return false;
      return g.name && (searchLower ? g.name.toLowerCase().includes(searchLower) : true);
    }).length;
  }, [processedAccountGroups, searchTerm]);

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
        {activeView === "accounts" ? (
          <CreateBankAccountDialog onAccountCreated={(id) => handleSelect({ id, accountName: "" } as Account)} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen}>
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateAccountOpen(true)}>
              + Add Account
            </PermissionButton>
          </CreateBankAccountDialog>
        ) : (
          <CreateAccountGroupDialog onGroupCreated={(id) => handleSelect({ id, name: "" } as AccountGroup)} groups={processedAccountGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateGroupOpen(true)}>
              + Add Group
            </PermissionButton>
          </CreateAccountGroupDialog>
        )}
      </div>
       {activeView === 'accounts' ? (
            <>
              <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <Landmark className="h-4 w-4" />
                <span>Accounts ({processedAccounts.length})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AccountList accounts={processedAccounts} onSelectAccount={handleSelect as any} selectedAccount={selectedAccount} searchTerm={searchTerm} pendingApprovalByAccountId={pendingApprovalByAccountId} getItemHref={useQueryNav ? (a) => `/bank-cash?selected=${a.id}` : undefined} />
              </div>
            </>
        ) : (
            <>
              <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <Landmark className="h-4 w-4" />
                <span>Groups ({filteredGroupCount})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AccountGroupList groups={processedAccountGroups} onSelectGroup={handleSelect as any} selectedGroup={selectedGroup} searchTerm={searchTerm} pendingApprovalByGroupId={pendingApprovalByAccountGroupId} getItemHref={useQueryNav ? (g) => `/bank-cash?view=groups&selected=${g.id}` : undefined} />
              </div>
            </>
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
      balance={
        <span className={cn(
            "font-semibold",
            // >= 0 (Debit/Bank) Green, < 0 (Credit/Overdraft) Red
            totalBalance >= 0 ? "text-green-600" : "text-red-600"
        )}>
            {formatRunning(totalBalance)}
        </span>
      }
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
      mobileListOnly={true}
      hasSelectedItem={!!selected}
      onBackToList={onBackToList}
    />
  );
}

export default function BankCashPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<LoadingSpinner />}>
      <BankCashPageContent />
    </Suspense>
  );
}

    
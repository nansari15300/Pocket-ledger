
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
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
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
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { collectBankAccountIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesBankLedger";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";

function BankCashPageContent() {
  const { user } = useAuth();
  const { company, companyId, effectiveNotificationSettings } = useCompany();
  const { formatCurrency, formatRunning } = useDate();
  const { vouchers, loading: vouchersLoading, processedAccounts, processedAccountGroups: initialProcessedAccountGroups, userNames } = useVouchers();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  const isInitialMount = useRef(true);
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false &&
    effectiveNotificationSettings?.approve?.onList !== false;
  const pendingApprovalByAccountId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !processedAccounts?.length) return {} as Record<string, number>;
    const accountIdSet = new Set(processedAccounts.map((a: Account) => a.id));
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      const touched = collectBankAccountIdsTouchedByUnapprovedVoucher(v, accountIdSet);
      touched.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, showApproveOnList, processedAccounts]);
  const pendingApprovalByAccountGroupId = useMemo(() => {
    if (!showApproveOnList) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    processedAccounts.forEach((a: any) => {
      const n = pendingApprovalByAccountId[a.id] || 0;
      if (!n) return;
      // Synthetic `AccountGroupList` row `id: 'ungrouped'` — `ungrouped_account` bucket yahi
      const gid =
        a.groupId && String(a.groupId).trim() !== "" && a.groupId !== "ungrouped_account"
          ? a.groupId
          : "ungrouped";
      map[gid] = (map[gid] || 0) + n;
    });
    return map;
  }, [processedAccounts, pendingApprovalByAccountId, showApproveOnList]);
  /** Toolbar pink box total: jitne unapproved vouchers kisi bank account ko touch karte hain */
  const totalPendingApprovalVoucherCount = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !processedAccounts?.length) return 0;
    const accountIdSet = new Set(processedAccounts.map((a: Account) => a.id));
    let n = 0;
    for (const v of vouchers as any[]) {
      if (v?.isApproved === true) continue;
      if (collectBankAccountIdsTouchedByUnapprovedVoucher(v, accountIdSet).size > 0) n += 1;
    }
    return n;
  }, [vouchers, showApproveOnList, processedAccounts]);
  
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
  /** Accounts tab: pink count click → sirf jinke paas pending approval */
  const [showOnlyAccountsWithPendingApproval, setShowOnlyAccountsWithPendingApproval] = useState(false);
  const [showOnlyGroupsWithPendingApproval, setShowOnlyGroupsWithPendingApproval] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [accountDetailsDateRange, setAccountDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);
  /** Mobile: AccountDetails se voucher count — master-detail title row me dikhane ke liye */
  const [bankMobileVoucherStats, setBankMobileVoucherStats] = useState<{ showing: number; total: number } | null>(null);

  const selectedAccount = activeView === 'accounts' ? selected as Account : null;
  const selectedGroup = activeView === 'groups' ? selected as AccountGroup : null;
  // Account row = `accountName`; group row = `name` — sirf `.name` se bank detail header khali rehta tha
  const mobileBankCashSelectionLabel = useMemo(() => {
    if (!selected) return null;
    if (activeView === "accounts") {
      const nm = (selected as Account).accountName;
      return nm && String(nm).trim() ? String(nm).trim() : null;
    }
    const nm = (selected as AccountGroup).name;
    return nm && String(nm).trim() ? String(nm).trim() : null;
  }, [selected, activeView]);
  const mobileBankCashSelectionLabelClassName = useMemo(() => {
    if (!selected) return undefined;
    return masterDetailBalanceToneClass((selected as Account | AccountGroup).balance);
  }, [selected]);
  const bankCashMasterDetailTitle = activeView === "groups" ? "Bank Groups" : "Bank & Cash";
  useSyncMasterDetailHeaderId("bank-cash", selectedAccount?.id ?? selectedGroup?.id ?? null);

  useEffect(() => {
    if (!isMobile || activeView !== "accounts") setBankMobileVoucherStats(null);
  }, [isMobile, activeView, selectedAccount?.id]);

  const mobileBankDetailHeaderEnd = useMemo(() => {
    if (!isMobile || !selected) return null;
    const selectedEntity = selected as Account | AccountGroup;
    // Union-safe label: account uses `accountName`, group uses `name`.
    const name =
      activeView === "accounts"
        ? (String((selectedEntity as Account).accountName || "").trim() || "Account")
        : (String((selectedEntity as AccountGroup).name || "").trim() || "Account");
    const fileUrl = String((selectedEntity as any).fileUrl || "").trim();
    const initials = String(name)
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NA";
    const openPreview = () => {
      // Bank/Cash mobile header avatar: tap for full preview.
      if (!fileUrl) return;
      void openAttachmentInApp(fileUrl, { title: String(name) });
    };
    return (
      <div className="h-8 w-8 border-l border-border flex items-center justify-center p-px">
        <EntityFileAttachmentHover fileUrl={fileUrl} triggerClassName="inline-flex rounded-full">
          <button
            type="button"
            className="inline-flex h-full w-full items-center justify-center rounded-full"
            onClick={openPreview}
            aria-label={`Preview ${name} avatar`}
          >
            <ResolvedEntityAvatar
              className="h-full w-full text-xs"
              src={fileUrl}
              alt={String(name)}
              fallbackText={initials}
            />
          </button>
        </EntityFileAttachmentHover>
      </div>
    );
  }, [isMobile, selected, activeView]);
  
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
    vouchersLoading,
    undefined,
    selectedIdFromUrl
  );
  // ==================================

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
  }, [companyId]);
  useEffect(() => {
    setShowOnlyAccountsWithPendingApproval(false);
    setShowOnlyGroupsWithPendingApproval(false);
  }, [companyId]);
  useEffect(() => {
    if (activeView !== "accounts") setShowOnlyAccountsWithPendingApproval(false);
    if (activeView !== "groups") setShowOnlyGroupsWithPendingApproval(false);
  }, [activeView]);

  const accountsForAccountList = useMemo(() => {
    if (!showOnlyAccountsWithPendingApproval || !showApproveOnList) return processedAccounts;
    return processedAccounts.filter((a) => (pendingApprovalByAccountId[a.id] ?? 0) > 0);
  }, [processedAccounts, showOnlyAccountsWithPendingApproval, showApproveOnList, pendingApprovalByAccountId]);
  // Header count: `AccountList` jaisa — search + special-account permission
  const filteredAccountListCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    const canViewSpecialAccount = can("view_special_bank_accounts");
    return accountsForAccountList.filter((account) => {
      if (account.isSpecial && !canViewSpecialAccount) return false;
      return !!(account.accountName && account.accountName.toLowerCase().includes(searchLower));
    }).length;
  }, [accountsForAccountList, searchTerm, can]);

  // Restore selection when returning from details (e.g. /bank-cash?selected=xyz or /bank-cash?view=groups&selected=xyz)
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedAccountGroups.find((i) => i.id === selectedIdFromUrl);
    const accountItem = processedAccounts.find((i) => i.id === selectedIdFromUrl);
    if (groupItem && accountItem) {
      if (viewFromUrl === "groups") setActiveView("groups");
      else setActiveView("accounts");
    } else if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (accountItem) setActiveView("accounts");
    else if (groupItem) setActiveView("groups");
    const item =
      groupItem && accountItem
        ? viewFromUrl === "groups"
          ? groupItem
          : accountItem
        : groupItem || accountItem;
    if (item) setSelected(item);
    const canonical =
      viewFromUrl === "groups"
        ? `/bank-cash?view=groups&selected=${encodeURIComponent(selectedIdFromUrl)}`
        : `/bank-cash?selected=${encodeURIComponent(selectedIdFromUrl)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
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

  const processedAccountGroupsForList = useMemo(() => {
    if (!showOnlyGroupsWithPendingApproval || !showApproveOnList) return processedAccountGroups;
    return processedAccountGroups.filter((g) => (pendingApprovalByAccountGroupId[g.id] ?? 0) > 0);
  }, [
    processedAccountGroups,
    showOnlyGroupsWithPendingApproval,
    showApproveOnList,
    pendingApprovalByAccountGroupId,
  ]);

  // Filtered group count (matches AccountGroupList: search + exclude report-only + exclude system groups)
  const filteredGroupCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (processedAccountGroupsForList || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true) return false;
      const isSystemParent = anyG.isSystemReserved === true || isSystemParentGroup("account_groups", anyG.id);
      if (isSystemParent) return false;
      return g.name && (searchLower ? g.name.toLowerCase().includes(searchLower) : true);
    }).length;
  }, [processedAccountGroupsForList, searchTerm]);

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
        {/* `min-w-0`: flex row me search shrink ho sake; badge Add ke beech party/staff page jaisa */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={activeView === 'accounts' ? 'Search accounts...' : 'Search groups...'} className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
        </div>
        {activeView === "accounts" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
          <PendingApprovalListFilterBadge
            count={totalPendingApprovalVoucherCount}
            pressed={showOnlyAccountsWithPendingApproval}
            onToggle={() => setShowOnlyAccountsWithPendingApproval((v) => !v)}
            tooltipFilterHint={`Only accounts with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
            tooltipShowAllHint="Show all accounts (click)"
            ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
            ariaLabelShowAll="Show all accounts"
          />
        ) : null}
        {activeView === "groups" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
          <PendingApprovalListFilterBadge
            count={totalPendingApprovalVoucherCount}
            pressed={showOnlyGroupsWithPendingApproval}
            onToggle={() => setShowOnlyGroupsWithPendingApproval((v) => !v)}
            tooltipFilterHint={`Only groups with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
            tooltipShowAllHint="Show all groups (click)"
            ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
            ariaLabelShowAll="Show all groups"
          />
        ) : null}
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
                <span>Accounts ({filteredAccountListCount})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AccountList accounts={accountsForAccountList} onSelectAccount={handleSelect as any} selectedAccount={selectedAccount} searchTerm={searchTerm} pendingApprovalByAccountId={pendingApprovalByAccountId} getItemHref={useQueryNav ? (a) => `/bank-cash?selected=${a.id}` : undefined} />
              </div>
            </>
        ) : (
            <>
              <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <Landmark className="h-4 w-4" />
                <span>Groups ({filteredGroupCount})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AccountGroupList groups={processedAccountGroupsForList} onSelectGroup={handleSelect as any} selectedGroup={selectedGroup} searchTerm={searchTerm} pendingApprovalByGroupId={pendingApprovalByAccountGroupId} getItemHref={useQueryNav ? (g) => `/bank-cash?view=groups&selected=${g.id}` : undefined} />
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
            onMobileVoucherListStatsChange={isMobile ? setBankMobileVoucherStats : undefined}
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
      title={bankCashMasterDetailTitle}
      mobileSelectionLabel={mobileBankCashSelectionLabel}
      mobileSelectionLabelClassName={mobileBankCashSelectionLabelClassName}
      mobileDetailHeaderEnd={mobileBankDetailHeaderEnd}
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

    
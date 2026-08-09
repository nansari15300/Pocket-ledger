
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
import { mlc } from "@/lib/mobileListChrome";
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
import { resolveMasterListSelection } from "@/lib/masterEntityLiveUpdate";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { bankAccountDisplayName } from "@/lib/bankAccountDisplayName";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import {
  masterDetailTabHref,
  masterDetailCanonicalHref,
  replaceMasterDetailTabUrl,
  tabSwitchSelection,
  pickRememberedListSelection,
  writeMasterDetailPageState,
  readMasterDetailLocationQuery,
} from "@/lib/masterDetailTabChange";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import usePermissions from "@/hooks/usePermissions";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { collectBankAccountIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesBankLedger";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";
import { BankLedgerDrCrPerspectiveSwitch } from "@/components/bank-cash/BankLedgerDrCrPerspectiveSwitch";
import { useBankLedgerDrCrPerspective } from "@/hooks/useBankLedgerDrCrPerspective";
import { flipLedgerSignedBalance } from "@/lib/bankLedgerDrCrPerspective";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { usePendingApprovalListFilter } from "@/hooks/usePendingApprovalListFilter";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import { type EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";

function BankCashPageContent() {
  const { user } = useAuth();
  const { company, companyId, effectiveNotificationSettings } = useCompany();
  const { formatCurrency, formatRunning } = useDate();
  const { perspective: bankDrCrPerspective, setPerspective: setBankDrCrPerspective } =
    useBankLedgerDrCrPerspective();
  const { vouchers, loading: vouchersLoading, processedAccounts, processedAccountGroups: initialProcessedAccountGroups, userNames } = useVouchers();
  const pageColdLoading = vouchersLoading && processedAccounts.length === 0;
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  const isInitialMount = useRef(true);
  /** Tab switch — stale `useSearchParams` ignore (Party jaisa). */
  const pendingBankSelectIdRef = useRef<string | null>(null);
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
    const href = masterDetailListHref("bank-cash");
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState(window.history.state, "", href);
      } catch {
        /* ignore */
      }
    }
    router.replace(href, { scroll: false });
  }, [setSelected, router]);
  useRegisterMasterDetailHardwareBack("bank-cash", onBackToList);

  const [searchTerm, setSearchTerm] = useState("");
  const [accountListQuickFilter, setAccountListQuickFilter] = useState<EntityListQuickFilter>("default");
  const [groupListQuickFilter, setGroupListQuickFilter] = useState<EntityListQuickFilter>("default");
  /** Accounts tab: pink count click → sirf jinke paas pending approval */
  const {
    showOnlyEntities: showOnlyAccountsWithPendingApproval,
    setShowOnlyEntities: setShowOnlyAccountsWithPendingApproval,
    showOnlyGroups: showOnlyGroupsWithPendingApproval,
    setShowOnlyGroups: setShowOnlyGroupsWithPendingApproval,
  } = usePendingApprovalListFilter(totalPendingApprovalVoucherCount);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [accountDetailsDateRange, setAccountDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);
  /** Mobile: AccountDetails se voucher count — master-detail title row me dikhane ke liye */
  const [bankMobileVoucherStats, setBankMobileVoucherStats] = useState<{ showing: number; total: number } | null>(null);

  // `clearing` tab bhi account detail use karta hai.
  const selectedAccountRaw = activeView !== 'groups' ? selected as Account : null;
  const selectedAccount = useMemo(
    () => resolveMasterListSelection(selectedAccountRaw, processedAccounts),
    [selectedAccountRaw, processedAccounts]
  );
  const selectedGroup = activeView === 'groups' ? selected as AccountGroup : null;
  const handleAccountUpdated = useCallback((patch?: Partial<Account>) => {
    if (!patch?.id || !selectedAccountRaw || selectedAccountRaw.id !== patch.id) return;
    setSelected({ ...selectedAccountRaw, ...patch });
  }, [setSelected, selectedAccountRaw]);
  // Account row = `accountName`; group row = `name` — sirf `.name` se bank detail header khali rehta tha
  const mobileBankCashSelectionLabel = useMemo(() => {
    if (!selected) return null;
    if (activeView !== "groups") {
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
    if (!isMobile || activeView === "groups") setBankMobileVoucherStats(null);
  }, [isMobile, activeView, selectedAccount?.id]);

  const mobileBankDetailHeaderEnd = useMemo(() => {
    if (!isMobile || !selected) return null;
    const selectedEntity = selected as Account | AccountGroup;
    // Union-safe label: account uses `accountName`, group uses `name`.
    const name =
      activeView !== "groups"
        ? (String((selectedEntity as Account).accountName || "").trim() || "Account")
        : (String((selectedEntity as AccountGroup).name || "").trim() || "Account");
    const attachmentUrl = trimEntityFileUrlForPreview((selectedEntity as any).fileUrl);
    const initials = String(name)
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NA";
    const openPreview = () => {
      // Bank/Cash mobile header avatar: tap for full preview.
      if (!attachmentUrl) return;
      void openAttachmentInApp(attachmentUrl, { title: String(name) });
    };
    return (
      <div className="h-8 w-8 border-l border-border flex items-center justify-center p-px">
        <EntityFileAttachmentHover fileUrl={attachmentUrl} triggerClassName="inline-flex rounded-full">
          <button
            type="button"
            className="inline-flex h-full w-full items-center justify-center rounded-full"
            onClick={openPreview}
            aria-label={`Preview ${name} avatar`}
          >
            <ResolvedEntityAvatar
              className="h-full w-full text-xs"
              src={attachmentUrl ?? undefined}
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
    activeView === 'groups' ? processedAccountGroups : processedAccounts, 
    vouchersLoading,
    isMobile, // static PC: pehli account auto-select — `useQueryNav` URL sync ke liye alag
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
    // Accounts tab: clearing accounts ko yahan hide rakho (wo sirf Clearing A/c tab me dikhte hain).
    const nonClearingAccounts = processedAccounts.filter((a) => a.isClearing !== true);
    if (!showOnlyAccountsWithPendingApproval || !showApproveOnList) return nonClearingAccounts;
    return nonClearingAccounts.filter((a) => (pendingApprovalByAccountId[a.id] ?? 0) > 0);
  }, [processedAccounts, showOnlyAccountsWithPendingApproval, showApproveOnList, pendingApprovalByAccountId]);
  // Clearing tab: sirf bank/cash accounts jinke form me `isClearing` tick hai.
  const clearingAccountsForList = useMemo(() => {
    return processedAccounts.filter((a) => a.isClearing === true);
  }, [processedAccounts]);

  /** Party-style tab switch — set view + row + URL together (EXE/APK stale ?selected= snap-back band). */
  const handleBankCashTabChange = useCallback(
    (value: string) => {
      const tab = value === "groups" || value === "clearing" ? value : "accounts";
      const items =
        tab === "groups"
          ? processedAccountGroups
          : tab === "clearing"
            ? clearingAccountsForList
            : accountsForAccountList;
      const nextSelected = tabSwitchSelection(
        isMobile,
        pickRememberedListSelection("bankCashPageState", tab, items)
      );
      pendingBankSelectIdRef.current = nextSelected?.id ?? null;
      setActiveView(tab);
      setSelected(nextSelected);
      const href = isMobile
        ? masterDetailTabHref("bank-cash", { tab, defaultTab: "accounts", listOnly: true })
        : masterDetailCanonicalHref("bank-cash", {
            tab,
            defaultTab: "accounts",
            selectedId: nextSelected?.id ?? null,
          });
      replaceMasterDetailTabUrl(href, router, useQueryNav);
      writeMasterDetailPageState("bankCashPageState", tab, nextSelected?.id);
    },
    [
      isMobile,
      useQueryNav,
      processedAccountGroups,
      clearingAccountsForList,
      accountsForAccountList,
      setActiveView,
      setSelected,
      router,
    ]
  );

  // Header count: `AccountList` jaisa — search + special-account permission
  const filteredAccountListCount = useMemo(() => {
    const canViewSpecialAccount = can("view_special_bank_accounts");
    return accountsForAccountList.filter((account) => {
      if (account.isSpecial && !canViewSpecialAccount) return false;
      const label = bankAccountDisplayName(account);
      return !!(label && masterEntityTextMatchesSearch(label, searchTerm));
    }).length;
  }, [accountsForAccountList, searchTerm, can]);
  const filteredClearingAccountListCount = useMemo(() => {
    const canViewSpecialAccount = can("view_special_bank_accounts");
    return clearingAccountsForList.filter((account) => {
      if (account.isSpecial && !canViewSpecialAccount) return false;
      const label = bankAccountDisplayName(account);
      return !!(label && masterEntityTextMatchesSearch(label, searchTerm));
    }).length;
  }, [clearingAccountsForList, searchTerm, can]);

  // Location-first URL sync (Party jaisa) — stale searchParams.view=groups se Accounts tab mat khicho.
  useEffect(() => {
    if (vouchersLoading) return;
    const { view, selectedId } = readMasterDetailLocationQuery();
    const pendingId = pendingBankSelectIdRef.current;
    if (pendingId) {
      if (selectedId === pendingId) pendingBankSelectIdRef.current = null;
      else if (selected?.id === pendingId) return;
    }

    if (!selectedId) {
      if (view === "groups") {
        if (activeView !== "groups") setActiveView("groups");
      } else if (view === "clearing") {
        if (activeView !== "clearing") setActiveView("clearing");
      } else if (activeView !== "accounts") {
        setActiveView("accounts");
      }
      return;
    }

    const groupItem = processedAccountGroups.find((i) => i.id === selectedId);
    const accountItem = processedAccounts.find((i) => i.id === selectedId);
    if (view === "groups" && groupItem) setActiveView("groups");
    else if (view === "clearing" && accountItem) setActiveView("clearing");
    else if (view === "accounts" && accountItem) setActiveView("accounts");
    const item =
      groupItem && accountItem
        ? view === "groups"
          ? groupItem
          : accountItem
        : groupItem || accountItem;
    if (item && selected?.id !== item.id) setSelected(item);
    const canonical =
      view === "groups"
        ? `/bank-cash?view=groups&selected=${encodeURIComponent(selectedId)}`
        : view === "clearing"
          ? `/bank-cash?view=clearing&selected=${encodeURIComponent(selectedId)}`
          : `/bank-cash?selected=${encodeURIComponent(selectedId)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
  }, [
    selectedIdFromUrl,
    viewFromUrl,
    vouchersLoading,
    processedAccounts,
    processedAccountGroups,
    selected?.id,
    activeView,
    setSelected,
    setActiveView,
    router,
  ]);
  
  // Initial Mount Safety
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
    }
  }, []);
  
  const totalBalance = useMemo(() => {
    const canViewSpecialBalance = can('view_special_account_balance');
    
    if (activeView !== 'groups') {
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

  const displayTotalBalance = useMemo(() => {
    if (activeView === "groups") return totalBalance;
    return flipLedgerSignedBalance(totalBalance, bankDrCrPerspective);
  }, [activeView, totalBalance, bankDrCrPerspective]);

  const handleSelect = useCallback((item: Account | AccountGroup) => {
    if (useQueryNav) {
        // Static export ke liye query params – /bank-cash/[id] path refresh/redirect de sakta hai
        const path = 'accountName' in item ? `/bank-cash?selected=${item.id}` : `/bank-cash?view=groups&selected=${item.id}`;
        router.push(path);
    } else {
        setSelected(item);
    }
  }, [useQueryNav, router, setSelected]);

  /** Stable href — har render naya inline fn list ko re-mount kara ref loop */
  const getAccountItemHref = useCallback(
    (a: Account) => `/bank-cash?selected=${a.id}`,
    []
  );
  const getGroupItemHref = useCallback(
    (g: AccountGroup) => `/bank-cash?view=groups&selected=${g.id}`,
    []
  );
  
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
    return (processedAccountGroupsForList || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true) return false;
      const isSystemParent = anyG.isSystemReserved === true || isSystemParentGroup("account_groups", anyG.id);
      if (isSystemParent) return false;
      return g.name && masterEntityTextMatchesSearch(g.name, searchTerm);
    }).length;
  }, [processedAccountGroupsForList, searchTerm]);

  if (pageColdLoading) {
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
  
  const bankTabsEl = (
    <Tabs value={activeView} onValueChange={handleBankCashTabChange} className="w-full">
      <TabsList listChrome>
        <TabsTrigger listChrome value="accounts" className="flex-1">Accounts</TabsTrigger>
        <TabsTrigger listChrome value="groups" className="flex-1">Groups</TabsTrigger>
        <TabsTrigger listChrome value="clearing" className="flex-1">Clearing A/c</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const bankSearchRowEl = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input placeholder={activeView === 'groups' ? 'Search groups...' : 'Search accounts...'} listChrome listChromeSearch value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
      </div>
      {activeView === "accounts" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
        <PendingApprovalListFilterBadge compact
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
        <PendingApprovalListFilterBadge compact
          count={totalPendingApprovalVoucherCount}
          pressed={showOnlyGroupsWithPendingApproval}
          onToggle={() => setShowOnlyGroupsWithPendingApproval((v) => !v)}
          tooltipFilterHint={`Only groups with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
          tooltipShowAllHint="Show all groups (click)"
          ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
          ariaLabelShowAll="Show all groups"
        />
      ) : null}
      {activeView === "groups" ? (
        <CreateAccountGroupDialog onGroupCreated={(id) => handleSelect({ id, name: "" } as AccountGroup)} groups={processedAccountGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateGroupOpen(true)}>
            + Add Group
          </PermissionButton>
        </CreateAccountGroupDialog>
      ) : (
        <CreateBankAccountDialog onAccountCreated={(id) => handleSelect({ id, accountName: "" } as Account)} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateAccountOpen(true)}>
            + Add Account
          </PermissionButton>
        </CreateBankAccountDialog>
      )}
    </div>
  );

  const bankDrCrSwitchEl = (
    <BankLedgerDrCrPerspectiveSwitch
      perspective={bankDrCrPerspective}
      onPerspectiveChange={setBankDrCrPerspective}
      className="ml-auto shrink-0"
    />
  );

  const bankSectionLabelEl =
    activeView === "accounts" ? (
      <div className={cn(mlc.sectionLabelRow, "justify-between", isMobile && "px-[2px]")}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Landmark className={mlc.sectionIcon} />
          <span>Accounts ({filteredAccountListCount})</span>
        </div>
        {bankDrCrSwitchEl}
      </div>
    ) : activeView === "clearing" ? (
      <div className={cn(mlc.sectionLabelRow, "justify-between", isMobile && "px-[2px]")}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Landmark className={mlc.sectionIcon} />
          <span>Clearing A/c ({filteredClearingAccountListCount})</span>
        </div>
        {bankDrCrSwitchEl}
      </div>
    ) : (
      <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
        <Landmark className={mlc.sectionIcon} />
        <span>Groups ({filteredGroupCount})</span>
      </div>
    );

  const listView = (
    <MasterListViewShell
      isMobile={isMobile}
      searchRow={bankSearchRowEl}
      sectionLabel={bankSectionLabelEl}
      tabs={bankTabsEl}
      quickFilter={activeView === "groups" ? groupListQuickFilter : accountListQuickFilter}
      onQuickFilterChange={activeView === "groups" ? setGroupListQuickFilter : setAccountListQuickFilter}
    >
      {activeView === "accounts" ? (
        <AccountList
          accounts={accountsForAccountList}
          onSelectAccount={handleSelect as any}
          selectedAccount={selectedAccount}
          searchTerm={searchTerm}
          pendingApprovalByAccountId={pendingApprovalByAccountId}
          getItemHref={useQueryNav ? getAccountItemHref : undefined}
          quickFilter={accountListQuickFilter}
          onQuickFilterChange={setAccountListQuickFilter}
          hideQuickFilterBar
        />
      ) : activeView === "clearing" ? (
        <AccountList
          accounts={clearingAccountsForList}
          onSelectAccount={handleSelect as any}
          selectedAccount={selectedAccount}
          searchTerm={searchTerm}
          pendingApprovalByAccountId={pendingApprovalByAccountId}
          getItemHref={useQueryNav ? getAccountItemHref : undefined}
          quickFilter={accountListQuickFilter}
          onQuickFilterChange={setAccountListQuickFilter}
          hideQuickFilterBar
        />
      ) : (
        <AccountGroupList
          groups={processedAccountGroupsForList}
          onSelectGroup={handleSelect as any}
          selectedGroup={selectedGroup}
          searchTerm={searchTerm}
          pendingApprovalByGroupId={pendingApprovalByAccountGroupId}
          getItemHref={useQueryNav ? getGroupItemHref : undefined}
          quickFilter={groupListQuickFilter}
          onQuickFilterChange={setGroupListQuickFilter}
          hideQuickFilterBar
        />
      )}
    </MasterListViewShell>
  );

  const detailView = (
    <>
      {activeView !== 'groups' && selectedAccount && (
        <AccountDetails 
            account={selectedAccount} 
            allAccounts={processedAccounts}
            onAccountUpdated={handleAccountUpdated}
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
          onAccountUpdated={handleAccountUpdated}
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
            displayTotalBalance >= 0 ? "text-green-600" : "text-red-600"
        )}>
            {formatRunning(displayTotalBalance)}
        </span>
      }
      tabs={isMobile ? undefined : bankTabsEl}
      mobileTabsDocked={isMobile}
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

    

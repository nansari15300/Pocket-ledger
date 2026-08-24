"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, DollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { MobileMasterDetailNestedName } from "@/components/entity/MobileMasterDetailNestedName";
import { mlc } from "@/lib/mobileListChrome";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import { type EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams } from "next/navigation";
import { useVouchers } from "@/hooks/useVouchers";
import { collectInterCompanyIdsForPendingApproval } from "@/lib/interCompany/interCompanyVoucherHydrate";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { doc, getDoc, collection, query, getDocs, where, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import { browserHistoryHref } from "@/lib/webAppBasePath";
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
import type { GroupListSelectOptions } from "@/lib/groupListExpand";
import { isLocalOnlyMode } from "@/lib/localMode";
import { useCachedFeatureConfig } from "@/hooks/useCachedFeatureConfig";

// Custom Hook Import
import { usePageMemory } from "@/hooks/usePageMemory";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";

import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import { ExpenseAccountList } from "@/components/expenses/ExpenseAccountList";
import { ExpenseAccountDetails } from "@/components/expenses/ExpenseAccountDetails";
import { ExpenseGroupList } from "@/components/expenses/ExpenseGroupList";
import { ExpenseGroupDetails } from "@/components/expenses/ExpenseGroupDetails";
import { CreateExpenseAccountDialog } from "@/components/expenses/CreateExpenseAccountDialog";
import { CreateExpenseGroupDialog } from "@/components/expenses/CreateExpenseGroupDialog";
import { PermissionButton } from "@/components/permission";
import usePermissions from "@/hooks/usePermissions";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { usePendingApprovalListFilter } from "@/hooks/usePendingApprovalListFilter";

function IncomeExpensePageContent() {
  const CORE_EXPENSE_GROUP_IDS = useMemo(
    () => new Set(["direct_income", "indirect_income", "direct_expense", "indirect_expense"]),
    []
  );
  const { user } = useAuth();
  const { company, companyId, effectiveNotificationSettings } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedExpenseAccounts, processedExpenseGroups: initialProcessedExpenseGroups, userNames: vouchersUserNames } = useVouchers();
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false &&
    effectiveNotificationSettings?.approve?.onList !== false;
  const pendingApprovalByExpenseAccountId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    const expenseAccountIdSet = new Set((processedExpenseAccounts || []).map((a: any) => a.id));
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      const ids = new Set<string>();
      if (String(v.type || "") === "inter_company") {
        collectInterCompanyIdsForPendingApproval(v, expenseAccountIdSet, "expense").forEach((id) =>
          ids.add(id)
        );
      } else {
        if (v.incomeAccountId && expenseAccountIdSet.has(v.incomeAccountId)) ids.add(v.incomeAccountId);
        if (v.expenseAccountId && expenseAccountIdSet.has(v.expenseAccountId)) ids.add(v.expenseAccountId);
        if (v.accountId && expenseAccountIdSet.has(v.accountId)) ids.add(v.accountId);
        (v.entries || []).forEach((e: any) => {
          if (e.accountId && expenseAccountIdSet.has(e.accountId)) ids.add(e.accountId);
        });
      }
      ids.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, processedExpenseAccounts, showApproveOnList]);
  const pendingApprovalByExpenseGroupId = useMemo(() => {
    if (!showApproveOnList) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    processedExpenseAccounts.forEach((account: any) => {
      const n = pendingApprovalByExpenseAccountId[account.id] || 0;
      if (!n) return;
      const gid =
        account.groupId && String(account.groupId).trim() !== "" && account.groupId !== "ungrouped_expense"
          ? account.groupId
          : "ungrouped";
      map[gid] = (map[gid] || 0) + n;
    });
    return map;
  }, [processedExpenseAccounts, pendingApprovalByExpenseAccountId, showApproveOnList]);
  const totalPendingApprovalVoucherCount = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !(processedExpenseAccounts || []).length) return 0;
    const expenseAccountIdSet = new Set(processedExpenseAccounts.map((a: ExpenseAccount) => a.id));
    let n = 0;
    for (const v of vouchers as any[]) {
      if (v?.isApproved === true) continue;
      let hit = false;
      if (v.incomeAccountId && expenseAccountIdSet.has(v.incomeAccountId)) hit = true;
      if (!hit && v.expenseAccountId && expenseAccountIdSet.has(v.expenseAccountId)) hit = true;
      if (!hit && v.accountId && expenseAccountIdSet.has(v.accountId)) hit = true;
      if (!hit && Array.isArray(v.entries)) {
        hit = v.entries.some((e: any) => e.accountId && expenseAccountIdSet.has(e.accountId));
      }
      if (hit) n += 1;
    }
    return n;
  }, [vouchers, processedExpenseAccounts, showApproveOnList]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  const isInitialMount = useRef(true);
  const pendingIncomesSelectIdRef = useRef<string | null>(null);
  
  const [activeView, setActiveView] = useState("accounts");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<ExpenseAccount | ExpenseGroup>(`expense_view_${activeView}`);
  const useQueryNav = useMasterDetailQueryNav();

  const onBackToList = useCallback(() => {
    setSelected(null);
    router.replace(masterDetailListHref("incomes"), { scroll: false });
  }, [setSelected, router]);
  useRegisterMasterDetailHardwareBack("incomes", onBackToList);

  const [searchTerm, setSearchTerm] = useState("");
  const [accountListQuickFilter, setAccountListQuickFilter] = useState<EntityListQuickFilter>("default");
  const [groupListQuickFilter, setGroupListQuickFilter] = useState<EntityListQuickFilter>("default");
  const {
    showOnlyEntities: showOnlyExpenseAccountsWithPendingApproval,
    setShowOnlyEntities: setShowOnlyExpenseAccountsWithPendingApproval,
    showOnlyGroups: showOnlyExpenseGroupsWithPendingApproval,
    setShowOnlyGroups: setShowOnlyExpenseGroupsWithPendingApproval,
  } = usePendingApprovalListFilter(totalPendingApprovalVoucherCount);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [accountDetailsDateRange, setAccountDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupMemberFilterId, setGroupMemberFilterId] = useState<string | null>(null);
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<'direct_income' | 'direct_expense' | 'add_salary'>('direct_income');
  // Feature config ko local cache se bhi read karo so offline UI consistent rahe.
  const { featureConfig } = useCachedFeatureConfig({});

  const selectedAccount = activeView === 'accounts' ? selected as ExpenseAccount : null;
  const selectedGroup = activeView === 'groups' ? selected as ExpenseGroup : null;
  const mobileIncomesSelectionLabelClassName = useMemo(() => {
    if (!selected) return undefined;
    return masterDetailBalanceToneClass((selected as ExpenseAccount | ExpenseGroup).balance);
  }, [selected]);
  const mobileIncomesSelectionLabel = useMemo((): ReactNode => {
    if (!selected) return null;
    if (activeView !== "groups") {
      const name = (selected as ExpenseAccount).name;
      return name && String(name).trim() ? String(name).trim() : null;
    }
    const group = selected as ExpenseGroup;
    if (groupMemberFilterId) {
      const member = processedExpenseAccounts.find((account) => account.id === groupMemberFilterId);
      return (
        <MobileMasterDetailNestedName
          groupName={group.name}
          memberName={member?.name ?? null}
          toneClassName={mobileIncomesSelectionLabelClassName}
        />
      );
    }
    const name = group.name;
    return name && String(name).trim() ? String(name).trim() : null;
  }, [
    selected,
    activeView,
    groupMemberFilterId,
    processedExpenseAccounts,
    mobileIncomesSelectionLabelClassName,
  ]);
  const mobileIncomesDetailHeaderAvatar = useMemo(() => {
    if (!isMobile || !selected) return null;
    const selectedEntity = selected as ExpenseAccount | ExpenseGroup;
    const name = selectedEntity.name || "Account";
    const attachmentUrl = trimEntityFileUrlForPreview((selectedEntity as any).fileUrl);
    const initials = name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NA";
    const openPreview = () => {
      // Income/Expense mobile header avatar: tap opens full preview.
      if (!attachmentUrl) return;
      void openAttachmentInApp(attachmentUrl, { title: name });
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
              alt={name}
              fallbackText={initials}
            />
          </button>
        </EntityFileAttachmentHover>
      </div>
    );
  }, [isMobile, selected]);
  const incomesMasterDetailTitle = activeView === "groups" ? "Income & Expense Groups" : "Income & Expense";
  useSyncMasterDetailHeaderId("incomes", selectedAccount?.id ?? selectedGroup?.id ?? null);
  const incomesMenuEnabled = featureConfig.incomes !== false;
  const incomesListEnabled = incomesMenuEnabled && featureConfig.incomes_list !== false;
  const accountsTabEnabled = incomesListEnabled && featureConfig.incomes_accounts_tab !== false;
  // Keep Groups tab permanently enabled on Income & Expense page.
  const groupsTabEnabled = true;
  const accountDetailsEnabled = accountsTabEnabled && featureConfig.incomes_account_details !== false;
  // Keep Groups detail view accessible whenever this page is accessible.
  const groupDetailsEnabled = true;
  const isActiveTabEnabled = activeView === "accounts" ? accountsTabEnabled : groupsTabEnabled;
  const listDisabled = !incomesListEnabled || !isActiveTabEnabled;
  const detailsDisabled = activeView === "accounts" ? !accountDetailsEnabled : !groupDetailsEnabled;

  const processedExpenseGroups = useMemo(() => {
    const normalizeGroup = (g: ExpenseGroup): ExpenseGroup => {
      if (CORE_EXPENSE_GROUP_IDS.has(g.id)) {
        return { ...g, isSystemReserved: false } as ExpenseGroup;
      }
      return g;
    };
    // Hide auto-created Ungrouped base doc; system groups (isSystemReserved) sirf Reports me – list pages pe nahi
    const normalized = (initialProcessedExpenseGroups || [])
      .map(normalizeGroup)
      .filter((g: any) => {
        if (g.isAutoUngrouped === true) return false;
        if (g.isReportOnly === true || g.isSystemReserved === true) return false;
        return true;
      });
    // Show Ungrouped row only when at least one account is in the Ungrouped bucket.
    const ungrouped = processedExpenseAccounts.filter((p: any) => !p.groupId || p.groupId === "ungrouped_expense");
    if (ungrouped.length > 0) {
      const ungroupedBalance = ungrouped.reduce((sum, p) => sum + p.balance, 0);
      const ungroupedGroup: ExpenseGroup = {
        id: 'ungrouped',
        name: 'Ungrouped',
        balance: ungroupedBalance,
        companyId: companyId || '',
        debit: ungrouped.reduce((sum, p) => sum + p.debit, 0),
        credit: ungrouped.reduce((sum, p) => sum + p.credit, 0),
      };
      return [...normalized, ungroupedGroup];
    }
    return normalized;
  }, [processedExpenseAccounts, initialProcessedExpenseGroups, companyId, CORE_EXPENSE_GROUP_IDS]);

  useEffect(() => {
    if (!companyId) return;
    // Offline/local-only mode me Firestore update call avoid karo.
    if (isLocalOnlyMode()) return;
    const ids = Array.from(CORE_EXPENSE_GROUP_IDS);
    Promise.allSettled(
      ids.map((id) =>
        updateDoc(doc(firestore, `companies/${companyId}/expense_groups`, id), {
          isSystemReserved: false,
        })
      )
    ).catch(() => {});
  }, [companyId, CORE_EXPENSE_GROUP_IDS]);

  useEffect(() => {
    if (activeView === "accounts" && !accountsTabEnabled) {
      if (groupsTabEnabled) setActiveView("groups");
      else setSelected(null);
    }
    if (activeView === "groups" && !groupsTabEnabled) {
      if (accountsTabEnabled) setActiveView("accounts");
      else setSelected(null);
    }
  }, [activeView, accountsTabEnabled, groupsTabEnabled, setSelected, setActiveView]);

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "incomeExpensePageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'accounts' ? processedExpenseAccounts : processedExpenseGroups, 
    vouchersLoading,
    isMobile,
    selectedIdFromUrl
  );
  // ==================================

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
  }, [companyId]);
  useEffect(() => {
    setShowOnlyExpenseAccountsWithPendingApproval(false);
    setShowOnlyExpenseGroupsWithPendingApproval(false);
  }, [companyId]);
  useEffect(() => {
    if (activeView !== "accounts") setShowOnlyExpenseAccountsWithPendingApproval(false);
    if (activeView !== "groups") setShowOnlyExpenseGroupsWithPendingApproval(false);
  }, [activeView]);

  const expenseAccountsForList = useMemo(() => {
    if (!showOnlyExpenseAccountsWithPendingApproval || !showApproveOnList) return processedExpenseAccounts;
    return processedExpenseAccounts.filter((a) => (pendingApprovalByExpenseAccountId[a.id] ?? 0) > 0);
  }, [
    processedExpenseAccounts,
    showOnlyExpenseAccountsWithPendingApproval,
    showApproveOnList,
    pendingApprovalByExpenseAccountId,
  ]);
  const filteredExpenseAccountListCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return expenseAccountsForList.filter(
      (a) => a.name && a.name.toLowerCase().includes(searchLower)
    ).length;
  }, [expenseAccountsForList, searchTerm]);

  const expenseGroupsForList = useMemo(() => {
    if (!showOnlyExpenseGroupsWithPendingApproval || !showApproveOnList) return processedExpenseGroups;
    return processedExpenseGroups.filter((g) => (pendingApprovalByExpenseGroupId[g.id] ?? 0) > 0);
  }, [
    processedExpenseGroups,
    showOnlyExpenseGroupsWithPendingApproval,
    showApproveOnList,
    pendingApprovalByExpenseGroupId,
  ]);
  const filteredExpenseGroupListCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return expenseGroupsForList.filter(
      (g) => (g as any).isReportOnly !== true && g.name && g.name.toLowerCase().includes(searchLower)
    ).length;
  }, [expenseGroupsForList, searchTerm]);

  /** Party-style tab switch — set view + row + URL together (EXE/APK stale ?selected= snap-back band). */
  const handleIncomesTabChange = useCallback(
    (value: string) => {
      if (!incomesListEnabled) return;
      if (value === "accounts" && !accountsTabEnabled) return;
      if (value === "groups" && !groupsTabEnabled) return;
      const tab = value === "groups" ? "groups" : "accounts";
      const items = tab === "groups" ? expenseGroupsForList : expenseAccountsForList;
      const nextSelected = tabSwitchSelection(
        isMobile,
        pickRememberedListSelection("incomeExpensePageState", tab, items)
      );
      pendingIncomesSelectIdRef.current = nextSelected?.id ?? null;
      setActiveView(tab);
      setSelected(nextSelected);
      const href = isMobile
        ? masterDetailTabHref("incomes", { tab, defaultTab: "accounts", listOnly: true })
        : masterDetailCanonicalHref("incomes", {
            tab,
            defaultTab: "accounts",
            selectedId: nextSelected?.id ?? null,
          });
      replaceMasterDetailTabUrl(href, router, useQueryNav);
      writeMasterDetailPageState("incomeExpensePageState", tab, nextSelected?.id);
    },
    [
      incomesListEnabled,
      accountsTabEnabled,
      groupsTabEnabled,
      isMobile,
      useQueryNav,
      expenseGroupsForList,
      expenseAccountsForList,
      setActiveView,
      setSelected,
      router,
    ]
  );

  // Location-first URL sync (Party jaisa).
  useEffect(() => {
    if (vouchersLoading) return;
    const { view, selectedId } = readMasterDetailLocationQuery();
    const pendingId = pendingIncomesSelectIdRef.current;
    if (pendingId) {
      if (selectedId === pendingId) pendingIncomesSelectIdRef.current = null;
      else if (selected?.id === pendingId) return;
    }
    if (!selectedId) {
      if (view === "groups") {
        if (activeView !== "groups") setActiveView("groups");
      } else if (activeView !== "accounts") {
        setActiveView("accounts");
      }
      return;
    }
    const groupItem = processedExpenseGroups.find((i) => i.id === selectedId);
    const accountItem = processedExpenseAccounts.find((i) => i.id === selectedId);
    if (view === "groups" && groupItem) setActiveView("groups");
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
        ? `/incomes?view=groups&selected=${encodeURIComponent(selectedId)}`
        : `/incomes?selected=${encodeURIComponent(selectedId)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
  }, [
    selectedIdFromUrl,
    viewFromUrl,
    vouchersLoading,
    processedExpenseAccounts,
    processedExpenseGroups,
    selected?.id,
    activeView,
    setSelected,
    setActiveView,
    router,
  ]);

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (userNames[userId] && userNames[userId] !== "Unknown") return userNames[userId];
    // Local-only mode me user names ke liye Firestore read na karo.
    if (isLocalOnlyMode()) return "N/A";
    try {
        // User doc ID may be name_uid format, so query by uid field first
        const q = query(collection(firestore, "users"), where("uid", "==", userId));
        const snap = await getDocs(q);
        let data = snap.docs[0]?.data();
        
        if (!data) {
            // Fallback: doc ID might be uid (legacy)
            const userDoc = await getDoc(doc(firestore, 'users', userId));
            if (userDoc.exists()) {
                data = userDoc.data();
            }
        }
        
        if (data) {
            // Get displayName from user document - this is the primary field
            const displayName = data.displayName || data.name || data.email || null;
            if (displayName && displayName !== userId && !displayName.match(/^[a-zA-Z0-9_-]{20,}$/)) {
                return displayName;
            }
        }
    } catch (e) {}
    return "N/A"; // Return N/A instead of Unknown
  }, [userNames]);

  // Use vouchersUserNames from useVouchers hook as primary source
  useEffect(() => {
    if (vouchersUserNames && Object.keys(vouchersUserNames).length > 0) {
      setUserNames(vouchersUserNames);
    }
  }, [vouchersUserNames]);

  // Only fetch locally if not in vouchersUserNames
  useEffect(() => {
    if (!vouchers || vouchers.length === 0) return;
    const uids = new Set(vouchers.map((t) => t.userId).filter(Boolean) as string[]);
    // Only fetch if not in vouchersUserNames or if it's "Unknown"/"N/A"
    const uidsToFetch = Array.from(uids).filter(uid => {
      const vouchersName = vouchersUserNames?.[uid];
      return !vouchersName || vouchersName === "Unknown" || vouchersName === "N/A";
    });
    
    if (uidsToFetch.length === 0) return;
    
    // Fetch all user names in parallel
    Promise.all(
      uidsToFetch.map(async (uid) => {
        const name = await fetchUserName(uid);
        return { uid, name };
      })
    ).then(results => {
      const newUserNames: Record<string, string> = {};
      results.forEach(({ uid, name }) => {
        if (name && name !== "Unknown" && name !== "N/A") {
          newUserNames[uid] = name;
        }
      });
      if (Object.keys(newUserNames).length > 0) {
        setUserNames((prev) => ({ ...prev, ...newUserNames }));
      }
    });
  }, [vouchers, fetchUserName, vouchersUserNames]);

  // Initial mount check (optional but safe to keep)
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
    }
  }, []);
  
  const totalBalance = useMemo(() => {
    return activeView === 'accounts'
      ? processedExpenseAccounts.reduce((acc, account) => acc + account.balance, 0)
      : processedExpenseGroups
          .filter((g) => !['income', 'expenses'].includes((g.id || '').toLowerCase()))
          .reduce((acc, group) => acc + group.balance, 0);
  }, [activeView, processedExpenseAccounts, processedExpenseGroups]);

  const handleSelect = useCallback(
    (item: ExpenseAccount | ExpenseGroup, view?: "accounts" | "groups", options?: GroupListSelectOptions) => {
      const isGroup = view === "groups";
      if (isGroup && !groupDetailsEnabled) return;
      if (!isGroup && !accountDetailsEnabled) return;
      pendingIncomesSelectIdRef.current = item.id;
      setSelected(item);
      if (isGroup) {
        setGroupMemberFilterId(options?.memberId ?? null);
        setActiveView("groups");
      } else {
        setGroupMemberFilterId(null);
        if (activeView !== "accounts") setActiveView("accounts");
      }
      const path = isGroup
        ? `/incomes?view=groups&selected=${encodeURIComponent(item.id)}`
        : `/incomes?selected=${encodeURIComponent(item.id)}`;
      if (typeof window !== "undefined") {
        try {
          window.history.replaceState(window.history.state, "", browserHistoryHref(path));
        } catch {
          /* ignore */
        }
      }
      if (useQueryNav && shouldReplaceWithMasterDetailCanonical(path)) {
        router.replace(path, { scroll: false });
      }
    },
    [
      useQueryNav,
      router,
      setSelected,
      activeView,
      setActiveView,
      groupDetailsEnabled,
      accountDetailsEnabled,
    ]
  );

  const accountsForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
      return processedExpenseAccounts.filter((p: any) => !p.groupId || p.groupId === "ungrouped_expense");
    }
    let groupAccounts = processedExpenseAccounts.filter(p => p.groupId === selectedGroup.id);
    
    // For Direct Income group, explicitly include sales_account if it exists
    if (selectedGroup.id === 'direct_income') {
        const salesAccount = processedExpenseAccounts.find(acc => acc.id === 'sales_account');
        if (salesAccount && !groupAccounts.find(acc => acc.id === 'sales_account')) {
            groupAccounts = [...groupAccounts, salesAccount];
        }
    }
    
    // For Direct Expenses group, explicitly include purchase_account if it exists
    if (selectedGroup.id === 'direct_expense') {
        const purchaseAccount = processedExpenseAccounts.find(acc => acc.id === 'purchase_account');
        if (purchaseAccount && !groupAccounts.find(acc => acc.id === 'purchase_account')) {
            groupAccounts = [...groupAccounts, purchaseAccount];
        }
    }
    
    return groupAccounts;
  }, [selectedGroup, processedExpenseAccounts]);

  const accountsForGroupDetails = useMemo(() => {
    if (!groupMemberFilterId) return accountsForSelectedGroup;
    return accountsForSelectedGroup.filter((a) => a.id === groupMemberFilterId);
  }, [accountsForSelectedGroup, groupMemberFilterId]);

  const resolveExpenseGroupMembers = useCallback(
    (groupId: string) => {
      if (groupId === "ungrouped") {
        return processedExpenseAccounts.filter(
          (p) => !p.groupId || p.groupId === "ungrouped_expense"
        );
      }
      let groupAccounts = processedExpenseAccounts.filter((p) => p.groupId === groupId);
      if (groupId === "direct_income") {
        const salesAccount = processedExpenseAccounts.find((acc) => acc.id === "sales_account");
        if (salesAccount && !groupAccounts.find((acc) => acc.id === "sales_account")) {
          groupAccounts = [...groupAccounts, salesAccount];
        }
      }
      if (groupId === "direct_expense") {
        const purchaseAccount = processedExpenseAccounts.find((acc) => acc.id === "purchase_account");
        if (purchaseAccount && !groupAccounts.find((acc) => acc.id === "purchase_account")) {
          groupAccounts = [...groupAccounts, purchaseAccount];
        }
      }
      return groupAccounts;
    },
    [processedExpenseAccounts]
  );

  const expenseGroupMembersByGroupId = useMemo(() => {
    const map: Record<string, ExpenseAccount[]> = {};
    for (const g of expenseGroupsForList) {
      map[g.id] = resolveExpenseGroupMembers(g.id);
    }
    return map;
  }, [expenseGroupsForList, resolveExpenseGroupMembers]);

  const openVoucherDialog = (type: 'direct_income' | 'direct_expense' | 'add_salary') => {
    setDefaultTab(type);
    setIsVoucherOpen(true);
  };

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
                        Please select a company to view income & expense data.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
  }
  
  const incomesTabsEl = (
    <Tabs value={activeView} onValueChange={handleIncomesTabChange} className="w-full">
      <TabsList listChrome>
        <TabsTrigger listChrome value="accounts" className="flex-1" disabled={!incomesListEnabled || !accountsTabEnabled}>Accounts</TabsTrigger>
        <TabsTrigger listChrome value="groups" className="flex-1" disabled={!incomesListEnabled || !groupsTabEnabled}>Groups</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const incomesSearchRowEl = (
    <div className={cn(mlc.searchRow, listDisabled && "pointer-events-none opacity-60")}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input placeholder={activeView === 'accounts' ? 'Search accounts...' : 'Search groups...'} listChrome listChromeSearch value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
      </div>
      {activeView === "accounts" &&
      showApproveOnList &&
      totalPendingApprovalVoucherCount > 0 &&
      !listDisabled ? (
        <PendingApprovalListFilterBadge compact
          count={totalPendingApprovalVoucherCount}
          pressed={showOnlyExpenseAccountsWithPendingApproval}
          onToggle={() => setShowOnlyExpenseAccountsWithPendingApproval((v) => !v)}
          tooltipFilterHint={`Only accounts with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
          tooltipShowAllHint="Show all accounts (click)"
          ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
          ariaLabelShowAll="Show all accounts"
        />
      ) : null}
      {activeView === "groups" &&
      showApproveOnList &&
      totalPendingApprovalVoucherCount > 0 &&
      !listDisabled ? (
        <PendingApprovalListFilterBadge compact
          count={totalPendingApprovalVoucherCount}
          pressed={showOnlyExpenseGroupsWithPendingApproval}
          onToggle={() => setShowOnlyExpenseGroupsWithPendingApproval((v) => !v)}
          tooltipFilterHint={`Only groups with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
          tooltipShowAllHint="Show all groups (click)"
          ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
          ariaLabelShowAll="Show all groups"
        />
      ) : null}
      {activeView === "accounts" ? (
        <CreateExpenseAccountDialog onExpenseAccountCreated={() => {}} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateAccountOpen(true)}>
            + Add Account
          </PermissionButton>
        </CreateExpenseAccountDialog>
      ) : (
        <CreateExpenseGroupDialog onGroupCreated={() => {}} groups={processedExpenseGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateGroupOpen(true)}>
            + Add Group
          </PermissionButton>
        </CreateExpenseGroupDialog>
      )}
    </div>
  );

  const incomesActionRowEl =
    activeView === "accounts" ? (
      <div className={cn(mlc.actionRow, listDisabled && "pointer-events-none opacity-60")}>
        <div className={cn(mlc.actionGrid, "grid-cols-3")}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" className="w-full" onClick={() => openVoucherDialog("direct_income")}>
            Direct Income
          </PermissionButton>
          <PermissionButton permission="create_records" variant="chromePill" size="list" className="w-full" onClick={() => openVoucherDialog("direct_expense")}>
            Direct Expense
          </PermissionButton>
          <PermissionButton permission="create_records" variant="chromePill" size="list" className="w-full" onClick={() => openVoucherDialog("add_salary")}>
            Add Salary
          </PermissionButton>
        </div>
      </div>
    ) : undefined;

  const incomesSectionLabelEl =
    activeView === "accounts" ? (
      <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
        <DollarSign className={mlc.sectionIcon} />
        <span>Account ({filteredExpenseAccountListCount})</span>
      </div>
    ) : (
      <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
        <Users className={mlc.sectionIcon} />
        <span>Groups ({filteredExpenseGroupListCount})</span>
      </div>
    );

  const listView = (
    <MasterListViewShell
      isMobile={isMobile}
      searchRow={incomesSearchRowEl}
      sectionLabel={incomesSectionLabelEl}
      actionRow={incomesActionRowEl}
      tabs={incomesTabsEl}
      quickFilter={activeView === "accounts" ? accountListQuickFilter : groupListQuickFilter}
      onQuickFilterChange={activeView === "accounts" ? setAccountListQuickFilter : setGroupListQuickFilter}
    >
      <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        {activeView === "accounts" ? (
          <ExpenseAccountList
            accounts={expenseAccountsForList}
            onSelectAccount={(a) => handleSelect(a, "accounts")}
            selectedAccount={selectedAccount}
            searchTerm={searchTerm}
            pendingApprovalByAccountId={pendingApprovalByExpenseAccountId}
            disabled={listDisabled || !accountDetailsEnabled}
            getItemHref={useQueryNav && accountDetailsEnabled ? (a) => `/incomes?selected=${a.id}` : undefined}
            quickFilter={accountListQuickFilter}
            onQuickFilterChange={setAccountListQuickFilter}
            hideQuickFilterBar
          />
        ) : (
          <ExpenseGroupList
            groups={expenseGroupsForList}
            onSelectGroup={(g, options) => handleSelect(g, "groups", options)}
            selectedGroup={selectedGroup}
            searchTerm={searchTerm}
            collapsible={false}
            disabled={listDisabled || !groupDetailsEnabled}
            pendingApprovalByGroupId={pendingApprovalByExpenseGroupId}
            pendingApprovalByMemberId={pendingApprovalByExpenseAccountId}
            groupMembersByGroupId={expenseGroupMembersByGroupId}
            selectedGroupMemberFilterId={groupMemberFilterId}
            getItemHref={useQueryNav && groupDetailsEnabled ? (g) => `/incomes?view=groups&selected=${g.id}` : undefined}
            quickFilter={groupListQuickFilter}
            onQuickFilterChange={setGroupListQuickFilter}
            hideQuickFilterBar
          />
        )}
        {listDisabled && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 px-4 text-center text-sm font-medium text-muted-foreground backdrop-blur-[1px]">
            Income & Expense list access is turned off.
          </div>
        )}
      </div>
    </MasterListViewShell>
  );

  const detailView = (
    <div className="h-full relative">
      {!detailsDisabled && activeView === 'accounts' && selectedAccount && (
        <ExpenseAccountDetails
            account={selectedAccount} 
            allAccounts={processedExpenseAccounts}
            onAccountUpdated={() => {}} 
            onAccountDeleted={() => setSelected(null)} 
            dateRange={accountDetailsDateRange} 
            onDateRangeChange={setAccountDetailsDateRange} 
            userNames={{ ...vouchersUserNames, ...userNames }} 
        />
      )}
      {!detailsDisabled && activeView === 'groups' && selectedGroup && (
        <ExpenseGroupDetails 
            key={`${selectedGroup.id}:${groupMemberFilterId ?? "all"}`}
            group={selectedGroup} 
            allGroups={processedExpenseGroups} 
            accounts={accountsForGroupDetails}
            groupMemberFilterId={groupMemberFilterId}
            onGroupUpdated={() => {}} 
            onGroupDeleted={() => setSelected(null)} 
            onAccountUpdated={() => {}} 
            dateRange={groupDetailsDateRange} 
            onDateRangeChange={setGroupDetailsDateRange} 
            userNames={{ ...vouchersUserNames, ...userNames }} 
        />
      )}
      {!detailsDisabled && !selected && <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>}
      {detailsDisabled && <div className="p-6 text-center text-muted-foreground">{activeView === "accounts" ? "Account details page is turned off." : "Group details page is turned off."}</div>}
    </div>
  );

  return (
    <>
      {/* h-full + min-h-0: dashboard main (overflow-y-auto) ke andar list column ko height mile, PC par ScrollArea scroll kare */}
      <div className="h-full min-h-0 min-w-0">
      <ResponsiveMasterDetail
        title={incomesMasterDetailTitle}
        mobileSelectionLabel={mobileIncomesSelectionLabel}
        mobileSelectionLabelClassName={mobileIncomesSelectionLabelClassName}
        mobileDetailHeaderEnd={mobileIncomesDetailHeaderAvatar}
        balance={
            <span className={cn(
                "font-semibold",
                totalBalance >= 0 ? "text-green-600" : "text-red-600"
            )}>
                {formatCurrency(totalBalance, { showDrCr: true })}
            </span>
        }
        tabs={isMobile ? undefined : incomesTabsEl}
        mobileTabsDocked={isMobile}
        listView={listView}
        detailView={detailView}
        isMobile={isMobile}
        mobileListOnly={true}
        hasSelectedItem={!!selected}
        onBackToList={onBackToList}
      />
      </div>
      <AddVoucherDialog 
        isOpen={isVoucherOpen} 
        onOpenChange={setIsVoucherOpen}
        onVoucherCreated={() => {}}
        defaultTab={defaultTab}
        allowedTabs={["sale", "purchase", "direct_income", "direct_expense", "add_salary"]}
      />
    </>
  );
}

export default function IncomeExpensePage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<LoadingSpinner />}>
      <IncomeExpensePageContent />
    </Suspense>
  );
}

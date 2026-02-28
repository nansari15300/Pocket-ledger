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
import { Search, DollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams } from "next/navigation";
import { useVouchers } from "@/hooks/useVouchers";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { doc, getDoc, collection, query, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DateRange } from "react-day-picker";

// Custom Hook Import
import { usePageMemory } from "@/hooks/usePageMemory";

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

export default function IncomeExpensePage() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedExpenseAccounts, processedExpenseGroups: initialProcessedExpenseGroups, userNames: vouchersUserNames } = useVouchers();
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    company?.notificationSettings?.approve?.on === true &&
    company?.notificationSettings?.approve?.onList === true;
  const pendingApprovalByExpenseAccountId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      const ids = new Set<string>();
      if (v.incomeAccountId) ids.add(v.incomeAccountId);
      if (v.expenseAccountId) ids.add(v.expenseAccountId);
      (v.entries || []).forEach((e: any) => {
        if (e.accountId) ids.add(e.accountId);
      });
      ids.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, showApproveOnList]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);
  
  const [activeView, setActiveView] = useState("accounts");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<ExpenseAccount | ExpenseGroup>(`expense_view_${activeView}`);

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [accountDetailsDateRange, setAccountDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<'direct_income' | 'direct_expense'>('direct_income');

  const selectedAccount = activeView === 'accounts' ? selected as ExpenseAccount : null;
  const selectedGroup = activeView === 'groups' ? selected as ExpenseGroup : null;
  
  const processedExpenseGroups = useMemo(() => {
    const ungrouped = processedExpenseAccounts.filter(p => !p.groupId);
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
      return [...initialProcessedExpenseGroups, ungroupedGroup];
    }
    return initialProcessedExpenseGroups;
  }, [processedExpenseAccounts, initialProcessedExpenseGroups, companyId]);

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "incomeExpensePageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'accounts' ? processedExpenseAccounts : processedExpenseGroups, 
    vouchersLoading           
  );
  // ==================================

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
  }, [companyId]);

  // Restore selection when returning from details (e.g. /incomes?selected=xyz or /incomes?view=groups&selected=xyz)
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedExpenseGroups.find((i) => i.id === selectedIdFromUrl);
    const accountItem = processedExpenseAccounts.find((i) => i.id === selectedIdFromUrl);
    const item = groupItem || accountItem;
    if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (accountItem) setActiveView("accounts");
    if (item) setSelected(item);
    router.replace("/incomes", { scroll: false });
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, processedExpenseAccounts, processedExpenseGroups, setSelected, setActiveView, router]);

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (userNames[userId] && userNames[userId] !== "Unknown") return userNames[userId];
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

  const handleSelect = (item: ExpenseAccount | ExpenseGroup, view?: 'accounts' | 'groups') => {
    const isGroup = view === 'groups';
    if (isMobile) {
        const path = isGroup
          ? (item.id === 'ungrouped' ? '/incomes?view=groups' : `/incomes/group/${item.id}`)
          : `/incomes/${item.id}`;
        router.push(path);
    } else {
        setSelected(item);
    }
  };

  const accountsForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
        return processedExpenseAccounts.filter(p => !p.groupId);
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

  const openVoucherDialog = (type: 'direct_income' | 'direct_expense') => {
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
  
  const listView = (
    <div className="flex flex-col h-full">
        <div className="p-3 border-b flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={activeView === 'accounts' ? 'Search accounts...' : 'Search groups...'} className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
            </div>
            {activeView === "accounts" ? (
              <CreateExpenseAccountDialog onExpenseAccountCreated={() => {}} isOpen={isCreateAccountOpen} onOpenChange={setIsCreateAccountOpen}>
                <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateAccountOpen(true)}>
                  + Add Account
                </PermissionButton>
              </CreateExpenseAccountDialog>
            ) : (
              <CreateExpenseGroupDialog onGroupCreated={() => {}} groups={processedExpenseGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
                <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateGroupOpen(true)}>
                  + Add Group
                </PermissionButton>
              </CreateExpenseGroupDialog>
            )}
        </div>
        {activeView === 'accounts' && (
          <div className="p-2 border-b flex gap-2 flex-shrink-0">
            <PermissionButton permission="create_records" variant="outline" size="sm" className="flex-1" onClick={() => openVoucherDialog("direct_income")}>
              Add Direct Income
            </PermissionButton>
            <PermissionButton permission="create_records" variant="outline" size="sm" className="flex-1" onClick={() => openVoucherDialog("direct_expense")}>
              Add Direct Expense
            </PermissionButton>
          </div>
        )}
        {activeView === 'accounts' ? (
            <>
              <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <DollarSign className="h-4 w-4" />
                <span>Account ({processedExpenseAccounts.length})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ExpenseAccountList accounts={processedExpenseAccounts} onSelectAccount={(a) => handleSelect(a, 'accounts')} selectedAccount={selectedAccount} searchTerm={searchTerm} pendingApprovalByAccountId={pendingApprovalByExpenseAccountId} />
              </div>
            </>
        ) : (
            <>
              <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <Users className="h-4 w-4" />
                <span>Groups ({processedExpenseGroups.filter((g) => (g as any).isReportOnly !== true).length})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ExpenseGroupList groups={processedExpenseGroups} onSelectGroup={(g) => handleSelect(g, 'groups')} selectedGroup={selectedGroup} searchTerm={searchTerm} collapsible={false} />
              </div>
            </>
        )}
    </div>
  );

  const detailView = (
    <>
      {activeView === 'accounts' && selectedAccount && (
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
      {activeView === 'groups' && selectedGroup && (
        <ExpenseGroupDetails 
            group={selectedGroup} 
            allGroups={processedExpenseGroups} 
            accounts={accountsForSelectedGroup}
            onGroupUpdated={() => {}} 
            onGroupDeleted={() => setSelected(null)} 
            onAccountUpdated={() => {}} 
            dateRange={groupDetailsDateRange} 
            onDateRangeChange={setGroupDetailsDateRange} 
            userNames={{ ...vouchersUserNames, ...userNames }} 
        />
      )}
      {!selected && <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>}
    </>
  );

  return (
    <>
      <ResponsiveMasterDetail
        title="Income & Expense"
        balance={
            <span className={cn(
                "font-semibold",
                totalBalance >= 0 ? "text-green-600" : "text-red-600"
            )}>
                {formatCurrency(totalBalance, { showDrCr: true, noAnimation: true })}
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
      />
      <AddVoucherDialog 
        isOpen={isVoucherOpen} 
        onOpenChange={setIsVoucherOpen}
        onVoucherCreated={() => {}}
        defaultTab={defaultTab}
      />
    </>
  );
}
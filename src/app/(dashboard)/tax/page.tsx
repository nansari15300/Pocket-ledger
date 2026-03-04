"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams } from "next/navigation";
import { TaxList } from "@/components/tax/TaxList";
import { TaxDetails } from "@/components/tax/TaxDetails";
import { TaxGroupList } from "@/components/tax/TaxGroupList";
import { TaxGroupDetails } from "@/components/tax/TaxGroupDetails";
import { CreateTaxDialog } from "@/components/tax/CreateTaxDialog";
import { CreateTaxGroupDialog } from "@/components/tax/CreateTaxGroupDialog";
import { PermissionButton } from "@/components/permission";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import type { Tax, TaxGroup } from "@/components/tax/types";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { doc, getDoc, collection, query, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DateRange } from "@/components/ui/ad-calendar";


// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";

export default function TaxPage() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedTaxes, processedTaxGroups: initialProcessedTaxGroups, userNames: vouchersUserNames } = useVouchers();
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    company?.notificationSettings?.approve?.on !== false &&
    company?.notificationSettings?.approve?.onList !== false;
  const pendingApprovalByTaxId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    const taxIdSet = new Set((processedTaxes || []).map((t: any) => t.id));
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      const ids = new Set<string>();
      if (v.taxAccountId) ids.add(v.taxAccountId);
      (v.lineItems || []).forEach((line: any) => {
        if (line.taxAccountId) ids.add(line.taxAccountId);
      });
      (v.entries || []).forEach((entry: any) => {
        if (entry.accountId && taxIdSet.has(entry.accountId)) ids.add(entry.accountId);
      });
      ids.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, processedTaxes, showApproveOnList]);
  const pendingApprovalByTaxGroupId = useMemo(() => {
    if (!showApproveOnList) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    processedTaxes.forEach((tax: any) => {
      const groupId = tax.groupId || "ungrouped";
      map[groupId] = (map[groupId] || 0) + (pendingApprovalByTaxId[tax.id] || 0);
    });
    return map;
  }, [processedTaxes, pendingApprovalByTaxId, showApproveOnList]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  
  const [activeView, setActiveView] = useState("taxes");
  const { selected, setSelected } = useResponsiveListLayout<Tax | TaxGroup>(`tax_view_${activeView}`);
  const isInitialMount = useRef(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [taxDetailsDateRange, setTaxDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);

  const selectedTax = activeView === 'taxes' ? selected as Tax : null;
  const selectedGroup = activeView === 'groups' ? selected as TaxGroup : null;
  
  const processedTaxGroups = useMemo(() => {
    const ungrouped = processedTaxes.filter(p => !p.groupId);
    if (ungrouped.length > 0) {
      const ungroupedBalance = ungrouped.reduce((sum, p) => sum + p.balance, 0);
      const ungroupedGroup: TaxGroup = {
        id: 'ungrouped',
        name: 'Ungrouped',
        balance: ungroupedBalance,
        companyId: companyId || '',
        debit: ungrouped.reduce((sum, p) => sum + p.debit, 0),
        credit: ungrouped.reduce((sum, p) => sum + p.credit, 0),
      };
      return [...initialProcessedTaxGroups, ungroupedGroup];
    }
    return initialProcessedTaxGroups;
  }, [processedTaxes, initialProcessedTaxGroups, companyId]);

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "taxPageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'taxes' ? processedTaxes : processedTaxGroups, 
    vouchersLoading           
  );
  // ==================================

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
  }, [companyId]);
  
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

  // Initial Mount Safety
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
    }
  }, []);

  const totalBalance = useMemo(() => {
    return activeView === 'taxes'
      ? processedTaxes.reduce((acc, tax) => acc + tax.balance, 0)
      : processedTaxGroups.reduce((acc, group) => acc + group.balance, 0);
  }, [activeView, processedTaxes, processedTaxGroups]);

  const handleSelect = (item: Tax | TaxGroup) => {
    if (isMobile) {
      if ('rate' in item) {
        router.push(`/tax/${item.id}`);
      } else if (item.id === 'ungrouped') {
        router.push('/tax?view=groups');
      } else {
        router.push(`/tax/group/${item.id}`);
      }
    } else {
      setSelected(item);
    }
  };

  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedTaxGroups.find((i) => i.id === selectedIdFromUrl);
    const taxItem = processedTaxes.find((i) => i.id === selectedIdFromUrl);
    const item = groupItem || taxItem;
    if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (taxItem) setActiveView("taxes");
    if (item) setSelected(item);
    router.replace("/tax", { scroll: false });
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, processedTaxes, processedTaxGroups, setSelected, setActiveView, router]);

  const taxesForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
      return processedTaxes.filter(p => !p.groupId);
    }
    return processedTaxes.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedTaxes]);

  // Filtered group count (matches TaxGroupList: exclude report-only + system groups; apply search)
  const filteredGroupCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (processedTaxGroups || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true) return false;
      const isSystemParent = anyG.isSystemReserved === true || isSystemParentGroup("tax_groups", anyG.id);
      if (isSystemParent) return false;
      return g.name && (searchLower ? g.name.toLowerCase().includes(searchLower) : true);
    }).length;
  }, [processedTaxGroups, searchTerm]);

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
                        Please select a company to view tax data.
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
          <Input placeholder={activeView === 'taxes' ? 'Search taxes...' : 'Search groups...'} className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
        </div>
        {activeView === "taxes" ? (
          <CreateTaxDialog onTaxCreated={() => {}} isOpen={isCreateTaxOpen} onOpenChange={setIsCreateTaxOpen}>
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateTaxOpen(true)}>
              + Add Tax
            </PermissionButton>
          </CreateTaxDialog>
        ) : (
          <CreateTaxGroupDialog onGroupCreated={() => {}} groups={processedTaxGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateGroupOpen(true)}>
              + Add Group
            </PermissionButton>
          </CreateTaxGroupDialog>
        )}
      </div>
       {activeView === 'taxes' ? (
            <>
              <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <Receipt className="h-4 w-4" />
                <span>Tax ({processedTaxes.length})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <TaxList taxes={processedTaxes} onSelectTax={handleSelect as any} selectedTax={selectedTax} searchTerm={searchTerm} pendingApprovalByTaxId={pendingApprovalByTaxId} />
              </div>
            </>
        ) : (
            <>
              <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <Users className="h-4 w-4" />
                <span>Groups ({filteredGroupCount})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <TaxGroupList groups={processedTaxGroups} onSelectGroup={handleSelect} selectedGroup={selectedGroup} searchTerm={searchTerm} pendingApprovalByGroupId={pendingApprovalByTaxGroupId} />
              </div>
            </>
        )}
    </div>
  );

  const detailView = (
    <>
      {activeView === 'taxes' && selectedTax && (
        <TaxDetails tax={selectedTax} allTaxes={processedTaxes} onTaxUpdated={() => {}} onTaxDeleted={() => setSelected(null)} dateRange={taxDetailsDateRange} onDateRangeChange={setTaxDetailsDateRange} userNames={{ ...vouchersUserNames, ...userNames }} />
      )}
      {activeView === 'groups' && selectedGroup && (
        <TaxGroupDetails group={selectedGroup} allGroups={processedTaxGroups} taxes={taxesForSelectedGroup} onGroupUpdated={() => {}} onGroupDeleted={() => setSelected(null)} onTaxUpdated={() => {}} dateRange={groupDetailsDateRange} onDateRangeChange={setGroupDetailsDateRange} userNames={{ ...vouchersUserNames, ...userNames }} />
      )}
      {!selected && <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>}
    </>
  );

  return (
    <ResponsiveMasterDetail
      title="Taxes"
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
            <TabsTrigger value="taxes" className="flex-1">Taxes</TabsTrigger>
            <TabsTrigger value="groups" className="flex-1">Groups</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      listView={listView}
      detailView={detailView}
      isMobile={isMobile}
      mobileListOnly={true}
    />
  );
}
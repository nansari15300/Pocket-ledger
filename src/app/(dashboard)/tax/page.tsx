"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { mlc, mlcListChromeRoot, mlcListChromeRootData } from "@/lib/mobileListChrome";
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
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import type { DateRange } from "@/components/ui/ad-calendar";
import { isSystemParentGroup } from "@/lib/system-groups";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";

function TaxPageContent() {
  const { user } = useAuth();
  const { company, companyId, effectiveNotificationSettings } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedTaxes, processedTaxGroups: initialProcessedTaxGroups, userNames: vouchersUserNames } = useVouchers();
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false &&
    effectiveNotificationSettings?.approve?.onList !== false;
  const pendingApprovalByTaxId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    const taxIdSet = new Set((processedTaxes || []).map((t: any) => t.id));
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      const ids = new Set<string>();
      // Sirf is company ke tax masters — sidebar/list alignment
      if (v.taxAccountId && taxIdSet.has(v.taxAccountId)) ids.add(v.taxAccountId);
      (v.lineItems || []).forEach((line: any) => {
        if (line.taxAccountId && taxIdSet.has(line.taxAccountId)) ids.add(line.taxAccountId);
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
      const n = pendingApprovalByTaxId[tax.id] || 0;
      if (!n) return;
      const gid =
        tax.groupId && String(tax.groupId).trim() !== "" && tax.groupId !== "ungrouped_tax"
          ? tax.groupId
          : "ungrouped";
      map[gid] = (map[gid] || 0) + n;
    });
    return map;
  }, [processedTaxes, pendingApprovalByTaxId, showApproveOnList]);
  const totalPendingApprovalVoucherCount = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !(processedTaxes || []).length) return 0;
    const taxIdSet = new Set(processedTaxes.map((t: Tax) => t.id));
    let n = 0;
    for (const v of vouchers as any[]) {
      if (v?.isApproved === true) continue;
      let hit = false;
      if (v.taxAccountId && taxIdSet.has(v.taxAccountId)) hit = true;
      if (!hit && Array.isArray(v.lineItems)) {
        hit = v.lineItems.some((line: any) => line.taxAccountId && taxIdSet.has(line.taxAccountId));
      }
      if (!hit && Array.isArray(v.entries)) {
        hit = v.entries.some((e: any) => e.accountId && taxIdSet.has(e.accountId));
      }
      if (hit) n += 1;
    }
    return n;
  }, [vouchers, processedTaxes, showApproveOnList]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  const isMobile = useIsMobile();
  const useQueryNav = useMasterDetailQueryNav();

  const [activeView, setActiveView] = useState("taxes");
  const { selected, setSelected } = useResponsiveListLayout<Tax | TaxGroup>(`tax_view_${activeView}`);
  const isInitialMount = useRef(true);

  const onBackToList = useCallback(() => {
    setSelected(null);
    router.replace(masterDetailListHref("tax"), { scroll: false });
  }, [setSelected, router]);
  useRegisterMasterDetailHardwareBack(onBackToList, isMobile && !!selected);

  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyTaxesWithPendingApproval, setShowOnlyTaxesWithPendingApproval] = useState(false);
  const [showOnlyTaxGroupsWithPendingApproval, setShowOnlyTaxGroupsWithPendingApproval] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [taxDetailsDateRange, setTaxDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);

  const selectedTax = activeView === 'taxes' ? selected as Tax : null;
  const selectedGroup = activeView === 'groups' ? selected as TaxGroup : null;
  const mobileTaxSelectionLabel = useMemo(() => {
    if (!selected) return null;
    const name = (selected as Tax | TaxGroup).name;
    return name && String(name).trim() ? String(name).trim() : null;
  }, [selected]);
  const mobileTaxSelectionLabelClassName = useMemo(() => {
    if (!selected) return undefined;
    return masterDetailBalanceToneClass((selected as Tax | TaxGroup).balance);
  }, [selected]);
  const mobileTaxDetailHeaderAvatar = useMemo(() => {
    if (!isMobile || !selected) return null;
    const selectedEntity = selected as Tax | TaxGroup;
    const name = selectedEntity.name || "Tax";
    const attachmentUrl = trimEntityFileUrlForPreview((selectedEntity as any).fileUrl);
    const initials = name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NA";
    const openPreview = () => {
      // Tax mobile header avatar: tap to open full preview.
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
  const taxMasterDetailTitle = activeView === "groups" ? "Tax Group" : "Tax";
  useSyncMasterDetailHeaderId("tax", selectedTax?.id ?? selectedGroup?.id ?? null);
  
  const processedTaxGroups = useMemo(() => {
    // Hide auto-created Ungrouped base doc; system groups sirf Reports me – list pages pe nahi
    const baseGroups = initialProcessedTaxGroups.filter((g) => {
      const anyG = g as any;
      if (anyG.isAutoUngrouped === true) return false;
      if (anyG.isReportOnly === true || anyG.isSystemReserved === true) return false;
      if (isSystemParentGroup("tax_groups", anyG.id)) return false;
      return true;
    });
    // Show Ungrouped row only when at least one tax is in the Ungrouped bucket.
    const ungrouped = processedTaxes.filter((p: any) => !p.groupId || p.groupId === "ungrouped_tax");
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
      return [...baseGroups, ungroupedGroup];
    }
    return baseGroups;
  }, [processedTaxes, initialProcessedTaxGroups, companyId]);

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "taxPageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'taxes' ? processedTaxes : processedTaxGroups, 
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
    setShowOnlyTaxesWithPendingApproval(false);
    setShowOnlyTaxGroupsWithPendingApproval(false);
  }, [companyId]);
  useEffect(() => {
    if (activeView !== "taxes") setShowOnlyTaxesWithPendingApproval(false);
    if (activeView !== "groups") setShowOnlyTaxGroupsWithPendingApproval(false);
  }, [activeView]);

  const taxesForTaxList = useMemo(() => {
    if (!showOnlyTaxesWithPendingApproval || !showApproveOnList) return processedTaxes;
    return processedTaxes.filter((t) => (pendingApprovalByTaxId[t.id] ?? 0) > 0);
  }, [processedTaxes, showOnlyTaxesWithPendingApproval, showApproveOnList, pendingApprovalByTaxId]);
  const filteredTaxListCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return taxesForTaxList.filter((t) => t.name && t.name.toLowerCase().includes(searchLower)).length;
  }, [taxesForTaxList, searchTerm]);
  
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
    if (useQueryNav) {
      // Static export ke liye query params – /tax/[id] path refresh/redirect de sakta hai
      if ('rate' in item) {
        router.push(`/tax?selected=${item.id}`);
      } else router.push(`/tax?view=groups&selected=${item.id}`);
    } else {
        setSelected(item);
    }
  };

  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedTaxGroups.find((i) => i.id === selectedIdFromUrl);
    const taxItem = processedTaxes.find((i) => i.id === selectedIdFromUrl);
    if (groupItem && taxItem) {
      if (viewFromUrl === "groups") setActiveView("groups");
      else setActiveView("taxes");
    } else if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (taxItem) setActiveView("taxes");
    else if (groupItem) setActiveView("groups");
    const item =
      groupItem && taxItem
        ? viewFromUrl === "groups"
          ? groupItem
          : taxItem
        : groupItem || taxItem;
    if (item) setSelected(item);
    const canonical =
      viewFromUrl === "groups"
        ? `/tax?view=groups&selected=${encodeURIComponent(selectedIdFromUrl)}`
        : `/tax?selected=${encodeURIComponent(selectedIdFromUrl)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, processedTaxes, processedTaxGroups, setSelected, setActiveView, router]);

  const taxesForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
      return processedTaxes.filter((p: any) => !p.groupId || p.groupId === "ungrouped_tax");
    }
    return processedTaxes.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedTaxes]);

  const processedTaxGroupsForList = useMemo(() => {
    if (!showOnlyTaxGroupsWithPendingApproval || !showApproveOnList) return processedTaxGroups;
    return processedTaxGroups.filter((g) => (pendingApprovalByTaxGroupId[g.id] ?? 0) > 0);
  }, [
    processedTaxGroups,
    showOnlyTaxGroupsWithPendingApproval,
    showApproveOnList,
    pendingApprovalByTaxGroupId,
  ]);

  // Filtered group count (matches TaxGroupList: exclude report-only + system groups; apply search)
  const filteredGroupCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (processedTaxGroupsForList || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true) return false;
      const isSystemParent = anyG.isSystemReserved === true || isSystemParentGroup("tax_groups", anyG.id);
      if (isSystemParent) return false;
      return g.name && (searchLower ? g.name.toLowerCase().includes(searchLower) : true);
    }).length;
  }, [processedTaxGroupsForList, searchTerm]);

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
    <div className={mlcListChromeRoot} {...mlcListChromeRootData}>
      <div className={mlc.searchRow}>
        <div className={mlc.searchWrap}>
          <Search className={mlc.searchIcon} />
          <Input placeholder={activeView === 'taxes' ? 'Search taxes...' : 'Search groups...'} listChrome listChromeSearch value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
        </div>
        {activeView === "taxes" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
          <PendingApprovalListFilterBadge compact
            count={totalPendingApprovalVoucherCount}
            pressed={showOnlyTaxesWithPendingApproval}
            onToggle={() => setShowOnlyTaxesWithPendingApproval((v) => !v)}
            tooltipFilterHint={`Only taxes with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
            tooltipShowAllHint="Show all taxes (click)"
            ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
            ariaLabelShowAll="Show all taxes"
          />
        ) : null}
        {activeView === "groups" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
          <PendingApprovalListFilterBadge compact
            count={totalPendingApprovalVoucherCount}
            pressed={showOnlyTaxGroupsWithPendingApproval}
            onToggle={() => setShowOnlyTaxGroupsWithPendingApproval((v) => !v)}
            tooltipFilterHint={`Only groups with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
            tooltipShowAllHint="Show all groups (click)"
            ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
            ariaLabelShowAll="Show all groups"
          />
        ) : null}
        {activeView === "taxes" ? (
          <CreateTaxDialog onTaxCreated={() => {}} isOpen={isCreateTaxOpen} onOpenChange={setIsCreateTaxOpen}>
            <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateTaxOpen(true)}>
              + Add Tax
            </PermissionButton>
          </CreateTaxDialog>
        ) : (
          <CreateTaxGroupDialog onGroupCreated={() => {}} groups={processedTaxGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
            <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateGroupOpen(true)}>
              + Add Group
            </PermissionButton>
          </CreateTaxGroupDialog>
        )}
      </div>
       {activeView === 'taxes' ? (
            <>
              <div className={mlc.sectionLabelRow}>
                <Receipt className={mlc.sectionIcon} />
                <span>Tax ({filteredTaxListCount})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <TaxList taxes={taxesForTaxList} onSelectTax={handleSelect as any} selectedTax={selectedTax} searchTerm={searchTerm} pendingApprovalByTaxId={pendingApprovalByTaxId} getItemHref={useQueryNav ? (t) => `/tax?selected=${t.id}` : undefined} />
              </div>
            </>
        ) : (
            <>
              <div className={mlc.sectionLabelRow}>
                <Users className={mlc.sectionIcon} />
                <span>Groups ({filteredGroupCount})</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <TaxGroupList groups={processedTaxGroupsForList} onSelectGroup={handleSelect} selectedGroup={selectedGroup} searchTerm={searchTerm} pendingApprovalByGroupId={pendingApprovalByTaxGroupId} getItemHref={useQueryNav ? (g) => `/tax?view=groups&selected=${g.id}` : undefined} />
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
      title={taxMasterDetailTitle}
      mobileSelectionLabel={mobileTaxSelectionLabel}
      mobileSelectionLabelClassName={mobileTaxSelectionLabelClassName}
      mobileDetailHeaderEnd={mobileTaxDetailHeaderAvatar}
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
          <TabsList listChrome>
            <TabsTrigger listChrome value="taxes" className="flex-1">Taxes</TabsTrigger>
            <TabsTrigger listChrome value="groups" className="flex-1">Groups</TabsTrigger>
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

export default function TaxPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<LoadingSpinner />}>
      <TaxPageContent />
    </Suspense>
  );
}
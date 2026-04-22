
"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Briefcase, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDate } from "@/hooks/useDate";
import { useSearchParams, useRouter } from "next/navigation";
import { StaffList } from "@/components/staff/StaffList";
import { StaffDetails } from "@/components/staff/StaffDetails";
import { StaffGroupList } from "@/components/staff/StaffGroupList";
import { StaffGroupDetails } from "@/components/staff/StaffGroupDetails";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { CreateStaffGroupDialog } from "@/components/staff/CreateStaffGroupDialog";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import type { DateRange } from "@/components/ui/ad-calendar";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { collectStaffIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesStaffLedger";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";

function StaffPageContent() {
  const { user } = useAuth();
  const { company, companyId, effectiveNotificationSettings } = useCompany();
  const { formatCurrency, formatRunning } = useDate();
  const { vouchers, loading: vouchersLoading, processedStaff, processedStaffGroups: initialProcessedStaffGroups, userNames } = useVouchers();
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false &&
    effectiveNotificationSettings?.approve?.onList !== false;
  const pendingApprovalByStaffId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !processedStaff?.length) return {} as Record<string, number>;
    const staffIdSet = new Set(processedStaff.map((s: Staff) => s.id));
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      const touched = collectStaffIdsTouchedByUnapprovedVoucher(v, staffIdSet);
      touched.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, showApproveOnList, processedStaff]);
  const pendingApprovalByStaffGroupId = useMemo(() => {
    if (!showApproveOnList) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    processedStaff.forEach((s: any) => {
      const n = pendingApprovalByStaffId[s.id] || 0;
      if (!n) return;
      const gid =
        s.groupId && String(s.groupId).trim() !== "" && s.groupId !== "ungrouped_staff"
          ? s.groupId
          : "ungrouped";
      map[gid] = (map[gid] || 0) + n;
    });
    return map;
  }, [processedStaff, pendingApprovalByStaffId, showApproveOnList]);
  const totalPendingApprovalVoucherCount = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !processedStaff?.length) return 0;
    const staffIdSet = new Set(processedStaff.map((s: Staff) => s.id));
    let n = 0;
    for (const v of vouchers as any[]) {
      if (v?.isApproved === true) continue;
      if (collectStaffIdsTouchedByUnapprovedVoucher(v, staffIdSet).size > 0) n += 1;
    }
    return n;
  }, [vouchers, showApproveOnList, processedStaff]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  const isInitialMount = useRef(true);
  
  const [activeView, setActiveView] = useState("staff");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<Staff | StaffGroup>(`staff_view_${activeView}`);

  const onBackToList = useCallback(() => {
    setSelected(null);
    router.replace(masterDetailListHref("staff"), { scroll: false });
  }, [setSelected, router]);
  useRegisterMasterDetailHardwareBack(onBackToList, isMobile && !!selected);
  const useQueryNav = useMasterDetailQueryNav();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyStaffWithPendingApproval, setShowOnlyStaffWithPendingApproval] = useState(false);
  const [showOnlyStaffGroupsWithPendingApproval, setShowOnlyStaffGroupsWithPendingApproval] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [voucherDefaultTab, setVoucherDefaultTab] = useState<'add_salary' | 'payment_out'>('add_salary');

  const selectedStaff = activeView === 'staff' ? selected as Staff : null;
  const selectedGroup = activeView === 'groups' ? selected as StaffGroup : null;
  const mobileStaffSelectionLabel = useMemo(() => {
    if (!selected) return null;
    const name = (selected as Staff | StaffGroup).name;
    return name && String(name).trim() ? String(name).trim() : null;
  }, [selected]);
  const mobileStaffSelectionLabelClassName = useMemo(() => {
    if (!selected) return undefined;
    return masterDetailBalanceToneClass((selected as Staff | StaffGroup).balance);
  }, [selected]);
  const staffMasterDetailTitle = activeView === "groups" ? "Staff Groups" : "Staff";
  useSyncMasterDetailHeaderId("staff", selectedStaff?.id ?? selectedGroup?.id ?? null);

  const processedStaffGroups = useMemo(() => {
    // Show Ungrouped row only when at least one staff is in the Ungrouped bucket.
    const ungrouped = processedStaff.filter((p: any) => !p.groupId || p.groupId === "ungrouped_staff");
    // Hide auto-created Ungrouped base doc; system groups sirf Reports me – list pages pe nahi
    const baseGroups = initialProcessedStaffGroups.filter((g) => {
      const anyG = g as any;
      if (anyG.isAutoUngrouped === true) return false;
      if (anyG.isReportOnly === true || anyG.isSystemReserved === true) return false;
      if (isSystemParentGroup("staff_groups", anyG.id)) return false;
      return true;
    });
    if (ungrouped.length > 0) {
      const ungroupedBalance = ungrouped.reduce((sum, p) => sum + p.balance, 0);
      const ungroupedGroup: StaffGroup = {
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
  }, [processedStaff, initialProcessedStaffGroups, companyId]);

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "staffPageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'staff' ? processedStaff : processedStaffGroups, 
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
    setShowOnlyStaffWithPendingApproval(false);
    setShowOnlyStaffGroupsWithPendingApproval(false);
  }, [companyId]);
  useEffect(() => {
    if (activeView !== "staff") setShowOnlyStaffWithPendingApproval(false);
    if (activeView !== "groups") setShowOnlyStaffGroupsWithPendingApproval(false);
  }, [activeView]);

  const staffForStaffList = useMemo(() => {
    if (!showOnlyStaffWithPendingApproval || !showApproveOnList) return processedStaff;
    return processedStaff.filter((s) => (pendingApprovalByStaffId[s.id] ?? 0) > 0);
  }, [processedStaff, showOnlyStaffWithPendingApproval, showApproveOnList, pendingApprovalByStaffId]);
  const filteredStaffListCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return staffForStaffList.filter((s) => s.name && s.name.toLowerCase().includes(searchLower)).length;
  }, [staffForStaffList, searchTerm]);

  // Restore selection when returning from details (e.g. /staff?selected=xyz or /staff?view=groups&selected=xyz)
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedStaffGroups.find((i) => i.id === selectedIdFromUrl);
    const staffItem = processedStaff.find((i) => i.id === selectedIdFromUrl);
    if (groupItem && staffItem) {
      if (viewFromUrl === "groups") setActiveView("groups");
      else setActiveView("staff");
    } else if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (staffItem) setActiveView("staff");
    else if (groupItem) setActiveView("groups");
    const item =
      groupItem && staffItem
        ? viewFromUrl === "groups"
          ? groupItem
          : staffItem
        : groupItem || staffItem;
    if (item) setSelected(item);
    const canonical =
      viewFromUrl === "groups"
        ? `/staff?view=groups&selected=${encodeURIComponent(selectedIdFromUrl)}`
        : `/staff?selected=${encodeURIComponent(selectedIdFromUrl)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, processedStaff, processedStaffGroups, setSelected, setActiveView, router]);

  const openVoucherDialog = (mode: 'add_salary' | 'payment_out') => {
    setVoucherDefaultTab(mode);
    setIsVoucherDialogOpen(true);
  }

  // Initial Mount Safety
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
    }
  }, []);

  const totalBalance = useMemo(() => {
    if (activeView === 'staff') {
      return processedStaff.reduce((acc, staff) => acc + staff.balance, 0);
    }
    // Groups view: exclude system parent groups so balances are not double-counted
    return processedStaffGroups
      .filter((g) => {
        const anyG = g as any;
        const isSystem =
          anyG.isSystemReserved === true ||
          isSystemParentGroup("staff_groups", anyG.id);
        return !isSystem;
      })
      .reduce((acc, group) => acc + group.balance, 0);
  }, [activeView, processedStaff, processedStaffGroups]);

  const processedStaffGroupsForList = useMemo(() => {
    if (!showOnlyStaffGroupsWithPendingApproval || !showApproveOnList) return processedStaffGroups;
    return processedStaffGroups.filter((g) => (pendingApprovalByStaffGroupId[g.id] ?? 0) > 0);
  }, [
    processedStaffGroups,
    showOnlyStaffGroupsWithPendingApproval,
    showApproveOnList,
    pendingApprovalByStaffGroupId,
  ]);

  // Filtered group count (matches StaffGroupList: exclude system/report-only + search)
  const filteredStaffGroupCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (processedStaffGroupsForList || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true || anyG.isSystemReserved === true) return false;
      if (isSystemParentGroup("staff_groups", anyG.id)) return false;
      return anyG.name && (searchLower ? String(anyG.name).toLowerCase().includes(searchLower) : true);
    }).length;
  }, [processedStaffGroupsForList, searchTerm]);

  const handleSelect = (item: Staff | StaffGroup) => {
    if (useQueryNav) {
        // Static export ke liye query params use karte hain – /staff/[id] path 404 de sakta hai
        if ('salary' in item) {
            router.push(`/staff?selected=${item.id}`);
        } else {
            router.push(`/staff?view=groups&selected=${item.id}`);
        }
    } else {
        setSelected(item);
    }
  };
  
  const staffForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
      return processedStaff.filter((p: any) => !p.groupId || p.groupId === "ungrouped_staff");
    }
    return processedStaff.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedStaff]);

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
                        Please select a company to view staff data.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
 }

 const listView = (
    <div className="flex flex-col h-full">
        <div className="p-3 border-b flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder={activeView === 'staff' ? 'Search staff...' : 'Search groups...'}
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoComplete="off"
                />
            </div>
            {activeView === "staff" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
              <PendingApprovalListFilterBadge
                count={totalPendingApprovalVoucherCount}
                pressed={showOnlyStaffWithPendingApproval}
                onToggle={() => setShowOnlyStaffWithPendingApproval((v) => !v)}
                tooltipFilterHint={`Only staff with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
                tooltipShowAllHint="Show all staff (click)"
                ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
                ariaLabelShowAll="Show all staff"
              />
            ) : null}
            {activeView === "groups" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
              <PendingApprovalListFilterBadge
                count={totalPendingApprovalVoucherCount}
                pressed={showOnlyStaffGroupsWithPendingApproval}
                onToggle={() => setShowOnlyStaffGroupsWithPendingApproval((v) => !v)}
                tooltipFilterHint={`Only groups with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
                tooltipShowAllHint="Show all groups (click)"
                ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
                ariaLabelShowAll="Show all groups"
              />
            ) : null}
            {activeView === "staff" ? (
                <CreateStaffDialog onStaffCreated={() => {}} groups={processedStaffGroups} isOpen={isCreateStaffOpen} onOpenChange={setIsCreateStaffOpen}>
                    <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateStaffOpen(true)}>
                        + Add Staff
                    </PermissionButton>
                </CreateStaffDialog>
            ) : (
                <CreateStaffGroupDialog onGroupCreated={() => {}} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={processedStaffGroups}>
                    <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateGroupOpen(true)}>
                        + Add Group
                    </PermissionButton>
                </CreateStaffGroupDialog>
            )}
        </div>
        <div className="p-3 border-b">
            <div className="grid grid-cols-2 gap-2">
                <PermissionButton permission="create_records" variant="outline" onClick={() => openVoucherDialog("add_salary")}>
                    Add Salary
                </PermissionButton>
                <PermissionButton permission="create_records" variant="outline" onClick={() => openVoucherDialog("payment_out")}>
                    Pay Salary
                </PermissionButton>
            </div>
        </div>
        {activeView === "staff" ? (
          <>
            <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
              <Briefcase className="h-4 w-4" />
              <span>Staff ({filteredStaffListCount})</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <StaffList
                staff={staffForStaffList}
                onSelectStaff={handleSelect as any}
                selectedStaff={selectedStaff}
                searchTerm={searchTerm}
                pendingApprovalByStaffId={pendingApprovalByStaffId}
                getItemHref={useQueryNav ? (s) => `/staff?selected=${s.id}` : undefined}
              />
            </div>
          </>
        ) : (
          <>
            <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
              <Users className="h-4 w-4" />
              <span>Groups ({filteredStaffGroupCount})</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <StaffGroupList
                groups={processedStaffGroupsForList}
                onSelectGroup={handleSelect}
                selectedGroup={selectedGroup}
                searchTerm={searchTerm}
                pendingApprovalByGroupId={pendingApprovalByStaffGroupId}
                getItemHref={useQueryNav ? (g) => `/staff?view=groups&selected=${g.id}` : undefined}
              />
            </div>
          </>
        )}
    </div>
);

{/* Render detail view with stable component types + keys so it does NOT remount when vouchers/table data updates (which would close Add Voucher dialog). */}
  const detailView = activeView === "staff" && selectedStaff ? (
    <StaffDetails
      key={`staff-${selectedStaff.id}`}
      staff={selectedStaff}
      allStaff={processedStaff}
      allGroups={processedStaffGroups}
      onStaffUpdated={() => {}}
      onStaffDeleted={() => setSelected(null)}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      userNames={userNames}
    />
  ) : activeView === "groups" && selectedGroup ? (
    <StaffGroupDetails
      key={`group-${selectedGroup.id}`}
      group={selectedGroup}
      allGroups={processedStaffGroups}
      staff={staffForSelectedGroup}
      onGroupUpdated={() => {}}
      onGroupDeleted={() => setSelected(null)}
      onStaffUpdated={() => {}}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      userNames={userNames}
    />
  ) : (
    <div className="p-6 text-center text-muted-foreground">Select an item to view details</div>
  );

  return (
    <>
    <ResponsiveMasterDetail
      title={staffMasterDetailTitle}
      mobileSelectionLabel={mobileStaffSelectionLabel}
      mobileSelectionLabelClassName={mobileStaffSelectionLabelClassName}
      balance={
        <span className={cn(
            "font-semibold",
            // >= 0 (Payable/Salaries) Red, < 0 (Advance/Receivable) Green (Staff Logic Might Differ)
            // Typically: Cr (Payable) = Red, Dr (Advance) = Green
            totalBalance >= 0 ? "text-green-600" : "text-red-600"
        )}>
            {formatCurrency(totalBalance, { showDrCr: true, noAnimation: true })}
        </span>
      }
      tabs={
        <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="staff" className="flex-1">Staff</TabsTrigger>
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
    <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={setIsVoucherDialogOpen}
        onVoucherCreated={() => {}}
        defaultTab={voucherDefaultTab}
        defaultVoucherData={voucherDefaultTab === 'payment_out' ? { payeeType: 'staff', ...(selectedStaff ? { staffId: selectedStaff.id } : {}) } : undefined}
     />
    </>
  );
}

export default function StaffPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<LoadingSpinner />}>
      <StaffPageContent />
    </Suspense>
  );
}

    
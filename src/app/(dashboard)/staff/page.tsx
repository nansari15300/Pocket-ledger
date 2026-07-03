
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
import { resolveMasterListSelection } from "@/lib/masterEntityLiveUpdate";
import usePermissions from "@/hooks/usePermissions";
import type { DateRange } from "@/components/ui/ad-calendar";
import type { Staff, StaffGroup } from "@/components/staff/types";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import {
  masterDetailTabHref,
  replaceMasterDetailTabUrl,
} from "@/lib/masterDetailTabChange";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { mlc } from "@/lib/mobileListChrome";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import { type EntityListQuickFilter } from "@/components/entity/EntityListQuickFilterBar";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { collectStaffIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesStaffLedger";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import { usePendingApprovalListFilter } from "@/hooks/usePendingApprovalListFilter";

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
  useRegisterMasterDetailHardwareBack("staff", onBackToList);
  const useQueryNav = useMasterDetailQueryNav();

  const handleStaffTabChange = useCallback(
    (value: string) => {
      setActiveView(value);
      if (!isMobile) return;
      setSelected(null);
      const href = masterDetailTabHref("staff", {
        tab: value,
        defaultTab: "staff",
        listOnly: true,
      });
      replaceMasterDetailTabUrl(href, router, useQueryNav);
    },
    [isMobile, setActiveView, setSelected, router, useQueryNav]
  );
  
  const [searchTerm, setSearchTerm] = useState("");
  const [staffListQuickFilter, setStaffListQuickFilter] = useState<EntityListQuickFilter>("default");
  const [groupListQuickFilter, setGroupListQuickFilter] = useState<EntityListQuickFilter>("default");
  const {
    showOnlyEntities: showOnlyStaffWithPendingApproval,
    setShowOnlyEntities: setShowOnlyStaffWithPendingApproval,
    showOnlyGroups: showOnlyStaffGroupsWithPendingApproval,
    setShowOnlyGroups: setShowOnlyStaffGroupsWithPendingApproval,
  } = usePendingApprovalListFilter(totalPendingApprovalVoucherCount);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [voucherDefaultTab, setVoucherDefaultTab] = useState<'add_salary' | 'payment_out'>('add_salary');

  const selectedStaffRaw = activeView === 'staff' ? selected as Staff : null;
  const selectedStaff = useMemo(
    () => resolveMasterListSelection(selectedStaffRaw, processedStaff),
    [selectedStaffRaw, processedStaff]
  );
  const selectedGroup = activeView === 'groups' ? selected as StaffGroup : null;
  const handleStaffUpdated = useCallback((patch?: Partial<Staff>) => {
    if (!patch?.id || !selectedStaffRaw || selectedStaffRaw.id !== patch.id) return;
    setSelected({ ...selectedStaffRaw, ...patch });
  }, [setSelected, selectedStaffRaw]);
  const mobileStaffSelectionLabel = useMemo(() => {
    if (!selected) return null;
    const name = (selected as Staff | StaffGroup).name;
    return name && String(name).trim() ? String(name).trim() : null;
  }, [selected]);
  const mobileStaffSelectionLabelClassName = useMemo(() => {
    if (!selected) return undefined;
    return masterDetailBalanceToneClass((selected as Staff | StaffGroup).balance);
  }, [selected]);
  const mobileStaffDetailHeaderAvatar = useMemo(() => {
    if (!isMobile || !selected) return null;
    const selectedEntity = selected as Staff | StaffGroup;
    const name = selectedEntity.name || "Staff";
    // Stale `"null"` / khali — header par PDF preview mat kholo
    const attachmentUrl = trimEntityFileUrlForPreview((selectedEntity as any).fileUrl);
    const initials = name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "NA";
    const openPreview = () => {
      // Header avatar tap should open full preview (same behavior as Party mobile details).
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
    isMobile,
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

  const handleSelect = useCallback((item: Staff | StaffGroup) => {
    const isStaffMember = "ownerId" in item;
    if (!isStaffMember) {
      setActiveView("groups");
    }
    setSelected(item);
    const path = isStaffMember
      ? `/staff?selected=${encodeURIComponent(item.id)}`
      : `/staff?view=groups&selected=${encodeURIComponent(item.id)}`;
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState(window.history.state, "", path);
      } catch {
        /* ignore */
      }
    }
    if (useQueryNav) {
      router.replace(path, { scroll: false });
    }
  }, [router, setSelected, useQueryNav]);
  
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

 const staffTabsEl = (
    <Tabs value={activeView} onValueChange={handleStaffTabChange} className="w-full">
      <TabsList listChrome>
        <TabsTrigger listChrome value="staff" className="flex-1">Staff</TabsTrigger>
        <TabsTrigger listChrome value="groups" className="flex-1">Groups</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const staffSearchRowEl = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          placeholder={activeView === 'staff' ? 'Search staff...' : 'Search groups...'}
          listChrome
          listChromeSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="off"
        />
      </div>
      {activeView === "staff" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
        <PendingApprovalListFilterBadge compact
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
        <PendingApprovalListFilterBadge compact
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
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateStaffOpen(true)}>
            + Add Staff
          </PermissionButton>
        </CreateStaffDialog>
      ) : (
        <CreateStaffGroupDialog onGroupCreated={() => {}} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={processedStaffGroups}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateGroupOpen(true)}>
            + Add Group
          </PermissionButton>
        </CreateStaffGroupDialog>
      )}
    </div>
  );

  const staffActionRowEl = (
    <div className={mlc.actionRow}>
      <div className={mlc.actionGrid}>
        <PermissionButton permission="create_records" variant="outline" size="list" className="w-full" onClick={() => openVoucherDialog("add_salary")}>
          Add Salary
        </PermissionButton>
        <PermissionButton permission="create_records" variant="chromePill" size="list" className="w-full" onClick={() => openVoucherDialog("payment_out")}>
          Pay Salary
        </PermissionButton>
      </div>
    </div>
  );

  const staffSectionLabelEl =
    activeView === "staff" ? (
      <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
        <Briefcase className={mlc.sectionIcon} />
        <span>Staff ({filteredStaffListCount})</span>
      </div>
    ) : (
      <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
        <Users className={mlc.sectionIcon} />
        <span>Groups ({filteredStaffGroupCount})</span>
      </div>
    );

 const listView = (
    <MasterListViewShell
      isMobile={isMobile}
      searchRow={staffSearchRowEl}
      sectionLabel={staffSectionLabelEl}
      actionRow={staffActionRowEl}
      tabs={staffTabsEl}
      quickFilter={activeView === "staff" ? staffListQuickFilter : groupListQuickFilter}
      onQuickFilterChange={activeView === "staff" ? setStaffListQuickFilter : setGroupListQuickFilter}
    >
      {activeView === "staff" ? (
        <StaffList
          staff={staffForStaffList}
          onSelectStaff={handleSelect as any}
          selectedStaff={selectedStaff}
          searchTerm={searchTerm}
          pendingApprovalByStaffId={pendingApprovalByStaffId}
          getItemHref={useQueryNav ? (s) => `/staff?selected=${s.id}` : undefined}
          quickFilter={staffListQuickFilter}
          onQuickFilterChange={setStaffListQuickFilter}
          hideQuickFilterBar
        />
      ) : (
        <StaffGroupList
          groups={processedStaffGroupsForList}
          onSelectGroup={handleSelect}
          selectedGroup={selectedGroup}
          searchTerm={searchTerm}
          pendingApprovalByGroupId={pendingApprovalByStaffGroupId}
          getItemHref={useQueryNav ? (g) => `/staff?view=groups&selected=${g.id}` : undefined}
          quickFilter={groupListQuickFilter}
          onQuickFilterChange={setGroupListQuickFilter}
          hideQuickFilterBar
        />
      )}
    </MasterListViewShell>
);

{/* Render detail view with stable component types + keys so it does NOT remount when vouchers/table data updates (which would close Add Voucher dialog). */}
  const detailView = activeView === "staff" && selectedStaff ? (
    <StaffDetails
      key={`staff-${selectedStaff.id}`}
      staff={selectedStaff}
      allStaff={processedStaff}
      allGroups={processedStaffGroups}
      onStaffUpdated={handleStaffUpdated}
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
      onStaffUpdated={handleStaffUpdated}
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
      mobileDetailHeaderEnd={mobileStaffDetailHeaderAvatar}
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
      tabs={isMobile ? undefined : staffTabsEl}
      mobileTabsDocked={isMobile}
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

    
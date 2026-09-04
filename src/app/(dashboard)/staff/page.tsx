
"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDate } from "@/hooks/useDate";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { StaffList } from "@/components/staff/StaffList";
import { StaffDetails } from "@/components/staff/StaffDetails";
import { StaffLiabilityGroupList } from "@/components/staff/StaffLiabilityGroupList";
import { StaffGroupDetails } from "@/components/staff/StaffGroupDetails";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { CreateStaffGroupDialog } from "@/components/staff/CreateStaffGroupDialog";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import { useVouchers } from "@/hooks/useVouchers";
import { resolveMasterListSelection } from "@/lib/masterEntityLiveUpdate";
import usePermissions from "@/hooks/usePermissions";
import type { DateRange } from "@/components/ui/ad-calendar";
import type { GroupListSelectOptions } from "@/lib/groupListExpand";
import { MobileMasterDetailNestedName } from "@/components/entity/MobileMasterDetailNestedName";
import type { Staff, StaffGroup } from "@/components/staff/types";
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
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoanStaffNavTitle } from "@/components/layout/LoanStaffNavTitle";
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
import { StaffEntityNavIcon } from "@/components/entity/StaffEntityIcon";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import {
  STAFF_ENTITY_ADD_BUTTON,
  STAFF_ENTITY_LABEL,
  STAFF_ENTITY_SEARCH_PLACEHOLDER,
} from "@/lib/staffEntityDisplayName";
import { isLoanLiabilityStaff } from "@/modules/loans/utils/loanLiabilityStaff";
import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import { STAFF_SYSTEM_GROUP_ID } from "@/lib/staffSystemGroups";
import {
  buildStaffPageLiabilityGroupTree,
  staffMembersForGroupSelection,
} from "@/lib/staffPageLiabilityGroupTree";
import { masterEntityTextMatchesSearch } from "@/lib/filterMasterEntityListRows";
import { createMasterEntityGroupMoveHandler } from "@/lib/createMasterEntityGroupMoveHandler";
import { createMasterEntityGroupTreeMoveHandler } from "@/lib/createMasterEntityGroupTreeMoveHandler";
import { STAFF_GROUP_LIST_CONFIG } from "@/lib/masterGroupListConfigs";
import { staffGroupTreeMove } from "@/lib/masterEntityGroupTreeMoveHelpers";
import { staffGroupAccountMove } from "@/lib/masterEntityGroupAccountMove";
import { STAFF_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import {
  appendMasterEntitySystemBranchGroups,
  resolveMasterEntityGroupForSelection,
  resolveStaffListGroupBucketId,
} from "@/lib/masterEntitySystemGroups";
import { StaffPayEmiFlow } from "@/modules/loans/components/StaffPayEmiFlow";
import { useStaffPayEmiButtonState } from "@/modules/loans/hooks/useStaffPayEmiButtonState";
import { payEmiButtonClassName, payEmiButtonVariant } from "@/modules/loans/utils/payEmiButtonStyle";
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
      const gid = resolveStaffListGroupBucketId(s);
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
  const pendingStaffSelectIdRef = useRef<string | null>(null);

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
  const [groupMemberFilterId, setGroupMemberFilterId] = useState<string | null>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [payEmiOpen, setPayEmiOpen] = useState(false);
  const [payEmiPreferredAccountId, setPayEmiPreferredAccountId] = useState<string | null>(null);
  const [voucherDefaultTab, setVoucherDefaultTab] = useState<'add_salary' | 'payment_out'>('add_salary');

  const selectedStaffRaw = activeView === 'staff' ? selected as Staff : null;
  const selectedStaff = useMemo(
    () => resolveMasterListSelection(selectedStaffRaw, processedStaff),
    [selectedStaffRaw, processedStaff]
  );
  const payEmiSelectedAccountId =
    selectedStaff && isLoanLiabilityStaff(selectedStaff) ? selectedStaff.id : null;
  const { show: showPayEmiButton, emiDue: payEmiDue } = useStaffPayEmiButtonState({
    companyId,
    processedStaff,
    selectedAccountId: payEmiSelectedAccountId,
  });
  const selectedGroupRaw = activeView === 'groups' ? selected as StaffGroup : null;
  const handleStaffUpdated = useCallback((patch?: Partial<Staff>) => {
    if (!patch?.id || !selectedStaffRaw || selectedStaffRaw.id !== patch.id) return;
    setSelected({ ...selectedStaffRaw, ...patch });
  }, [setSelected, selectedStaffRaw]);
  const mobileStaffSelectionLabelClassName = useMemo(() => {
    if (!selected) return undefined;
    return masterDetailBalanceToneClass((selected as Staff | StaffGroup).balance);
  }, [selected]);
  const mobileStaffSelectionLabel = useMemo((): ReactNode => {
    if (!selected) return null;
    if (activeView !== "groups") {
      const name = (selected as Staff).name;
      return name && String(name).trim() ? String(name).trim() : null;
    }
    const group = selected as StaffGroup;
    if (groupMemberFilterId) {
      const member = processedStaff.find((staff) => staff.id === groupMemberFilterId);
      return (
        <MobileMasterDetailNestedName
          groupName={group.name}
          memberName={member?.name ?? null}
          toneClassName={mobileStaffSelectionLabelClassName}
        />
      );
    }
    const name = group.name;
    return name && String(name).trim() ? String(name).trim() : null;
  }, [selected, activeView, groupMemberFilterId, processedStaff, mobileStaffSelectionLabelClassName]);
  const mobileStaffDetailHeaderAvatar = useMemo(() => {
    if (!isMobile || !selected) return null;
    const selectedEntity = selected as Staff | StaffGroup;
    const name = selectedEntity.name || STAFF_ENTITY_LABEL;
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
  useSyncMasterDetailHeaderId("staff", selectedStaff?.id ?? selectedGroupRaw?.id ?? null);

  const processedStaffGroups = useMemo(() => {
    const userGroups = initialProcessedStaffGroups.filter((g) => {
      const anyG = g as any;
      if (anyG.isAutoUngrouped === true) return false;
      if (anyG.isReportOnly === true || anyG.isSystemReserved === true) return false;
      if (isSystemParentGroup("staff_groups", anyG.id)) return false;
      return true;
    });
    return appendMasterEntitySystemBranchGroups(
      userGroups,
      STAFF_ENTITY_GROUP_PRESET,
      companyId || ""
    );
  }, [initialProcessedStaffGroups, companyId]);

  const selectedGroup = useMemo(
    () =>
      selectedGroupRaw
        ? (resolveMasterEntityGroupForSelection(
            selectedGroupRaw.id,
            processedStaffGroups,
            STAFF_ENTITY_GROUP_PRESET,
            companyId || ""
          ) as StaffGroup | null)
        : null,
    [selectedGroupRaw, processedStaffGroups, companyId]
  );

  const processedStaffGroupsForList = useMemo(() => {
    if (!showOnlyStaffGroupsWithPendingApproval || !showApproveOnList) return processedStaffGroups;
    return processedStaffGroups.filter((g) => (pendingApprovalByStaffGroupId[g.id] ?? 0) > 0);
  }, [
    processedStaffGroups,
    showOnlyStaffGroupsWithPendingApproval,
    showApproveOnList,
    pendingApprovalByStaffGroupId,
  ]);

  const staffLiabilityGroupTree = useMemo(
    () =>
      buildStaffPageLiabilityGroupTree({
        processedStaff,
        salaryGroups: processedStaffGroupsForList,
        staffGroupsMeta: initialProcessedStaffGroups,
        companyId: companyId || "",
      }),
    [processedStaff, processedStaffGroupsForList, initialProcessedStaffGroups, companyId]
  );

  const pendingApprovalByStaffGroupIdWithParent = useMemo(() => {
    let loanMemberPending = 0;
    let staffMemberPending = 0;
    for (const [staffId, count] of Object.entries(pendingApprovalByStaffId)) {
      const row = processedStaff.find((s) => s.id === staffId);
      if (!row || count <= 0) continue;
      if (isLoanLiabilityStaff(row)) loanMemberPending += count;
      else staffMemberPending += count;
    }
    return {
      ...pendingApprovalByStaffGroupId,
      [LOAN_LIABILITY_GROUP_ID]:
        (pendingApprovalByStaffGroupId[LOAN_LIABILITY_GROUP_ID] ?? 0) + loanMemberPending,
      [STAFF_SYSTEM_GROUP_ID]:
        (pendingApprovalByStaffGroupId[STAFF_SYSTEM_GROUP_ID] ?? 0) + staffMemberPending,
    };
  }, [pendingApprovalByStaffGroupId, pendingApprovalByStaffId, processedStaff]);

  /** Party-style tab switch — EXE/APK stale ?selected= snap-back band. */
  const handleStaffTabChange = useCallback(
    (value: string) => {
      const tab = value === "groups" ? "groups" : "staff";
      const items =
        (tab === "groups" ? staffLiabilityGroupTree.allGroups : processedStaff) as ReadonlyArray<{ id: string }>;
      const nextSelected = tabSwitchSelection(
        isMobile,
        pickRememberedListSelection("staffPageState", tab, items)
      );
      pendingStaffSelectIdRef.current = nextSelected?.id ?? null;
      setActiveView(tab);
      setSelected(nextSelected as (typeof processedStaff)[number] | (typeof processedStaffGroups)[number] | null);
      const href = isMobile
        ? masterDetailTabHref("staff", { tab, defaultTab: "staff", listOnly: true })
        : masterDetailCanonicalHref("staff", {
            tab,
            defaultTab: "staff",
            selectedId: nextSelected?.id ?? null,
          });
      replaceMasterDetailTabUrl(href, router, useQueryNav);
      writeMasterDetailPageState("staffPageState", tab, nextSelected?.id);
    },
    [isMobile, useQueryNav, processedStaff, staffLiabilityGroupTree.allGroups, setActiveView, setSelected, router]
  );

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "staffPageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'staff' ? processedStaff : staffLiabilityGroupTree.allGroups, 
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

  // Location-first URL sync (Party jaisa).
  useEffect(() => {
    if (vouchersLoading) return;
    const { view, selectedId } = readMasterDetailLocationQuery();
    const pendingId = pendingStaffSelectIdRef.current;
    if (pendingId) {
      if (selectedId === pendingId) pendingStaffSelectIdRef.current = null;
      else if (selected?.id === pendingId) return;
    }
    if (!selectedId) {
      if (view === "groups") {
        if (activeView !== "groups") setActiveView("groups");
      } else if (activeView !== "staff") {
        setActiveView("staff");
      }
      return;
    }
    const groupItem =
      staffLiabilityGroupTree.allGroups.find((i) => i.id === selectedId) ||
      processedStaffGroups.find((i) => i.id === selectedId);
    const staffItem = processedStaff.find((i) => i.id === selectedId);
    if (view === "groups" && groupItem) setActiveView("groups");
    else if (view === "staff" && staffItem) setActiveView("staff");
    const item =
      groupItem && staffItem
        ? view === "groups"
          ? groupItem
          : staffItem
        : groupItem || staffItem;
    if (item) setSelected(item);
    const canonical =
      view === "groups"
        ? `/staff?view=groups&selected=${encodeURIComponent(selectedId)}`
        : `/staff?selected=${encodeURIComponent(selectedId)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, processedStaff, processedStaffGroups, staffLiabilityGroupTree.allGroups, selected?.id, activeView, setSelected, setActiveView, router]);

  const openPayEmi = () => {
    const staff = selectedStaff as Staff | undefined;
    setPayEmiPreferredAccountId(staff?.id && isLoanLiabilityStaff(staff) ? staff.id : null);
    setPayEmiOpen(true);
  };

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
    return processedStaff.reduce((acc, staff) => acc + staff.balance, 0);
  }, [activeView, processedStaff]);

  const filteredStaffGroupCount = useMemo(() => {
    const q = searchTerm.trim();
    const systemGroups =
      staffLiabilityGroupTree.systemGroups?.length > 0
        ? staffLiabilityGroupTree.systemGroups
        : [staffLiabilityGroupTree.systemGroup];
    if (!q) return Math.max(1, staffLiabilityGroupTree.childGroups.length + 1);
    const childMatches = staffLiabilityGroupTree.childGroups.filter((group) =>
      masterEntityTextMatchesSearch(group.name, searchTerm)
    ).length;
    const systemMatches = systemGroups.filter((group) =>
      masterEntityTextMatchesSearch(group.name, searchTerm)
    ).length;
    return childMatches + systemMatches;
  }, [staffLiabilityGroupTree, searchTerm]);

  const handleSelect = useCallback((item: Staff | StaffGroup, options?: GroupListSelectOptions) => {
    // Staff rows have `groupId`; staff *groups* have `ownerId` too — `"ownerId" in item` breaks child pick.
    const isStaffMember = "groupId" in item;
    pendingStaffSelectIdRef.current = item.id;
    if (isStaffMember) {
      setGroupMemberFilterId(null);
      if (activeView !== "staff") setActiveView("staff");
    } else {
      setGroupMemberFilterId(options?.memberId ?? null);
      setActiveView("groups");
    }
    setSelected(item);
    const path = isStaffMember
      ? `/staff?selected=${encodeURIComponent(item.id)}`
      : `/staff?view=groups&selected=${encodeURIComponent(item.id)}`;
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState(window.history.state, "", browserHistoryHref(path));
      } catch {
        /* ignore */
      }
    }
    if (useQueryNav) {
      router.replace(path, { scroll: false });
    }
  }, [router, setSelected, useQueryNav, setActiveView, activeView]);
  
  const staffForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    return staffMembersForGroupSelection(selectedGroup.id, processedStaff, staffLiabilityGroupTree);
  }, [selectedGroup, processedStaff, staffLiabilityGroupTree]);

  const staffForGroupDetails = useMemo(() => {
    if (!groupMemberFilterId) return staffForSelectedGroup;
    return staffForSelectedGroup.filter((s) => s.id === groupMemberFilterId);
  }, [staffForSelectedGroup, groupMemberFilterId]);

  const staffGroupMembersByGroupId = staffLiabilityGroupTree.groupMembersByGroupId;

  const handleMoveStaffToGroup = useCallback(
    (staff: Staff, targetGroupId: string) =>
      createMasterEntityGroupMoveHandler({
        companyId,
        company,
        groupsForName: staffLiabilityGroupTree.allGroups,
        moveHelpers: staffGroupAccountMove,
        entityLabel: "Staff",
      })(staff, targetGroupId),
    [companyId, company, staffLiabilityGroupTree.allGroups]
  );

  const handleMoveStaffGroupToGroup = useCallback(
    (sourceGroupId: string, targetGroupId: string) =>
      createMasterEntityGroupTreeMoveHandler({
        companyId,
        company,
        groupsForName: staffLiabilityGroupTree.allGroups,
        allGroups: initialProcessedStaffGroups,
        config: STAFF_GROUP_LIST_CONFIG,
        moveHelpers: staffGroupTreeMove,
      })(sourceGroupId, targetGroupId),
    [companyId, company, staffLiabilityGroupTree.allGroups, initialProcessedStaffGroups]
  );

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
        <TabsTrigger listChrome value="staff" className="flex-1">{STAFF_ENTITY_LABEL}</TabsTrigger>
        <TabsTrigger listChrome value="groups" className="flex-1">Groups</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const staffSearchRowEl = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          placeholder={activeView === 'staff' ? STAFF_ENTITY_SEARCH_PLACEHOLDER : 'Search groups/staff'}
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
            {STAFF_ENTITY_ADD_BUTTON}
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
      <div className={cn("grid gap-1", showPayEmiButton ? "grid-cols-3" : "grid-cols-2")}>
        <PermissionButton permission="create_records" variant="outline" size="list" className="w-full" onClick={() => openVoucherDialog("add_salary")}>
          Add Salary
        </PermissionButton>
        {showPayEmiButton ? (
          <PermissionButton
            permission="create_records"
            variant={payEmiButtonVariant(payEmiDue)}
            size="list"
            className={payEmiButtonClassName(payEmiDue, "w-full")}
            onClick={openPayEmi}
          >
            Pay EMI
          </PermissionButton>
        ) : null}
        <PermissionButton permission="create_records" variant="chromePill" size="list" className="w-full" onClick={() => openVoucherDialog("payment_out")}>
          Pay Salary
        </PermissionButton>
      </div>
    </div>
  );

  const staffSectionLabelEl = (
    <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
      <StaffEntityNavIcon className={mlc.sectionIcon} />
      <span>
        {activeView === "staff"
          ? `${STAFF_ENTITY_LABEL} (${filteredStaffListCount})`
          : `Groups (${filteredStaffGroupCount})`}
      </span>
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
        <StaffLiabilityGroupList
          systemGroup={staffLiabilityGroupTree.systemGroup}
          childGroups={staffLiabilityGroupTree.childGroups}
          groupMembersByGroupId={staffGroupMembersByGroupId}
          onSelectGroup={handleSelect}
          selectedGroup={selectedGroup}
          searchTerm={searchTerm}
          pendingApprovalByGroupId={pendingApprovalByStaffGroupIdWithParent}
          pendingApprovalByMemberId={pendingApprovalByStaffId}
          selectedGroupMemberFilterId={groupMemberFilterId}
          getItemHref={useQueryNav ? (g) => `/staff?view=groups&selected=${g.id}` : undefined}
          quickFilter={groupListQuickFilter}
          onQuickFilterChange={setGroupListQuickFilter}
          hideQuickFilterBar
          moveAccountsEnabled={!!companyId}
          onMoveAccountToGroup={handleMoveStaffToGroup}
          canMoveMember={staffGroupAccountMove.canMoveAccount}
          onMoveGroupToGroup={handleMoveStaffGroupToGroup}
          canMoveGroup={staffGroupTreeMove.canMoveGroup}
          allGroupsForMove={initialProcessedStaffGroups}
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
      key={`group-${selectedGroup.id}:${groupMemberFilterId ?? "all"}`}
      group={selectedGroup}
      allGroups={processedStaffGroups}
      staff={staffForGroupDetails}
      groupMemberFilterId={groupMemberFilterId}
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
      title={<LoanStaffNavTitle active="staff" />}
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
            {formatCurrency(totalBalance, { showDrCr: true })}
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
      mobileListSelectionKey={
        selected
          ? `${selected.id}:${activeView === "groups" ? groupMemberFilterId ?? "" : ""}`
          : null
      }
    />
    <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={setIsVoucherDialogOpen}
        onVoucherCreated={() => {}}
        defaultTab={voucherDefaultTab}
        defaultVoucherData={voucherDefaultTab === 'payment_out' ? { payeeType: 'staff', ...(selectedStaff ? { staffId: selectedStaff.id } : {}) } : undefined}
     />
    <StaffPayEmiFlow
      open={payEmiOpen}
      onOpenChange={setPayEmiOpen}
      preferredAccountId={payEmiPreferredAccountId}
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


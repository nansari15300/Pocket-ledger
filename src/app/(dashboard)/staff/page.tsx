
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { cn } from "@/lib/utils";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";

export default function StaffPage() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { formatCurrency, formatRunning } = useDate();
  const { vouchers, loading: vouchersLoading, processedStaff, processedStaffGroups: initialProcessedStaffGroups, userNames } = useVouchers();
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    company?.notificationSettings?.approve?.on !== false &&
    company?.notificationSettings?.approve?.onList !== false;
  const pendingApprovalByStaffId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      if (v.staffId) map[v.staffId] = (map[v.staffId] || 0) + 1;
      const isAddSalaryVoucher =
        (v.type === "journal" && v.subType === "add_salary") || v.type === "add_salary";
      if (isAddSalaryVoucher && Array.isArray(v.entries)) {
        const staffIds = new Set<string>();
        v.entries.forEach((e: any) => {
          const isStaffEntry = Number(e.credit || 0) > 0 && !String(e.narration || "").includes("(Staff ID:");
          if (isStaffEntry && e.accountId) staffIds.add(e.accountId);
        });
        staffIds.forEach((id) => {
          map[id] = (map[id] || 0) + 1;
        });
      }
    });
    return map;
  }, [vouchers, showApproveOnList]);
  const pendingApprovalByStaffGroupId = useMemo(() => {
    if (!showApproveOnList) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    processedStaff.forEach((s: any) => {
      const groupId = s.groupId || "ungrouped";
      map[groupId] = (map[groupId] || 0) + (pendingApprovalByStaffId[s.id] || 0);
    });
    return map;
  }, [processedStaff, pendingApprovalByStaffId, showApproveOnList]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);
  
  const [activeView, setActiveView] = useState("staff");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<Staff | StaffGroup>(`staff_view_${activeView}`);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [voucherDefaultTab, setVoucherDefaultTab] = useState<'add_salary' | 'payment_out'>('add_salary');

  const selectedStaff = activeView === 'staff' ? selected as Staff : null;
  const selectedGroup = activeView === 'groups' ? selected as StaffGroup : null;

  const processedStaffGroups = useMemo(() => {
    const ungrouped = processedStaff.filter(p => !p.groupId);
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
      return [...initialProcessedStaffGroups, ungroupedGroup];
    }
    return initialProcessedStaffGroups;
  }, [processedStaff, initialProcessedStaffGroups, companyId]);

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "staffPageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'staff' ? processedStaff : processedStaffGroups, 
    vouchersLoading           
  );
  // ==================================

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
  }, [companyId]);

  // Restore selection when returning from details (e.g. /staff?selected=xyz or /staff?view=groups&selected=xyz)
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedStaffGroups.find((i) => i.id === selectedIdFromUrl);
    const staffItem = processedStaff.find((i) => i.id === selectedIdFromUrl);
    const item = groupItem || staffItem;
    if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (staffItem) setActiveView("staff");
    if (item) setSelected(item);
    router.replace("/staff", { scroll: false });
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

  // Filtered group count (matches StaffGroupList: exclude system/report-only + search)
  const filteredStaffGroupCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (processedStaffGroups || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true || anyG.isSystemReserved === true) return false;
      if (isSystemParentGroup("staff_groups", anyG.id)) return false;
      return anyG.name && (searchLower ? String(anyG.name).toLowerCase().includes(searchLower) : true);
    }).length;
  }, [processedStaffGroups, searchTerm]);

  const handleSelect = (item: Staff | StaffGroup) => {
    if(isMobile) {
        if ('salary' in item) {
            router.push(`/staff/${item.id}`);
        } else {
            router.push(`/staff/group/${item.id}`);
        }
    } else {
        setSelected(item);
    }
  };
  
  const staffForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
      return processedStaff.filter(p => !p.groupId);
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
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder={activeView === 'staff' ? 'Search staff...' : 'Search groups...'}
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoComplete="off"
                />
            </div>
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
              <span>Staff ({processedStaff.length})</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <StaffList
                staff={processedStaff}
                onSelectStaff={handleSelect as any}
                selectedStaff={selectedStaff}
                searchTerm={searchTerm}
                pendingApprovalByStaffId={pendingApprovalByStaffId}
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
                groups={processedStaffGroups}
                onSelectGroup={handleSelect}
                selectedGroup={selectedGroup}
                searchTerm={searchTerm}
                pendingApprovalByGroupId={pendingApprovalByStaffGroupId}
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
      title="Staff"
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

    
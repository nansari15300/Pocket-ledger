"use client";
import { STAFF_ENTITY_LABEL, STAFF_ENTITY_SEARCH_PLACEHOLDER } from "@/lib/staffEntityDisplayName";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Search } from "lucide-react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { StaffDetails } from "@/components/staff/StaffDetails";
import { StaffList } from "@/components/staff/StaffList";
import type { Staff } from "@/components/staff/types";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "next/navigation";
import { ReportRegisterMobileListChrome } from "@/components/reports/ReportRegisterMobileListChrome";

export function AddSalaryReportDetail() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const { formatCurrency, formatCurrencyForPrint } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedStaff, userNames } = useVouchers();
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllCompanyVouchers, setShowAllCompanyVouchers] = useState(false);
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const hasAutoSelected = useRef(false);

  useEffect(() => {
    if (!isMobile) return;
    // Dashboard `allVouchers=1` mobile par bhi combined list dikhaye — warna pehle list view.
    if (searchParams.get("allVouchers") === "1") return;
    setSelectedStaff(null);
    setShowAllCompanyVouchers(false);
  }, [isMobile, searchParams]);

  const addSalaryVouchers = useMemo(
    () => allVouchers.filter((v) => v.type === "journal" && v.subType === "add_salary"),
    [allVouchers]
  );

  const staffWithSalary = useMemo(() => {
    if (vouchersLoading || addSalaryVouchers.length === 0) return [];
    const staffIdsWithSalary = new Set<string>();
    addSalaryVouchers.forEach((v) =>
      v.entries?.forEach((e: any) => staffIdsWithSalary.add(e.accountId))
    );
    return processedStaff.filter((s) => staffIdsWithSalary.has(s.id));
  }, [addSalaryVouchers, processedStaff, vouchersLoading]);

  const totalSalaryAdded = useMemo(() => {
    return addSalaryVouchers.reduce((sum, v) => {
      const salaryExpenseDebit = v.entries?.find((e: any) => e.debit > 0)?.debit || 0;
      return sum + salaryExpenseDebit;
    }, 0);
  }, [addSalaryVouchers]);

  const staffTransactions = useMemo(() => {
    if (!selectedStaff) return [];
    return addSalaryVouchers.filter((v) =>
      v.entries?.some((e: any) => e.accountId === selectedStaff.id)
    );
  }, [addSalaryVouchers, selectedStaff]);

  const allSalaryVouchersStaff = useMemo(() => {
    if (!showAllCompanyVouchers) return null;
    return { id: "all", name: "All Salary Vouchers", balance: 0, openingBalance: 0 };
  }, [showAllCompanyVouchers]);

  const currentStaff = showAllCompanyVouchers ? (allSalaryVouchersStaff as Staff) : selectedStaff;
  const currentTransactions = showAllCompanyVouchers ? addSalaryVouchers : staffTransactions;

  const filteredStaff = useMemo(
    () => staffWithSalary.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [staffWithSalary, searchTerm]
  );

  const REPORT_MEMORY_KEY = "reportAddSalaryState";

  useEffect(() => {
    if (searchParams.get("allVouchers") === "1") {
      if (!hasAutoSelected.current) {
        hasAutoSelected.current = true;
        setShowAllCompanyVouchers(true);
        setSelectedStaff(null);
      }
      return;
    }
    if (staffWithSalary.length === 0) return;
    if (hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (isMobile) return; // Mobile: don't auto-select, show list first
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(REPORT_MEMORY_KEY) : null;
      const saved = raw ? (JSON.parse(raw) as { staffId?: string }) : null;
      const staffId = saved?.staffId;
      if (staffId) {
        const found = staffWithSalary.find((s) => s.id === staffId);
        if (found) {
          setSelectedStaff(found);
          return;
        }
      }
    } catch (_) {}
    setSelectedStaff(staffWithSalary[0]);
  }, [staffWithSalary, isMobile, searchParams]);

  const handleSelectStaff = useCallback((staff: Staff) => {
    setShowAllCompanyVouchers(false);
    setSelectedStaff(staff);
    try {
      localStorage.setItem(REPORT_MEMORY_KEY, JSON.stringify({ staffId: staff.id }));
    } catch (_) {}
  }, []);

  if (vouchersLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  // Mobile: show list first, then details when selected (like party page)
  if (isMobile) {
    if (currentStaff) {
      return (
        <>
          <div className="flex flex-col h-full min-h-0 overflow-hidden">
            {/* Report mobile: flex chain taaki andar scroll + report footer (Party/Sale jaisa) kaam kare. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <StaffDetails
                staff={currentStaff}
                allStaff={staffWithSalary}
                transactions={currentTransactions}
                onStaffUpdated={() => {}}
                onStaffDeleted={() => { setSelectedStaff(null); setShowAllCompanyVouchers(false); }}
                onShowAll={() => setShowAllCompanyVouchers(true)}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                isAllVouchersView={showAllCompanyVouchers}
                userNames={userNames}
                context="add_salary"
                mobileFooterVariant="report"
                mobileReportStickyTitle={showAllCompanyVouchers ? "All Salary" : "Add Salary"}
                onBack={() => { setSelectedStaff(null); setShowAllCompanyVouchers(false); }}
                onSelectStaff={(staffId) => {
                  const next = staffWithSalary.find((s) => s.id === staffId);
                  if (next) {
                    setShowAllCompanyVouchers(false);
                    setSelectedStaff(next);
                  }
                }}
              />
            </div>
          </div>
          <AddVoucherDialog isOpen={isVoucherOpen} onOpenChange={setIsVoucherOpen} onVoucherCreated={() => {}} defaultTab="add_salary" />
        </>
      );
    }
    return (
      <>
        <ReportRegisterMobileListChrome
          title="Add Salary"
          actionSlot={
            <PermissionButton permission="create_records" className="w-full" onClick={() => setIsVoucherOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Salary Voucher
            </PermissionButton>
          }
          summary={{
            label: "Total Salary Added",
            /* Mobile chrome summary slot typed as string (see ReportRegisterMobileListChrome) */
            amountText: formatCurrencyForPrint(totalSalaryAdded, { noSuffix: true }),
            amountClassName: "text-blue-600",
          }}
          searchPlaceholder={STAFF_ENTITY_SEARCH_PLACEHOLDER}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          listSectionTitle={`${STAFF_ENTITY_LABEL} (${filteredStaff.length})`}
        >
          <StaffList staff={filteredStaff} onSelectStaff={handleSelectStaff} selectedStaff={selectedStaff} searchTerm={searchTerm} />
        </ReportRegisterMobileListChrome>
        <AddVoucherDialog isOpen={isVoucherOpen} onOpenChange={setIsVoucherOpen} onVoucherCreated={() => {}} defaultTab="add_salary" />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,max-content)_minmax(0,1fr)] min-h-0 overflow-hidden">
          <div className="flex flex-col min-h-0 border-r overflow-hidden bg-muted/30">
            <div className="p-4 border-b space-y-3 flex-shrink-0">
              <h2 className="text-lg font-bold font-headline">Add Salary</h2>
              <PermissionButton permission="create_records" className="w-full" onClick={() => setIsVoucherOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Salary Voucher
              </PermissionButton>
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Salary Added</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(totalSalaryAdded, { noSuffix: true })}</p>
              </Card>
            </div>
            <div className="p-3 border-b flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={STAFF_ENTITY_SEARCH_PLACEHOLDER} className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>
            <div className="px-3 pt-2 pb-1 border-b flex-shrink-0">
              <h3 className="text-sm font-semibold">{STAFF_ENTITY_LABEL} ({filteredStaff.length})</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <StaffList staff={filteredStaff} onSelectStaff={handleSelectStaff} selectedStaff={selectedStaff} searchTerm={searchTerm} />
            </div>
          </div>
          <div className="flex flex-col min-h-0 overflow-hidden">
            {currentStaff ? (
              <StaffDetails
                staff={currentStaff}
                // Keep dropdown data available so detail header can offer quick staff switching.
                allStaff={staffWithSalary}
                transactions={currentTransactions}
                onStaffUpdated={() => {}}
                onStaffDeleted={() => setSelectedStaff(null)}
                onShowAll={() => setShowAllCompanyVouchers(true)}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                isAllVouchersView={showAllCompanyVouchers}
                userNames={userNames}
                context="add_salary"
                onSelectStaff={(staffId) => {
                  // Keep user on report page: switch selected staff in-place, no route redirect.
                  const next = staffWithSalary.find((s) => s.id === staffId);
                  if (next) {
                    setShowAllCompanyVouchers(false);
                    setSelectedStaff(next);
                  }
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <Card className="w-full max-w-md text-center">
                  <CardHeader>
                    <CardTitle>Select staff</CardTitle>
                    <CardDescription>Choose a staff from the list to view salary transactions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {staffWithSalary.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No salary vouchers recorded yet. Add a salary voucher to see staff here.</p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
      <AddVoucherDialog isOpen={isVoucherOpen} onOpenChange={setIsVoucherOpen} onVoucherCreated={() => {}} defaultTab="add_salary" />
    </>
  );
}

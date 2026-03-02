
"use client";

import { Button } from "@/components/ui/button";
import { PermissionButton } from "@/components/permission";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Search } from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useCompany } from "@/hooks/useCompany";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { StaffDetails } from "@/components/staff/StaffDetails";
import type { Staff } from "@/components/staff/types";
import { StaffList } from "@/components/staff/StaffList";
import { useDate } from "@/hooks/useDate";
import { useVouchers } from "@/hooks/useVouchers";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { DateRange } from "react-day-picker";
import { useRouter } from "next/navigation";

// ✅ Custom Hook Import
import { usePageMemory } from "@/hooks/usePageMemory";

export default function AddSalaryPage() {
    const { companyId } = useCompany();
    const { user } = useAuth();
    const router = useRouter();
    const { formatCurrency } = useDate();
    const { vouchers: allVouchers, loading: vouchersLoading, processedStaff, userNames } = useVouchers();
    
    const [loading, setLoading] = useState(true);
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showAllCompanyVouchers, setShowAllCompanyVouchers] = useState(false);
    const [isVoucherOpen, setIsVoucherOpen] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        setLoading(vouchersLoading);
    }, [vouchersLoading]);

    // Clear search when company changes (prevent email/other data from carrying over)
    useEffect(() => {
        setSearchTerm("");
    }, [companyId]);

    const addSalaryVouchers = useMemo(() => allVouchers.filter(v => v.type === 'journal' && v.subType === 'add_salary'), [allVouchers]);
    
    const staffWithSalary = useMemo(() => {
        if (loading || addSalaryVouchers.length === 0) return [];
        const staffIdsWithSalary = new Set<string>();
        addSalaryVouchers.forEach(v => v.entries?.forEach((e: any) => staffIdsWithSalary.add(e.accountId)));
        
        return processedStaff
            .filter(s => staffIdsWithSalary.has(s.id));
            
    }, [addSalaryVouchers, processedStaff, loading]);

    // ========== MEMORY LOGIC ==========
    usePageMemory(
        "addSalaryPageState", 
        "staff", // Static View Name
        () => {},  // No-op setter
        selectedStaff,                 
        (staff) => setSelectedStaff(staff),              
        staffWithSalary, 
        vouchersLoading           
    );
    // ==================================

    const handleSelectStaff = useCallback((staff: Staff) => {
        setShowAllCompanyVouchers(false);
        setSelectedStaff(staff);
    }, []);
    
    // (Old Auto-Select Logic Removed)

    const filteredStaff = useMemo(() => {
        return staffWithSalary.filter(s => 
            s.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [staffWithSalary, searchTerm]);
    
    const staffTransactions = useMemo(() => {
        if (!selectedStaff) return [];
        return addSalaryVouchers.filter(v => v.entries?.some((e: any) => e.accountId === selectedStaff.id));
    }, [addSalaryVouchers, selectedStaff]);

    const allSalaryVouchersStaff = useMemo(() => {
        if (!showAllCompanyVouchers) return null;
        
        const totalAmount = addSalaryVouchers.reduce((sum, v) => {
            const staffCreditEntry = (v.entries || []).find((e:any) => processedStaff.some(s => s.id === e.accountId));
            return sum + (staffCreditEntry?.credit || 0);
        }, 0);

        return {
            id: 'all',
            name: 'All Salary Vouchers',
            balance: 0, 
            openingBalance: 0,
        };
    }, [showAllCompanyVouchers, addSalaryVouchers, processedStaff]);
    
    const totalSalaryAdded = useMemo(() => {
        return addSalaryVouchers.reduce((sum, v) => {
            const salaryExpenseDebit = v.entries?.find((e: any) => e.debit > 0)?.debit || 0;
            return sum + salaryExpenseDebit;
        }, 0);
    }, [addSalaryVouchers]);

    const currentStaff = showAllCompanyVouchers ? allSalaryVouchersStaff as any as Staff : selectedStaff;
    const currentTransactions = showAllCompanyVouchers ? addSalaryVouchers : staffTransactions;


    if (loading) {
        return (
          <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-4 p-4 h-full">
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-full w-full" />
            </div>
            <div className="space-y-2">
               <Skeleton className="h-full w-full" />
            </div>
          </div>
        );
      }

    return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] h-full">
            <div className="flex flex-col min-h-0 border-r">
                <div className="p-4 border-b">
                    <h1 className="text-2xl font-bold font-headline">Add Salary</h1>
                    <p className="text-sm text-muted-foreground">Record salary accruals for staff.</p>
                </div>
                <div className="p-4 border-b">
                    <PermissionButton permission="create_records" className="w-full" onClick={() => setIsVoucherOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Salary Voucher
                  </PermissionButton>
                    <Card className="mt-4 p-4 text-center">
                        <p className="text-sm text-muted-foreground">Total Salary Added</p>
                        <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalSalaryAdded, { noSuffix: true })}</p>
                    </Card>
                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search staff..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                </div>
                 <div className="px-4 pt-2 pb-1 border-b">
                    <h3 className="text-sm font-semibold">Staff ({filteredStaff.length})</h3>
                </div>
                <StaffList staff={filteredStaff} onSelectStaff={handleSelectStaff} selectedStaff={selectedStaff} searchTerm={searchTerm}/>
            </div>

             <div className="flex flex-col min-h-0 w-full overflow-x-auto">
                {currentStaff ? (
                   <StaffDetails
                      staff={currentStaff}
                      transactions={currentTransactions}
                      onStaffUpdated={() => {}}
                      onStaffDeleted={() => setSelectedStaff(null)}
                      onShowAll={() => setShowAllCompanyVouchers(true)}
                      dateRange={dateRange}
                      onDateRangeChange={setDateRange}
                      isAllVouchersView={showAllCompanyVouchers}
                      userNames={userNames}
                      context="add_salary"
                    />
                ): (
                     <div className="flex flex-1 items-center justify-center">
                        <Card className="w-full max-w-md text-center">
                             <CardHeader>
                                <CardTitle>No Salary Vouchers Recorded</CardTitle>
                                <CardDescription>Create your first salary voucher to see details here.</CardDescription>
                            </CardHeader>
                             <CardContent>
                               <PermissionButton permission="create_records" onClick={() => setIsVoucherOpen(true)}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add Salary
                              </PermissionButton>
                             </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
        <AddVoucherDialog 
            isOpen={isVoucherOpen}
            onOpenChange={setIsVoucherOpen} 
            onVoucherCreated={() => {}} 
            defaultTab="add_salary"
        />
        </>
    );
}

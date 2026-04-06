'use client';

import { useParams } from 'next/navigation';
import { StaffDetails as DesktopStaffDetails } from '@/components/staff/StaffDetails';
import { useVouchers } from '@/hooks/useVouchers';
import { useState } from 'react';
import type { DateRange } from "@/components/ui/ad-calendar";
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import { useIsMobile } from '@/hooks/use-mobile';

export function StaffDetailsClient() {
  const params = useParams();
  const router = useRouter();
  const { processedStaff, loading, processedStaffGroups, vouchers, userNames } = useVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const isMobile = useIsMobile();
  const staffId = params.id as string;
  const staff = processedStaff.find((s) => s.id === staffId);

  if (loading) return <LoadingSpinner />;
  if (!staff) return <div className="flex items-center justify-center h-full"><p>Staff member not found.</p></div>;

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <DesktopStaffDetails
        staff={staff}
        allStaff={processedStaff}
        allGroups={processedStaffGroups}
        onStaffUpdated={() => {}}
        onStaffDeleted={() => router.push('/staff')}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onBack={() => router.push(`/staff?selected=${encodeURIComponent(staffId)}`)}
        userNames={userNames}
      />
    </div>
  );
}

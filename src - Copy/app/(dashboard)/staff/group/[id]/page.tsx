
'use client';

import { useParams } from 'next/navigation';
import { StaffGroupDetails } from '@/components/staff/StaffGroupDetails';
import { useVouchers } from '@/hooks/useVouchers';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { DateRange } from 'react-day-picker';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

export default function StaffGroupDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { processedStaffGroups, processedStaff, vouchers, loading, userNames } = useVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const groupId = params.id as string;

  const group = processedStaffGroups.find((g) => g.id === groupId);
  
  const staffInGroup = processedStaff.filter(s => s.groupId === groupId);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Group not found.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <StaffGroupDetails
        group={group}
        allGroups={processedStaffGroups}
        staff={staffInGroup}
        onGroupUpdated={() => {}}
        onGroupDeleted={() => router.push('/staff')}
        onStaffUpdated={() => {}}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onBack={() => router.push(`/staff?view=groups&selected=${encodeURIComponent(groupId)}`)}
        userNames={userNames}
      />
    </div>
  );
}

    
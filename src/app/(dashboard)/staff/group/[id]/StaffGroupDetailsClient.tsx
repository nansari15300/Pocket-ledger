'use client';

import { useParams } from 'next/navigation';
import { StaffGroupDetails } from '@/components/staff/StaffGroupDetails';
import { useVouchers } from '@/hooks/useVouchers';
import type { Staff } from '@/components/staff/types';
import { useMemo, useState } from 'react';
import { filterMembersByMasterGroupScope } from '@/lib/masterGroupMemberScope';
import { STAFF_ENTITY_GROUP_PRESET } from '@/lib/masterEntityGroupFormPresets';
import { isMasterEntitySystemGroupId, resolveStaffListGroupBucketId } from '@/lib/masterEntitySystemGroups';
import { STAFF_SYSTEM_GROUP_ID } from '@/lib/staffSystemGroups';
import { LOAN_LIABILITY_GROUP_ID } from '@/modules/loans/constants/loanConstants';
import { isLoanLiabilityStaff } from '@/modules/loans/utils/loanLiabilityStaff';
import type { DateRange } from "@/components/ui/ad-calendar";
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';

export function StaffGroupDetailsClient() {
  const params = useParams();
  const router = useRouter();
  const { processedStaffGroups, processedStaff, vouchers, loading, userNames } = useVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const groupId = params.id as string;
  const group = processedStaffGroups.find((g) => g.id === groupId);
  const staffInGroup = useMemo(() => {
    if (groupId === LOAN_LIABILITY_GROUP_ID) {
      return processedStaff.filter((row) => isLoanLiabilityStaff(row));
    }
    if (groupId === STAFF_SYSTEM_GROUP_ID) {
      return processedStaff.filter((row) => !isLoanLiabilityStaff(row));
    }
    return filterMembersByMasterGroupScope<Staff>(
      groupId,
      processedStaff,
      processedStaffGroups,
      resolveStaffListGroupBucketId,
      (id) => isMasterEntitySystemGroupId(STAFF_ENTITY_GROUP_PRESET, id) || id === LOAN_LIABILITY_GROUP_ID
    );
  }, [groupId, processedStaff, processedStaffGroups]);

  if (loading) return <LoadingSpinner />;
  if (!group) return <div className="flex items-center justify-center h-full"><p>Group not found.</p></div>;

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

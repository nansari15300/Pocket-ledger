"use client";

import { useMemo } from "react";
import { useLoans } from "../hooks/useLoans";
import { summarizeStaffPayEmiButtonState } from "../utils/staffPayEmiState";

export function useStaffPayEmiButtonState(params: {
  companyId: string | null | undefined;
  processedStaff: Array<{ id: string; groupId?: string | null; isLoanAccount?: boolean | null }>;
  selectedAccountId?: string | null;
}) {
  const { allLoans, schedulesByLoan } = useLoans(params.companyId);

  return useMemo(
    () =>
      summarizeStaffPayEmiButtonState({
        processedStaff: params.processedStaff,
        allLoans,
        schedulesByLoan,
        selectedAccountId: params.selectedAccountId,
      }),
    [params.processedStaff, params.selectedAccountId, allLoans, schedulesByLoan]
  );
}

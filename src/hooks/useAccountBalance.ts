
'use client';

import { useMemo } from 'react';
import { useVouchers } from './useVouchers';
import { useAuth } from './useAuth';
import { userCanViewSpecialAccountBalance, userIsSpecialAccountOwner } from '@/lib/specialAccountUsage';
import { useCompany } from './useCompany';

/**
 * A custom hook to get an account's balance while respecting permissions for special accounts.
 * @param accountId The ID of the bank/cash account.
 * @returns An object containing the full account details and the displayable balance (null if permission is denied for a special account).
 */
export function useAccountBalance(accountId: string | null | undefined) {
  const { processedAccounts } = useVouchers();
  const { user } = useAuth();
  const { company } = useCompany();

  const accountDetails = useMemo(() => {
    // Firestore / copy-seed ids kabhi trailing space ya number vs string mismatch — strict `===` se row miss ho jati thi.
    const key = String(accountId ?? "").trim();
    if (!key) {
      return { account: null, displayBalance: null };
    }

    const account = processedAccounts.find((a) => String(a.id ?? "").trim() === key);

    if (!account) {
      return { account: null, displayBalance: null };
    }

    const isOwner = userIsSpecialAccountOwner(String(user?.email || user?.uid || ""), company);
    const canViewBalance = userCanViewSpecialAccountBalance(account, user?.email, isOwner);
    const displayBalance = canViewBalance ? account.balance : null;

    return { account, displayBalance };
  }, [accountId, processedAccounts, company, user?.email, user?.uid]);

  return accountDetails;
}

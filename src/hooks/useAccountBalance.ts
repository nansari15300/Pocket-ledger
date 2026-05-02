
'use client';

import { useMemo } from 'react';
import { useVouchers } from './useVouchers';
import usePermissions from './usePermissions';

/**
 * A custom hook to get an account's balance while respecting permissions for special accounts.
 * @param accountId The ID of the bank/cash account.
 * @returns An object containing the full account details and the displayable balance (null if permission is denied for a special account).
 */
export function useAccountBalance(accountId: string | null | undefined) {
  const { processedAccounts } = useVouchers();
  const { can } = usePermissions();

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

    const canViewBalance = !account.isSpecial || can('view_special_account_balance');
    const displayBalance = canViewBalance ? account.balance : null;

    return { account, displayBalance };
  }, [accountId, processedAccounts, can]);

  return accountDetails;
}

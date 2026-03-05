
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { ExpenseAccountDetails as DesktopExpenseAccountDetails } from '@/components/expenses/ExpenseAccountDetails';
import { useVouchers } from '@/hooks/useVouchers';
import { useState, useEffect, useCallback } from 'react';
import type { DateRange } from "@/components/ui/ad-calendar";
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

export default function ExpenseAccountDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { processedExpenseAccounts, vouchers, loading, journalAccountNames } = useVouchers();
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from && to) {
      return { from: new Date(from), to: new Date(to) };
    }
    return undefined;
  });

  const accountId = params.id as string;
  const account = processedExpenseAccounts.find((p) => p.id === accountId);

  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    setDateRange(newRange);
    const currentParams = new URLSearchParams(window.location.search);
    if (newRange?.from && newRange?.to) {
      currentParams.set('from', newRange.from.toISOString());
      currentParams.set('to', newRange.to.toISOString());
    } else {
      currentParams.delete('from');
      currentParams.delete('to');
    }
    router.replace(`${window.location.pathname}?${currentParams.toString()}`);
  };

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (userNames[userId]) return userNames[userId];
    try {
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data().displayName || userDoc.data().email || "Unknown";
      }
    } catch (e) {}
    return "Unknown";
  }, [userNames]);

  useEffect(() => {
    if (!vouchers) return;
    const uids = new Set(vouchers.map((t) => t.userId).filter(Boolean));
    uids.forEach(async (uid) => {
      if (!userNames[uid as string]) {
        const name = await fetchUserName(uid as string);
        setUserNames((prev) => ({ ...prev, [uid as string]: name }));
      }
    });
  }, [vouchers, userNames, fetchUserName]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!account) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Account not found.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <DesktopExpenseAccountDetails
        account={account}
        allAccounts={processedExpenseAccounts}
        onAccountUpdated={() => {}}
        onAccountDeleted={() => router.push('/incomes')}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        onBack={() => router.push(`/incomes?selected=${encodeURIComponent(accountId)}`)}
        userNames={userNames}
        journalAccountNames={journalAccountNames}
      />
    </div>
  );
}

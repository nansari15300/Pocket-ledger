"use client";

import * as React from "react";
import { syncPendingFiles } from "@/lib/localPendingFiles";
import { syncPendingMasterMutations } from "@/lib/localPendingMasters";
import { syncPendingVoucherMutations } from "@/lib/localPendingVouchers";
import { syncPendingRecycleBinMutations } from "@/lib/localPendingRecycleBin";
import { deleteCompanyComplete } from "@/lib/actions/deleteCompanyAction";
import { useOnlineStatus } from "./use-online-status";
import { useAuth } from "./useAuth";

type UsePendingVoucherSyncOptions = {
  enabled?: boolean;
};

export function usePendingVoucherSync({ enabled = true }: UsePendingVoucherSyncOptions = {}) {
  const { isOnline } = useOnlineStatus();
  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{ synced: number; failed: number } | null>(null);

  const runSync = React.useCallback(async () => {
    if (!enabled || !isOnline || isSyncing) return { synced: 0, failed: 0 };
    setIsSyncing(true);
    try {
      const masterResult = await syncPendingMasterMutations();
      const voucherResult = await syncPendingVoucherMutations();
      const fileResult = await syncPendingFiles();
      const recycleResult = await syncPendingRecycleBinMutations({
        userId: user?.uid,
        deleteCompanyComplete,
      });
      const result = {
        synced: voucherResult.synced + masterResult.synced + fileResult.synced + recycleResult.synced,
        failed: voucherResult.failed + masterResult.failed + fileResult.failed + recycleResult.failed,
      };
      setLastResult(result);
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, isOnline, isSyncing, user?.uid]);

  React.useEffect(() => {
    if (!enabled || !isOnline) return;
    void runSync();
  }, [enabled, isOnline, runSync]);

  return {
    isOnline,
    isSyncing,
    lastResult,
    runSync,
  };
}

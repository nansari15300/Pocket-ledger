"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPendingMasterMutations,
  type PendingMasterCollection,
  subscribePendingMasterMutations,
} from "@/lib/localPendingMasters";

export function usePendingMasterCollection<T = Record<string, any>>(
  companyId: string | null | undefined,
  collection: PendingMasterCollection
) {
  const [records, setRecords] = useState<T[]>([]);

  const refresh = useCallback(async () => {
    if (!companyId) {
      setRecords([]);
      return;
    }
    const pending = await getPendingMasterMutations();
    // Keep only local optimistic rows for the active company/collection so list pages can merge them in-place.
    const next = pending
      .filter((item) => item.companyId === companyId && item.collection === collection)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((item) => item.localRecord as T);
    setRecords(next);
  }, [companyId, collection]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribePendingMasterMutations(() => {
      void refresh();
    });
    return unsubscribe;
  }, [refresh]);

  return records;
}

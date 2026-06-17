"use client";

import { useCallback } from "react";
import { useVouchers } from "@/hooks/useVouchers";
import type { MasterEntityPatchCollection } from "@/lib/masterEntityLiveUpdate";

/** Edit save ke turant baad vouchers context me entity row patch — list/detail live. */
export function useMasterEntityLivePatch<T extends { id?: string }>(params: {
  collection: MasterEntityPatchCollection;
  entityId: string;
  onUpdated?: (patch: Partial<T>) => void;
}): (patch: Partial<T>) => void {
  const { patchMasterEntity } = useVouchers();
  const { collection, entityId, onUpdated } = params;

  return useCallback(
    (patch: Partial<T>) => {
      const id = patch.id ?? entityId;
      if (id) patchMasterEntity(collection, id, patch as Record<string, unknown>);
      onUpdated?.(patch);
    },
    [patchMasterEntity, collection, entityId, onUpdated]
  );
}

"use client";

import { useMasterAccountFreezeFeature } from "@/hooks/useMasterAccountFreezeFeature";

/** @deprecated Use useMasterAccountFreezeFeature().canToggle */
export function useMasterAccountFreezeOwner(): boolean {
  const { canToggle } = useMasterAccountFreezeFeature();
  return canToggle;
}

/** Master account freeze toggle — plan feature + freeze_master_account permission. */
export function useMasterAccountFreezeCanToggle(): boolean {
  const { canToggle } = useMasterAccountFreezeFeature();
  return canToggle;
}

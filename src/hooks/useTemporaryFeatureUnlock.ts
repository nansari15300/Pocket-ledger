"use client";

import { useAdWallet } from "@/hooks/useAdWallet";

export function useTemporaryFeatureUnlock(featureId: string): boolean {
  const { isFeatureTemporarilyUnlocked } = useAdWallet();
  return isFeatureTemporarilyUnlocked(featureId);
}

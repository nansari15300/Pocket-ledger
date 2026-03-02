"use client";

import { useBalanceMode as useBalanceModeContext } from "@/contexts/BalanceModeContext";

/** Re-export type and hook from context so existing imports keep working. */
export type { BalanceMode } from "@/contexts/BalanceModeContext";

export function useBalanceMode() {
  return useBalanceModeContext();
}

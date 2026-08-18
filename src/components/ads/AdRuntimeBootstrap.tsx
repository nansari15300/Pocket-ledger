"use client";

import type { ReactNode } from "react";
import { AdSettingsProvider } from "@/hooks/useAdSettings";
import { AdWalletProvider } from "@/hooks/useAdWallet";

/** Fail-closed ads runtime. Master switch OFF → no Watch-ad UI and no unlock overlay. */
export function AdRuntimeBootstrap({ children }: { children: ReactNode }) {
  return (
    <AdSettingsProvider>
      <AdWalletProvider>{children}</AdWalletProvider>
    </AdSettingsProvider>
  );
}

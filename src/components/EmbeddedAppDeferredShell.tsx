"use client";

import type { ReactNode } from "react";
import { useEmbeddedDeviceLockReady } from "@/hooks/useEmbeddedDeviceLockReady";

/** PIN / setup gate ke dauran SQLite + company providers mount mat karo — slow PC input freeze avoid. */
export function EmbeddedAppDeferredShell({ children }: { children: ReactNode }) {
  const ready = useEmbeddedDeviceLockReady();
  if (!ready) return null;
  return <>{children}</>;
}

"use client";

import { useSyncExternalStore } from "react";
import {
  isPlUiHealthBrakeEngaged,
  subscribePlUiHealthBrake,
} from "@/lib/clientHealthMonitor";

/** Stall / long-task par poora page React tree rok do — sync managers upar rehte hain. */
export function PlUiHealthBrakeGate({ children }: { children: React.ReactNode }) {
  const braked = useSyncExternalStore(
    subscribePlUiHealthBrake,
    isPlUiHealthBrakeEngaged,
    () => false
  );
  if (braked) return null;
  return <>{children}</>;
}

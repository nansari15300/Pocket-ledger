"use client";

import type { Plan, PlanId } from "@/config/plans";
import { getPlan } from "@/config/plans";
import { planAllowsLocalAppServer } from "@/lib/planSyncEntitlements";
import { getEmbeddedLockShellKind } from "@/lib/embeddedDeviceLock";
import { isLocalhostDevPreview } from "@/lib/localAppServerDevPreview";

/** Admin `users` doc override — undefined = follow plan only. */
export function readUserLocalAppServerOverride(
  customUser: Record<string, unknown> | null | undefined
): boolean | null {
  const raw = customUser?.allowLocalAppServer;
  if (raw === true) return true;
  if (raw === false) return false;
  return null;
}

export function resolveLocalAppServerAllowed(input: {
  planId: PlanId | string | null | undefined;
  livePlan?: Plan | null;
  customUser?: Record<string, unknown> | null;
}): boolean {
  if (isLocalhostDevPreview()) return true;
  const kind = getEmbeddedLockShellKind();
  if (kind === "apk") {
    const override = readUserLocalAppServerOverride(input.customUser);
    if (override === false) return false;
    return true;
  }
  if (kind !== "exe") return false;
  const override = readUserLocalAppServerOverride(input.customUser);
  if (override === false) return false;
  if (override === true) return true;
  return planAllowsLocalAppServer(input.planId, input.livePlan ?? getPlan((input.planId as PlanId) || "basic"));
}

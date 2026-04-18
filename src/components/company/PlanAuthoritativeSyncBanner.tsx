"use client";

import Link from "next/link";
import { useCompany } from "@/hooks/useCompany";

/**
 * Server → local plan sync reminders: 20 din touch nahi, offline license khatam, ya 3d verify stale.
 */
export function PlanAuthoritativeSyncBanner() {
  const { planAuthoritativeSync, companyId } = useCompany();
  const s = planAuthoritativeSync;

  if (!companyId) return null;
  if (!s.needsOnlinePlanSync && !s.offlineLicenseExpired && !s.isStale) return null;

  const primary = s.offlineLicenseExpired
    ? "Your offline license period from the server has ended. Connect to the internet and open the app to sync your plan."
    : s.needsOnlinePlanSync
      ? "You have not synced with the server for over 20 days. Go online so your subscription and local license can update."
      : "Subscription status has not been verified with the server recently — stay online briefly to refresh.";

  return (
    <div className="bg-sky-900/90 text-sky-50 text-center py-2 px-4 text-sm flex items-center justify-center gap-2 flex-wrap border-b border-sky-800">
      <span>{primary}</span>
      <Link href="/billing" className="underline font-semibold hover:no-underline whitespace-nowrap">
        Billing
      </Link>
    </div>
  );
}

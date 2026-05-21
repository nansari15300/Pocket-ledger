/**
 * Joined inter-company partners — plan cap (`maxInterCompanyPartners` entitlement).
 * 0 = unlimited (admin PlanDetails convention).
 */
import type { Entitlements } from "@/config/plans";
import { toast } from "sonner";

export const IC_JOINED_LIST_FULL_MESSAGE =
  "Your inter company list is full. Upgrade to increase list.";

/** Plan / admin entitlements se joined-partner cap (0 = unlimited). */
export function maxInterCompanyPartnersFromEntitlements(
  entitlements: Partial<Entitlements> | undefined
): number {
  const v = entitlements?.maxInterCompanyPartners;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Naya partner add karte waqt list full hai? Pehle se joined ho to false. */
export function isInterCompanyJoinedListFull(
  joinedCompanyIds: string[],
  partnerIdToAdd: string,
  maxPartners: number
): boolean {
  if (maxPartners <= 0) return false;
  if (joinedCompanyIds.includes(partnerIdToAdd)) return false;
  return joinedCompanyIds.length >= maxPartners;
}

/** Accept / checkbox block — user ko upgrade path dikhao. */
export function toastInterCompanyJoinedListFull(): void {
  toast.error("Inter company list full", {
    description: IC_JOINED_LIST_FULL_MESSAGE,
    action: { label: "Upgrade", onClick: () => window.location.assign("/billing") },
  });
}

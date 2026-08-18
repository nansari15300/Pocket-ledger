import {
  isAtOrOverEntitlementCap,
  isUnlimitedEntitlementCap,
  type Plan,
  type PlanId,
} from "@/config/plans";
import {
  countLocalCompanySlotsForOwner,
  countOnlineCompanySlotsForOwner,
  maxOnlineCompaniesForPlan,
} from "@/lib/companyOnlineSlots";
import { isCompanySelectorTabFeatureEnabled } from "@/lib/companySelectorTabFeatures";
import {
  planCompanyCapWithAddOns,
  type PurchasedPlanAddOns,
} from "@/lib/planAddOns";
import { planAllowsFirebaseOnline } from "@/lib/planSyncEntitlements";

type CompanyRowForSlots = {
  storageOption?: string;
  isDeleted?: boolean;
  isOwned?: boolean;
  ownerId?: string;
};

export type CreateCompanyAvailability = {
  adminAllowsLocalType: boolean;
  adminAllowsOnlineType: boolean;
  planAllowsOnline: boolean;
  maxOnlineSlots: number;
  usedOnlineSlots: number;
  hasFreeOnlineSlot: boolean;
  maxLocalSlots: number;
  usedLocalSlots: number;
  hasFreeLocalSlot: boolean;
  /** Admin + free local slot */
  showLocalTypeRow: boolean;
  /** Admin + plan allows online + free online slot */
  showOnlineTypeRow: boolean;
  canCreateLocal: boolean;
  canCreateOnline: boolean;
  canCreateAny: boolean;
  showCompanyTypeChoice: boolean;
  defaultStorageMode: "local" | "online";
  blockReason: string | null;
};

export function computeCreateCompanyAvailability(params: {
  featureConfig: Record<string, boolean> | null | undefined;
  planId: PlanId;
  plan: Plan;
  ownerAddons: PurchasedPlanAddOns;
  companyRows: ReadonlyArray<CompanyRowForSlots>;
  ownerUid: string | null | undefined;
}): CreateCompanyAvailability {
  const { featureConfig, planId, plan, ownerAddons, companyRows, ownerUid } = params;
  const adminAllowsLocalType = isCompanySelectorTabFeatureEnabled(featureConfig, "local");
  const adminAllowsOnlineType = isCompanySelectorTabFeatureEnabled(featureConfig, "online");
  const planAllowsOnline = planAllowsFirebaseOnline(planId, plan);

  const maxOnlineSlots = maxOnlineCompaniesForPlan(planId, plan, ownerAddons);
  const usedOnlineSlots = ownerUid
    ? countOnlineCompanySlotsForOwner(companyRows, ownerUid)
    : 0;
  const hasFreeOnlineSlot =
    planAllowsOnline &&
    !isAtOrOverEntitlementCap(usedOnlineSlots, maxOnlineSlots) &&
    (isUnlimitedEntitlementCap(maxOnlineSlots) || maxOnlineSlots > 0);

  const maxLocalSlots = planCompanyCapWithAddOns(plan, true, ownerAddons);
  const usedLocalSlots = ownerUid
    ? countLocalCompanySlotsForOwner(companyRows, ownerUid)
    : 0;
  const hasFreeLocalSlot =
    !isAtOrOverEntitlementCap(usedLocalSlots, maxLocalSlots) &&
    (isUnlimitedEntitlementCap(maxLocalSlots) || maxLocalSlots > 0);

  const showLocalTypeRow = adminAllowsLocalType && hasFreeLocalSlot;
  const showOnlineTypeRow = adminAllowsOnlineType && planAllowsOnline && hasFreeOnlineSlot;

  const canCreateLocal = showLocalTypeRow;
  const canCreateOnline = showOnlineTypeRow;
  const canCreateAny = canCreateLocal || canCreateOnline;
  const showCompanyTypeChoice = canCreateLocal && canCreateOnline;

  const defaultStorageMode: "local" | "online" = canCreateLocal
    ? "local"
    : canCreateOnline
      ? "online"
      : "local";

  let blockReason: string | null = null;
  if (!canCreateAny) {
    if (!adminAllowsLocalType && !adminAllowsOnlineType) {
      blockReason =
        "Local and online company creation are disabled by your administrator.";
    } else if (!adminAllowsLocalType && !planAllowsOnline) {
      blockReason =
        "Your plan does not include online companies and local creation is turned off.";
    } else if (!adminAllowsLocalType && planAllowsOnline && !hasFreeOnlineSlot) {
      blockReason = isUnlimitedEntitlementCap(maxOnlineSlots)
        ? "Online company creation is unavailable right now."
        : maxOnlineSlots === 0
          ? "Your plan does not include online company slots. Upgrade at Billing."
          : `All ${maxOnlineSlots} online company slot${maxOnlineSlots === 1 ? "" : "s"} are in use (${usedOnlineSlots}/${maxOnlineSlots}). Upgrade or remove an online company.`;
    } else if (!planAllowsOnline && adminAllowsOnlineType && !hasFreeLocalSlot) {
      blockReason = isUnlimitedEntitlementCap(maxLocalSlots)
        ? "Local company creation is unavailable right now."
        : `All local company slots are in use (${usedLocalSlots}/${maxLocalSlots}). Upgrade or remove a local company.`;
    } else if (planAllowsOnline && adminAllowsOnlineType && !hasFreeOnlineSlot && !hasFreeLocalSlot) {
      blockReason = `All company slots are in use. Online ${usedOnlineSlots}/${maxOnlineSlots}, local ${usedLocalSlots}/${maxLocalSlots}.`;
    } else if (!hasFreeLocalSlot && !planAllowsOnline) {
      blockReason = `Local slots full (${usedLocalSlots}/${maxLocalSlots}) and your plan has no online companies.`;
    } else {
      blockReason = "Company creation is not available on your plan or account settings.";
    }
  }

  return {
    adminAllowsLocalType,
    adminAllowsOnlineType,
    planAllowsOnline,
    maxOnlineSlots,
    usedOnlineSlots,
    hasFreeOnlineSlot,
    maxLocalSlots,
    usedLocalSlots,
    hasFreeLocalSlot,
    showLocalTypeRow,
    showOnlineTypeRow,
    canCreateLocal,
    canCreateOnline,
    canCreateAny,
    showCompanyTypeChoice,
    defaultStorageMode,
    blockReason,
  };
}

export function resolveCreateStorageMode(
  availability: CreateCompanyAvailability,
  storageMode: "local" | "online"
): "local" | "online" {
  if (availability.canCreateLocal && !availability.canCreateOnline) return "local";
  if (!availability.canCreateLocal && availability.canCreateOnline) return "online";
  if (storageMode === "online" && availability.canCreateOnline) return "online";
  if (storageMode === "local" && availability.canCreateLocal) return "local";
  return availability.defaultStorageMode;
}

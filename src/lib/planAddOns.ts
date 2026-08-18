/**
 * Device / user / company add-ons — Super Admin unit prices + owner-purchased extra slots.
 * Online vs local priced separately. Slots last until plan expiry (renewal re-charges).
 */

import {
  isUnlimitedEntitlementCap,
  isZeroEntitlementCap,
  type Plan,
} from "@/config/plans";

export type AddonKind =
  | "device-online"
  | "device-local"
  | "user-online"
  | "user-local"
  | "company-online"
  | "company-local";

export type DeviceUserAddOnOffer = {
  enabled: boolean;
  pricePerDeviceOnlineNpr: number;
  pricePerDeviceLocalNpr: number;
  pricePerUserOnlineNpr: number;
  pricePerUserLocalNpr: number;
  pricePerCompanyOnlineNpr: number;
  pricePerCompanyLocalNpr: number;
};

export const DEFAULT_DEVICE_USER_ADDON_OFFER: DeviceUserAddOnOffer = {
  enabled: false,
  pricePerDeviceOnlineNpr: 500,
  pricePerDeviceLocalNpr: 400,
  pricePerUserOnlineNpr: 300,
  pricePerUserLocalNpr: 250,
  pricePerCompanyOnlineNpr: 1000,
  pricePerCompanyLocalNpr: 800,
};

export type PurchasedPlanAddOns = {
  extraDevicesOnline: number;
  extraDevicesLocal: number;
  extraUsersOnline: number;
  extraUsersLocal: number;
  extraCompaniesOnline: number;
  extraCompaniesLocal: number;
  /** Align with company/user planExpiryMs — after this, extras are ignored. */
  expiryMs: number | null;
};

export const EMPTY_PURCHASED_PLAN_ADDONS: PurchasedPlanAddOns = {
  extraDevicesOnline: 0,
  extraDevicesLocal: 0,
  extraUsersOnline: 0,
  extraUsersLocal: 0,
  extraCompaniesOnline: 0,
  extraCompaniesLocal: 0,
  expiryMs: null,
};

function floorNonNeg(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : fallback;
  return Math.max(0, Math.floor(Number.isFinite(v) ? v : fallback));
}

export function sanitizeDeviceUserAddOnOffer(raw: unknown): DeviceUserAddOnOffer {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DEVICE_USER_ADDON_OFFER };
  const o = raw as Record<string, unknown>;
  // Legacy single prices → both online + local if new keys missing.
  const legacyDevice =
    typeof o.pricePerDeviceNpr === "number" ? o.pricePerDeviceNpr : DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerDeviceOnlineNpr;
  const legacyUser =
    typeof o.pricePerUserNpr === "number" ? o.pricePerUserNpr : DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerUserOnlineNpr;
  const legacyCompany =
    typeof o.pricePerCompanyNpr === "number"
      ? o.pricePerCompanyNpr
      : DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerCompanyOnlineNpr;
  return {
    enabled: o.enabled === true,
    pricePerDeviceOnlineNpr: floorNonNeg(
      o.pricePerDeviceOnlineNpr,
      floorNonNeg(legacyDevice, DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerDeviceOnlineNpr)
    ),
    pricePerDeviceLocalNpr: floorNonNeg(
      o.pricePerDeviceLocalNpr,
      floorNonNeg(legacyDevice, DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerDeviceLocalNpr)
    ),
    pricePerUserOnlineNpr: floorNonNeg(
      o.pricePerUserOnlineNpr,
      floorNonNeg(legacyUser, DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerUserOnlineNpr)
    ),
    pricePerUserLocalNpr: floorNonNeg(
      o.pricePerUserLocalNpr,
      floorNonNeg(legacyUser, DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerUserLocalNpr)
    ),
    pricePerCompanyOnlineNpr: floorNonNeg(
      o.pricePerCompanyOnlineNpr,
      floorNonNeg(legacyCompany, DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerCompanyOnlineNpr)
    ),
    pricePerCompanyLocalNpr: floorNonNeg(
      o.pricePerCompanyLocalNpr,
      floorNonNeg(legacyCompany, DEFAULT_DEVICE_USER_ADDON_OFFER.pricePerCompanyLocalNpr)
    ),
  };
}

export function readDeviceUserAddOnOfferFromPlansDoc(
  raw: Record<string, unknown> | null | undefined
): DeviceUserAddOnOffer {
  if (!raw) return { ...DEFAULT_DEVICE_USER_ADDON_OFFER };
  return sanitizeDeviceUserAddOnOffer(raw.deviceUserAddOns);
}

export function buildDeviceUserAddOnOfferWritePatch(
  offerInput: DeviceUserAddOnOffer
): Record<string, unknown> {
  return { deviceUserAddOns: sanitizeDeviceUserAddOnOffer(offerInput) };
}

export function unitPriceForAddonKind(offer: DeviceUserAddOnOffer, kind: AddonKind): number {
  switch (kind) {
    case "device-online":
      return offer.pricePerDeviceOnlineNpr;
    case "device-local":
      return offer.pricePerDeviceLocalNpr;
    case "user-online":
      return offer.pricePerUserOnlineNpr;
    case "user-local":
      return offer.pricePerUserLocalNpr;
    case "company-online":
      return offer.pricePerCompanyOnlineNpr;
    case "company-local":
      return offer.pricePerCompanyLocalNpr;
  }
}

export function addonKindLabel(kind: AddonKind, qty = 1): string {
  const plural = qty === 1 ? "" : "s";
  switch (kind) {
    case "device-online":
      return `online device${plural}`;
    case "device-local":
      return `local device${plural}`;
    case "user-online":
      return `online user${plural}`;
    case "user-local":
      return `local user${plural}`;
    case "company-online":
      return `online company slot${plural}`;
    case "company-local":
      return `local company slot${plural}`;
  }
}

export function normalizeAddonKind(raw: unknown): AddonKind {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "device-local" || s === "device_local") return "device-local";
  if (s === "user-online" || s === "user_online") return "user-online";
  if (s === "user-local" || s === "user_local") return "user-local";
  if (s === "company-online" || s === "company_online" || s === "company") return "company-online";
  if (s === "company-local" || s === "company_local") return "company-local";
  if (s === "user") return "user-online";
  // legacy "device" → online
  return "device-online";
}

export function parsePurchasedPlanAddOns(
  raw: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now()
): PurchasedPlanAddOns {
  if (!raw) return { ...EMPTY_PURCHASED_PLAN_ADDONS };
  const expiryRaw = raw.addonExpiryMs ?? raw.addonExpiry;
  let expiryMs: number | null = null;
  if (typeof expiryRaw === "number" && Number.isFinite(expiryRaw)) {
    expiryMs = expiryRaw;
  } else if (expiryRaw && typeof (expiryRaw as { toMillis?: () => number }).toMillis === "function") {
    expiryMs = (expiryRaw as { toMillis: () => number }).toMillis();
  }
  const expired = expiryMs != null && expiryMs <= nowMs;
  if (expired) {
    return { ...EMPTY_PURCHASED_PLAN_ADDONS, expiryMs };
  }
  const legacyDevices = Math.max(0, Math.floor(Number(raw.addonExtraDevices) || 0));
  const legacyUsers = Math.max(0, Math.floor(Number(raw.addonExtraUsers) || 0));
  const legacyCompanies = Math.max(0, Math.floor(Number(raw.addonExtraCompanies) || 0));
  return {
    extraDevicesOnline: Math.max(
      0,
      Math.floor(Number(raw.addonExtraDevicesOnline) || legacyDevices || 0)
    ),
    extraDevicesLocal: Math.max(0, Math.floor(Number(raw.addonExtraDevicesLocal) || 0)),
    extraUsersOnline: Math.max(
      0,
      Math.floor(Number(raw.addonExtraUsersOnline) || legacyUsers || 0)
    ),
    extraUsersLocal: Math.max(0, Math.floor(Number(raw.addonExtraUsersLocal) || 0)),
    extraCompaniesOnline: Math.max(
      0,
      Math.floor(Number(raw.addonExtraCompaniesOnline) || legacyCompanies || 0)
    ),
    extraCompaniesLocal: Math.max(0, Math.floor(Number(raw.addonExtraCompaniesLocal) || 0)),
    expiryMs,
  };
}

/** Plan base cap + purchased extras. Unlimited (-1) stays unlimited; 0 base stays 0 unless extras > 0. */
export function effectiveEntitlementCapWithAddOns(
  planCap: number,
  extraSlots: number
): number {
  if (isUnlimitedEntitlementCap(planCap)) return -1;
  const base = isZeroEntitlementCap(planCap) ? 0 : Math.max(0, Math.floor(planCap));
  const extra = Math.max(0, Math.floor(extraSlots));
  return base + extra;
}

export function planDeviceCapWithAddOns(
  plan: Plan,
  localCompany: boolean,
  addons: PurchasedPlanAddOns
): number {
  const raw = localCompany
    ? Number(plan.entitlements.maxDevicesLocal ?? plan.entitlements.maxDevices)
    : Number(plan.entitlements.maxDevices);
  const planCap = isUnlimitedEntitlementCap(raw)
    ? -1
    : Number.isFinite(raw)
      ? Math.max(0, Math.floor(raw))
      : 1;
  const extra = localCompany ? addons.extraDevicesLocal : addons.extraDevicesOnline;
  return effectiveEntitlementCapWithAddOns(planCap, extra);
}

export function planUserCapWithAddOns(
  plan: Plan,
  localCompany: boolean,
  addons: PurchasedPlanAddOns
): number {
  const raw = localCompany
    ? Number(plan.entitlements.maxUsersLocal ?? plan.entitlements.maxUsers)
    : Number(plan.entitlements.maxUsers);
  const planCap = isUnlimitedEntitlementCap(raw)
    ? -1
    : Number.isFinite(raw)
      ? Math.max(0, Math.floor(raw))
      : 1;
  const extra = localCompany ? addons.extraUsersLocal : addons.extraUsersOnline;
  return effectiveEntitlementCapWithAddOns(planCap, extra);
}

export function planCompanyCapWithAddOns(
  plan: Plan,
  localCompany: boolean,
  addons: PurchasedPlanAddOns
): number {
  const raw = localCompany
    ? Number(plan.entitlements.maxCompaniesLocal ?? plan.entitlements.maxCompanies)
    : Number(plan.entitlements.maxCompanies);
  const planCap = isUnlimitedEntitlementCap(raw)
    ? -1
    : Number.isFinite(raw)
      ? Math.max(0, Math.floor(raw))
      : 1;
  const extra = localCompany ? addons.extraCompaniesLocal : addons.extraCompaniesOnline;
  return effectiveEntitlementCapWithAddOns(planCap, extra);
}

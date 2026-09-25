import { getPlan, normalizePlanIdForClient, type Plan, type PlanId } from "@/config/plans";
import {
  addonKindLabel,
  normalizeAddonKind,
  unitPriceForAddonKind,
  type AddonKind,
  type DeviceUserAddOnOffer,
} from "@/lib/planAddOns";
import {
  grossPriceNpr,
  LEGACY_MULTI_YEAR_TERM_KEYS,
  SUBSCRIPTION_TERM_KEYS_FOR_CHECKOUT,
  type SubscriptionTermKey,
} from "@/lib/subscriptionPlanMath";
export function subscriptionPlanItemId(planId: string): string {
  return `system-item-plan-${normalizePlanIdForClient(planId)}`;
}

export function subscriptionAddonItemId(kind: string): string {
  return `system-item-addon-${normalizeAddonKind(kind)}`;
}

/** @deprecated Legacy single group — use plan/add-on group ids below. */
export const ADMIN_PANEL_SUBSCRIPTION_ITEM_GROUP_ID = "services";
export const ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_ID = "admin-catalog-plans";
export const ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_ID = "admin-catalog-addons";
export const ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_NAME = "Plans";
export const ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_NAME = "Add-ons";
/** Base unit — plan/add-on list price per month (Admin → Plans). */
export const ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT = "Monthly";
export const ADMIN_PANEL_SUBSCRIPTION_UNIT_QUARTER = "Quarter";
export const ADMIN_PANEL_SUBSCRIPTION_UNIT_HALF_YEAR = "Half year";
/** 1 Year = 2 Half year (catalog + sale unit label). */
export const ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT = "Year";
/** @deprecated Use ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT */
export const ADMIN_PANEL_SUBSCRIPTION_UNIT_YEARLY = ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT;
/** Months per year — Yearly ↔ Monthly conversion on catalog items. */
export const ADMIN_PANEL_SUBSCRIPTION_MONTHS_PER_YEAR = 12;

export const ADMIN_PANEL_SUBSCRIPTION_BILLING_UNITS = [
  ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT,
  ADMIN_PANEL_SUBSCRIPTION_UNIT_HALF_YEAR,
  ADMIN_PANEL_SUBSCRIPTION_UNIT_QUARTER,
  ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT,
] as const;
/** Default opening stock qty for admin subscription catalog items (item ledger stock). */
export const ADMIN_PANEL_SUBSCRIPTION_CATALOG_OPENING_STOCK_QTY = 10000;

export type SubscriptionCatalogUnitConversion = {
  fromUnit: string;
  toUnit: string;
  conversionFactor: number;
};

/**
 * 1 Year = 2 Half year; 1 Half year = 2 Quarter; 1 Quarter = 3 Monthly (base rate unit).
 */
export function subscriptionCatalogUnitConversions(): SubscriptionCatalogUnitConversion[] {
  return [
    {
      fromUnit: ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT,
      toUnit: ADMIN_PANEL_SUBSCRIPTION_UNIT_HALF_YEAR,
      conversionFactor: 2,
    },
    {
      fromUnit: ADMIN_PANEL_SUBSCRIPTION_UNIT_HALF_YEAR,
      toUnit: ADMIN_PANEL_SUBSCRIPTION_UNIT_QUARTER,
      conversionFactor: 2,
    },
    {
      fromUnit: ADMIN_PANEL_SUBSCRIPTION_UNIT_QUARTER,
      toUnit: ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT,
      conversionFactor: 3,
    },
  ];
}

export function normalizeSubscriptionCatalogTermKey(
  raw: string | null | undefined
): SubscriptionTermKey {
  const key = String(raw ?? "").trim() as SubscriptionTermKey;
  if (SUBSCRIPTION_TERM_KEYS_FOR_CHECKOUT.has(key)) return key;
  return "year_1";
}

/** Sale line / mirror unit label for checkout term (Admin → Plans billing). */
export function subscriptionCatalogSaleUnitForTerm(term: SubscriptionTermKey): string {
  if (term === "monthly") return ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT;
  if (term === "quarter") return ADMIN_PANEL_SUBSCRIPTION_UNIT_QUARTER;
  if (term === "half_year") return ADMIN_PANEL_SUBSCRIPTION_UNIT_HALF_YEAR;
  if (term === "plan_change_only") return ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT;
  if (/^year_\d+$/.test(term)) return ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT;
  return ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT;
}

export function subscriptionCatalogLineQuantityForTerm(term: SubscriptionTermKey): number {
  const m = /^year_(\d+)$/.exec(term);
  if (m) return Math.min(10, Math.max(1, parseInt(m[1], 10)));
  return 1;
}

export function inferSubscriptionCatalogTermFromSalesAmount(
  salesAmount: number,
  monthly: number,
  yearly: number
): SubscriptionTermKey {
  const amount = Math.max(0, Number(salesAmount) || 0);
  if (amount <= 0) return "year_1";
  const candidates: SubscriptionTermKey[] = [
    "monthly",
    "quarter",
    "half_year",
    "year_1",
    ...LEGACY_MULTI_YEAR_TERM_KEYS,
  ];
  let best: SubscriptionTermKey = "year_1";
  let bestDiff = Infinity;
  for (const term of candidates) {
    const gross = grossPriceNpr(term, monthly, yearly);
    const diff = Math.abs(gross - amount);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = term;
    }
  }
  return bestDiff <= Math.max(1, amount * 0.02) ? best : "year_1";
}

/** Legacy mirror rows used `nos` — map to billing unit for sale form display. */
export function normalizeSubscriptionCatalogLineUnit(
  itemId: string,
  unit: string | null | undefined,
  subscriptionTermKey?: string | null
): string {
  if (!isAdminPanelSubscriptionCatalogItemId(itemId)) {
    return unit != null ? String(unit).trim() : "";
  }
  const raw = String(unit ?? "").trim().toLowerCase();
  if (raw === "yearly") return ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT;
  if (!raw || raw === "nos" || raw === "none" || raw === "unit") {
    const term = subscriptionTermKey
      ? normalizeSubscriptionCatalogTermKey(subscriptionTermKey)
      : "year_1";
    return subscriptionCatalogSaleUnitForTerm(term);
  }
  return String(unit).trim();
}

/** Opening stock qty is in Year; `stockQty` mirror uses Monthly base units (×12 per year). */
export function subscriptionCatalogStockQty(openingBalanceYearly: number): number {
  const qty = Math.max(0, Number(openingBalanceYearly) || 0);
  return qty * ADMIN_PANEL_SUBSCRIPTION_MONTHS_PER_YEAR;
}

/** Opening stock unit for catalog items — default Year (legacy `Yearly` / empty → Year). */
export function subscriptionCatalogDefaultOpeningBalanceUnit(raw?: string | null): string {
  const u = String(raw ?? "").trim();
  if (!u || u.toLowerCase() === "yearly") return ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT;
  if ((ADMIN_PANEL_SUBSCRIPTION_BILLING_UNITS as readonly string[]).includes(u)) return u;
  return ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT;
}

function subscriptionCatalogOpeningStock(openingBalanceRateYearly: number) {
  return {
    openingBalance: ADMIN_PANEL_SUBSCRIPTION_CATALOG_OPENING_STOCK_QTY,
    openingBalanceRate: Math.max(0, openingBalanceRateYearly),
    openingBalanceUnit: ADMIN_PANEL_SUBSCRIPTION_YEARLY_UNIT,
    unitConversions: subscriptionCatalogUnitConversions(),
  };
}

export function isAdminPanelSubscriptionCatalogItemId(itemId: string): boolean {
  const id = String(itemId || "").trim();
  return id.startsWith("system-item-plan-") || id.startsWith("system-item-addon-");
}

export type AdminPanelSubscriptionCatalogFields = {
  name: string;
  type: "item";
  groupId: string;
  salePrice: number;
  purchasePrice: number;
  salePriceUnit: string;
  purchasePriceUnit: string;
  hsCode: string;
  openingBalance: number;
  openingBalanceRate: number;
  openingBalanceUnit: string;
  unitConversions: SubscriptionCatalogUnitConversion[];
};

export function pricingForPlanCatalogItem(plan: Plan): AdminPanelSubscriptionCatalogFields {
  const monthly = Math.max(0, Number(plan.price?.monthly) || 0);
  const yearly = Math.max(0, Number(plan.price?.yearly) || monthly * ADMIN_PANEL_SUBSCRIPTION_MONTHS_PER_YEAR);
  return {
    name: `Plan: ${plan.name}`,
    type: "item",
    groupId: ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_ID,
    salePrice: monthly,
    purchasePrice: monthly,
    salePriceUnit: ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT,
    purchasePriceUnit: ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT,
    hsCode: "",
    ...subscriptionCatalogOpeningStock(yearly),
  };
}

export function pricingForAddonCatalogItem(
  kind: AddonKind,
  offer: DeviceUserAddOnOffer
): AdminPanelSubscriptionCatalogFields {
  const price = Math.max(0, unitPriceForAddonKind(offer, kind));
  const yearly = price * ADMIN_PANEL_SUBSCRIPTION_MONTHS_PER_YEAR;
  const name = `Add-on: ${addonKindLabel(kind, 1)}`;
  return {
    name,
    type: "item",
    groupId: ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_ID,
    salePrice: price,
    purchasePrice: price,
    salePriceUnit: ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT,
    purchasePriceUnit: ADMIN_PANEL_SUBSCRIPTION_SALE_UNIT,
    hsCode: "",
    ...subscriptionCatalogOpeningStock(yearly),
  };
}

export function resolveAdminPanelSubscriptionItemGroupId(itemId: string): string | null {
  if (!isAdminPanelSubscriptionCatalogItemId(itemId)) return null;
  return itemId.startsWith("system-item-plan-")
    ? ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_ID
    : ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_ID;
}

export function resolveAdminPanelSubscriptionCatalogFieldsFromCatalog(
  itemId: string,
  plansById: Record<PlanId, Plan>,
  addonOffer: DeviceUserAddOnOffer
): AdminPanelSubscriptionCatalogFields | null {
  if (itemId.startsWith("system-item-plan-")) {
    const planId = normalizePlanIdForClient(itemId.replace("system-item-plan-", ""));
    const plan = plansById[planId as PlanId] ?? getPlan(planId);
    return pricingForPlanCatalogItem(plan);
  }
  if (itemId.startsWith("system-item-addon-")) {
    const kind = normalizeAddonKind(itemId.replace("system-item-addon-", ""));
    return pricingForAddonCatalogItem(kind, addonOffer);
  }
  return null;
}

export function listAdminPanelSubscriptionCatalogItemIds(): string[] {
  const planIds = ["basic", "advance", "pro", "pro-plus"] as PlanId[];
  const kinds: AddonKind[] = [
    "device-online",
    "device-local",
    "user-online",
    "user-local",
    "company-online",
    "company-local",
  ];
  return [
    ...planIds.map((p) => subscriptionPlanItemId(p)),
    ...kinds.map((k) => subscriptionAddonItemId(k)),
  ];
}

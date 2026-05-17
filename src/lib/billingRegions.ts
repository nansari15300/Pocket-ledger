/**
 * Billing regions — admin Nepal / SAARC / International alag rates set karta hai.
 * User company `country` se region resolve hota hai.
 */
export type BillingRegionId = "nepal" | "saarc" | "international";

export const BILLING_REGION_IDS: BillingRegionId[] = ["nepal", "saarc", "international"];

export type BillingRegionMeta = {
  id: BillingRegionId;
  label: string;
  defaultCurrency: string;
  defaultSymbol: string;
};

export const BILLING_REGIONS: Record<BillingRegionId, BillingRegionMeta> = {
  nepal: { id: "nepal", label: "Nepal", defaultCurrency: "NPR", defaultSymbol: "Rs." },
  saarc: { id: "saarc", label: "SAARC", defaultCurrency: "INR", defaultSymbol: "₹" },
  international: {
    id: "international",
    label: "International",
    defaultCurrency: "USD",
    defaultSymbol: "$",
  },
};

/** SAARC (Nepal alag region me — yahan sirf baaki members). */
export const SAARC_COUNTRIES = new Set(
  [
    "Afghanistan",
    "Bangladesh",
    "Bhutan",
    "India",
    "Maldives",
    "Pakistan",
    "Sri Lanka",
  ].map((c) => c.toLowerCase())
);

/** SAARC member (Nepal alag — admin FX SAARC dropdown is list ke liye). */
export function isSaarcBillingCountry(country?: string | null): boolean {
  const c = String(country ?? "").trim().toLowerCase();
  return Boolean(c) && SAARC_COUNTRIES.has(c);
}

/** International FX dropdown: Nepal + SAARC ke alawa saari countries. */
export function isInternationalBillingCountry(country?: string | null): boolean {
  const c = String(country ?? "").trim().toLowerCase();
  if (!c || c === "nepal") return false;
  return !SAARC_COUNTRIES.has(c);
}

/** Purane `baseRegion` only saves — default country guess (admin dropdown load). */
export function billingRegionToDefaultCountry(region?: BillingRegionId | null): string {
  if (region === "saarc") return "India";
  if (region === "international") return "United States";
  return "Nepal";
}

/** Company country → billing region (plan price + checkout currency). */
export function countryToBillingRegion(country?: string | null): BillingRegionId {
  const c = String(country ?? "").trim().toLowerCase();
  if (!c || c === "nepal") return "nepal";
  if (SAARC_COUNTRIES.has(c)) return "saarc";
  return "international";
}

/** Stripe / gateway ISO lowercase. */
export function billingCurrencyToGatewayCode(code: string): string {
  return String(code || "NPR").trim().toLowerCase();
}

/** Minor units multiplier (paisa / paise / cents). */
export function currencyMinorUnitFactor(code: string): number {
  const c = String(code).toUpperCase();
  if (c === "JPY" || c === "KRW" || c === "VND") return 1;
  return 100;
}

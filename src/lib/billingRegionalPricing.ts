import type { Plan } from "@/config/plans";
import {
  BILLING_REGIONS,
  type BillingRegionId,
  billingCurrencyToGatewayCode,
  countryToBillingRegion,
  currencyMinorUnitFactor,
} from "@/lib/billingRegions";
import { getCurrencySymbolForCode, getDefaultCurrencyForCountry } from "@/lib/worldCurrencies";
import { convertWithFxRates, roundMoneyForCurrency, type FxRatesSnapshot } from "@/lib/liveFxRates";
import { grossPriceNpr, type SubscriptionTermKey } from "@/lib/subscriptionPlanMath";

/** Per-region admin rates — Firestore `plans.{id}.regionalPrices`. */
export type RegionalPlanPrice = {
  monthly: number;
  yearly: number;
  /** ISO 4217 — khali ho to region default (NPR / INR / USD). */
  currency?: string;
  /** SAARC/International: Nepal regional price par % markup (admin PlanDetails). */
  markupPercent?: number;
};

/** SAARC/Intl markup base — Nepal regional price; khali/0 ho to plan.price. */
export function getNepalMarkupBaseAmounts(plan: Plan): { monthly: number; yearly: number } {
  const nepal = plan.regionalPrices?.nepal;
  const monthly =
    nepal != null && Number(nepal.monthly) > 0
      ? Number(nepal.monthly)
      : Number(plan.price.monthly) || 0;
  const yearly =
    nepal != null && Number(nepal.yearly) > 0
      ? Number(nepal.yearly)
      : Number(plan.price.yearly) || 0;
  return { monthly, yearly };
}

/** Yearly vs 12× monthly — "Save XX" billing table row. */
export function computeYearlySaveAmount(monthly: number, yearly: number): number {
  const m = Number(monthly) || 0;
  const y = Number(yearly) || 0;
  if (m <= 0 || y <= 0) return 0;
  return Math.max(0, Math.round(m * 12 - y));
}

/** Base amount + markup % → regional monthly/yearly preview. */
export function regionalPriceWithMarkup(base: number, markupPercent: number): number {
  const b = Number(base) || 0;
  const p = Number(markupPercent) || 0;
  if (!Number.isFinite(p) || p === 0) return b;
  return Math.round(b * (1 + p / 100));
}

export type RegionalPlanPricesMap = Partial<Record<BillingRegionId, RegionalPlanPrice>>;

/** `app_settings/billing_pricing` — base currency admin catalog ke liye. */
export type BillingPricingSettings = {
  /** ISO 4217 — catalog prices is currency me store. */
  baseCurrency: string;
  /** Admin ne jo country chuni — dropdown value + FX box symbol. */
  baseCountry?: string;
  /** Live FX SAARC card — sirf SAARC countries list se. */
  saarcFxCountry?: string;
  /** Live FX International card — SAARC/Nepal ke alawa. */
  internationalFxCountry?: string;
  /** Default region label — searchable country se resolve → baseRegion. */
  defaultRegionCountry?: string;
  baseRegion: BillingRegionId;
  updatedAtMs?: number;
};

export const DEFAULT_BILLING_PRICING_SETTINGS: BillingPricingSettings = {
  baseCurrency: "NPR",
  baseCountry: "Nepal",
  saarcFxCountry: "India",
  internationalFxCountry: "United States",
  defaultRegionCountry: "Nepal",
  baseRegion: "nepal",
};

export function getRegionalCurrency(region: BillingRegionId, row?: RegionalPlanPrice | null): string {
  return (
    String(row?.currency ?? "").trim().toUpperCase() ||
    BILLING_REGIONS[region].defaultCurrency
  );
}

export function getRegionalSymbol(region: BillingRegionId, row?: RegionalPlanPrice | null): string {
  const code = getRegionalCurrency(region, row);
  return getCurrencySymbolForCode(code) || BILLING_REGIONS[region].defaultSymbol;
}

/**
 * Effective monthly/yearly for a region: admin `regionalPrices` pehle;
 * warna base `plan.price` + live FX se convert.
 */
export function resolveRegionalPlanPrices(
  plan: Plan,
  region: BillingRegionId,
  fx?: FxRatesSnapshot | null,
  settings: BillingPricingSettings = DEFAULT_BILLING_PRICING_SETTINGS
): { monthly: number; yearly: number; currency: string; symbol: string; fromFx: boolean } {
  const row = plan.regionalPrices?.[region];
  const hasExplicit =
    row &&
    (Number(row.monthly) > 0 || Number(row.yearly) > 0 || plan.isFree);
  if (hasExplicit && row) {
    const currency = getRegionalCurrency(region, row);
    return {
      monthly: Number(row.monthly) || 0,
      yearly: Number(row.yearly) || 0,
      currency,
      symbol: getRegionalSymbol(region, row),
      fromFx: false,
    };
  }

  const baseCurrency = String(plan.currency || settings.baseCurrency || "NPR").toUpperCase();
  const targetCurrency = getRegionalCurrency(region, row);
  const rates = fx?.rates ?? {};
  const fxBase = fx?.base ?? settings.baseCurrency;
  const monthly = roundMoneyForCurrency(
    fx && Object.keys(rates).length
      ? convertWithFxRates(plan.price.monthly, baseCurrency, targetCurrency, fxBase, rates)
      : plan.price.monthly,
    targetCurrency
  );
  const yearly = roundMoneyForCurrency(
    fx && Object.keys(rates).length
      ? convertWithFxRates(plan.price.yearly, baseCurrency, targetCurrency, fxBase, rates)
      : plan.price.yearly,
    targetCurrency
  );
  return {
    monthly,
    yearly,
    currency: targetCurrency,
    symbol: getRegionalSymbol(region, row),
    fromFx: true,
  };
}

export function formatRegionalMoney(
  amount: number,
  symbol: string,
  currencyCode?: string
): string {
  const locale =
    currencyCode === "USD" ? "en-US" : currencyCode === "EUR" ? "de-DE" : "en-IN";
  return `${symbol} ${amount.toLocaleString(locale)}`;
}

/** User country → display currency me convert (regional row + FX). */
export function convertPlanGrossForCountry(
  plan: Plan,
  termKey: SubscriptionTermKey,
  country: string,
  fx?: FxRatesSnapshot | null,
  settings: BillingPricingSettings = DEFAULT_BILLING_PRICING_SETTINGS
): { amount: number; symbol: string; currency: string } {
  const region = countryToBillingRegion(country);
  const target = getDefaultCurrencyForCountry(country);
  const resolved = resolveRegionalPlanPrices(plan, region, fx, settings);
  const gross = grossPriceNpr(termKey, resolved.monthly, resolved.yearly);
  const catalogBase = String(settings.baseCurrency || "NPR").toUpperCase();
  const fromCode = resolved.fromFx ? resolved.currency : catalogBase;
  let amount = gross;
  const rates = fx?.rates ?? {};
  const fxBase = fx?.base ?? catalogBase;
  if (Object.keys(rates).length > 0 && fromCode !== target.currencyCode) {
    amount = roundMoneyForCurrency(
      convertWithFxRates(gross, fromCode, target.currencyCode, fxBase, rates),
      target.currencyCode
    );
  }
  return { amount, symbol: target.symbol, currency: target.currencyCode };
}

export function formatPlanPriceForCountry(
  plan: Plan,
  termKey: SubscriptionTermKey,
  country: string,
  fx?: FxRatesSnapshot | null,
  settings?: BillingPricingSettings
): string {
  const { amount, symbol, currency } = convertPlanGrossForCountry(
    plan,
    termKey,
    country,
    fx,
    settings
  );
  if (amount <= 0) return "";
  return formatRegionalMoney(amount, symbol, currency);
}

export function formatRegionalTermPrice(
  plan: Plan,
  termKey: SubscriptionTermKey,
  region: BillingRegionId,
  fx?: FxRatesSnapshot | null,
  settings?: BillingPricingSettings
): string {
  const country =
    region === "nepal"
      ? "Nepal"
      : region === "saarc"
        ? "India"
        : "United States";
  return formatPlanPriceForCountry(plan, termKey, country, fx, settings);
}

/** Checkout: region amount → gateway minor units + currency code. */
export function regionalCheckoutCharge(
  plan: Plan,
  termKey: SubscriptionTermKey,
  region: BillingRegionId,
  fx?: FxRatesSnapshot | null,
  settings?: BillingPricingSettings
): { amountMinor: number; currency: string; gross: number; symbol: string } {
  const country =
    region === "nepal" ? "Nepal" : region === "saarc" ? "India" : "United States";
  return regionalCheckoutChargeForCountry(plan, termKey, country, fx, settings);
}

/** Checkout — user ke chune country currency + converted gross. */
export function regionalCheckoutChargeForCountry(
  plan: Plan,
  termKey: SubscriptionTermKey,
  country: string,
  fx?: FxRatesSnapshot | null,
  settings?: BillingPricingSettings
): { amountMinor: number; currency: string; gross: number; symbol: string } {
  const { amount, symbol, currency } = convertPlanGrossForCountry(
    plan,
    termKey,
    country,
    fx,
    settings
  );
  const factor = currencyMinorUnitFactor(currency);
  return {
    gross: amount,
    currency: billingCurrencyToGatewayCode(currency),
    amountMinor: Math.round(amount * factor),
    symbol,
  };
}

export { countryToBillingRegion };

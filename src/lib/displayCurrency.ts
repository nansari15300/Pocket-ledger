import {
  getCurrencySymbolForCode,
  getDefaultCurrencyForCountry,
  type CountryCurrencyRow,
} from "@/lib/worldCurrencies";

/** Company / user context — Firestore `companies` + optional plan catalog currency. */
export type DisplayCurrencySource = {
  country?: string | null;
  currencyCode?: string | null;
  currencySymbol?: string | null;
};

/**
 * Ledger UI + billing display: company symbol wins, phir code, phir country default.
 * Payment gateways ab bhi NPR charge karte hain — ye sirf dikhane ke liye.
 */
export type ResolvedDisplayCurrency = CountryCurrencyRow & { displaySymbol: string };

export function resolveDisplayCurrency(source?: DisplayCurrencySource | null): ResolvedDisplayCurrency {
  const country = String(source?.country ?? "").trim() || "Nepal";
  const fromCountry = getDefaultCurrencyForCountry(country);
  const code = String(source?.currencyCode ?? "").trim().toUpperCase() || fromCountry.currencyCode;
  const symbol =
    String(source?.currencySymbol ?? "").trim() ||
    getCurrencySymbolForCode(code) ||
    fromCountry.symbol;
  return {
    country,
    currencyCode: code,
    currencyName: fromCountry.currencyName,
    symbol,
    displaySymbol: symbol,
  };
}

/** Plan price line: plan.currency ISO + optional company display override. */
export function formatMoneyWithDisplaySymbol(
  amount: number,
  opts?: { symbol?: string; currencyCode?: string; locale?: string }
): string {
  const sym =
    opts?.symbol?.trim() ||
    getCurrencySymbolForCode(opts?.currencyCode) ||
    "Rs.";
  const locale = opts?.locale ?? "en-IN";
  return `${sym} ${amount.toLocaleString(locale)}`;
}

/**
 * Live FX — open.er-api.com (no API key). Server + client cache for "today".
 */
export type FxRatesSnapshot = {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetchedAtMs: number;
};

const FX_CACHE_MS = 60 * 60 * 1000;
let serverCache: { key: string; snap: FxRatesSnapshot } | null = null;

function cacheKey(base: string) {
  return base.toUpperCase();
}

/** Server: fetch latest rates with in-memory TTL cache. */
export async function fetchLiveFxRatesServer(baseCurrency: string): Promise<FxRatesSnapshot> {
  const base = String(baseCurrency || "NPR").trim().toUpperCase();
  const key = cacheKey(base);
  const now = Date.now();
  if (serverCache && serverCache.key === key && now - serverCache.snap.fetchedAtMs < FX_CACHE_MS) {
    return serverCache.snap;
  }
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`FX API failed (${res.status})`);
  }
  const json = (await res.json()) as {
    result?: string;
    base_code?: string;
    time_last_update_utc?: string;
    rates?: Record<string, number>;
  };
  if (json.result !== "success" || !json.rates) {
    throw new Error("FX API returned invalid data");
  }
  const snap: FxRatesSnapshot = {
    base: json.base_code || base,
    date: json.time_last_update_utc?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    rates: json.rates,
    fetchedAtMs: now,
  };
  serverCache = { key, snap };
  return snap;
}

/**
 * Convert using open.er-api rates (all relative to `fxBase`).
 * `rates[CUR]` = how many CUR per 1 fxBase.
 */
export function convertWithFxRates(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxBase: string,
  rates: Record<string, number>
): number {
  const from = String(fromCurrency).toUpperCase();
  const to = String(toCurrency).toUpperCase();
  const base = String(fxBase).toUpperCase();
  if (from === to) return amount;
  if (!Number.isFinite(amount)) return 0;
  if (from === base) {
    const r = rates[to];
    return r != null && Number.isFinite(r) ? amount * r : amount;
  }
  if (to === base) {
    const r = rates[from];
    return r != null && Number.isFinite(r) && r !== 0 ? amount / r : amount;
  }
  const rFrom = rates[from];
  const rTo = rates[to];
  if (
    rFrom != null &&
    rTo != null &&
    Number.isFinite(rFrom) &&
    Number.isFinite(rTo) &&
    rFrom !== 0
  ) {
    return (amount / rFrom) * rTo;
  }
  return amount;
}

/** Round for display / checkout (whole rupees/dollars for NPR/INR/USD catalog). */
export function roundMoneyForCurrency(amount: number, currencyCode: string): number {
  const c = String(currencyCode).toUpperCase();
  if (c === "JPY" || c === "KRW") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

export const FY_VOUCHER_INDEX_SCHEMA_VERSION = 1;

/** Cached distinct FY keys with vouchers — fiscal split settings (1 doc read online). */
export type FyVoucherIndex = {
  schemaVersion: number;
  fyKeys: string[];
  minDateMs: number | null;
  maxDateMs: number | null;
  updatedAtMs: number;
};

const MAX_SUPPORTED_FY_YEAR = 99_999;

function isSafeFyKey(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d{1,5})-(\d{1,5})$/.exec(value.trim());
  if (!match) return false;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  return (
    Number.isInteger(startYear) &&
    Number.isInteger(endYear) &&
    startYear > 0 &&
    endYear > 0 &&
    startYear <= MAX_SUPPORTED_FY_YEAR &&
    endYear <= MAX_SUPPORTED_FY_YEAR &&
    Math.abs(endYear - startYear) <= 1
  );
}

function sortedUniqueSafeFyKeys(keys: unknown[]): string[] {
  const safe = new Set<string>();
  const rejected: string[] = [];
  let rejectedCount = 0;
  for (const raw of keys) {
    const value = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (isSafeFyKey(value)) safe.add(value);
    else {
      rejectedCount += 1;
      if (rejected.length < 8) rejected.push(value.slice(0, 80));
    }
  }
  if (rejected.length) {
    console.warn("[FY-SCAN] rejected invalid FY keys", {
      rejectedSample: rejected,
      rejectedCount,
    });
  }
  return [...safe].sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));
}

export function normalizeFyVoucherIndex(raw: unknown): FyVoucherIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const schemaVersion = Number(o.schemaVersion) || 0;
  if (schemaVersion !== FY_VOUCHER_INDEX_SCHEMA_VERSION) return null;
  const fyKeys = Array.isArray(o.fyKeys) ? sortedUniqueSafeFyKeys(o.fyKeys) : [];
  if (!fyKeys.length) return null;
  const minDateMs = o.minDateMs != null && Number.isFinite(Number(o.minDateMs)) ? Number(o.minDateMs) : null;
  const maxDateMs = o.maxDateMs != null && Number.isFinite(Number(o.maxDateMs)) ? Number(o.maxDateMs) : null;
  const updatedAtMs = Number(o.updatedAtMs) || Date.now();
  return {
    schemaVersion: FY_VOUCHER_INDEX_SCHEMA_VERSION,
    fyKeys,
    minDateMs,
    maxDateMs,
    updatedAtMs,
  };
}

export function mergeFyKeyIntoIndex(
  index: FyVoucherIndex | null,
  fyKey: string,
  dateMs: number
): FyVoucherIndex {
  const sorted = sortedUniqueSafeFyKeys([...(index?.fyKeys ?? []), fyKey]);
  return {
    schemaVersion: FY_VOUCHER_INDEX_SCHEMA_VERSION,
    fyKeys: sorted,
    minDateMs:
      index?.minDateMs != null ? Math.min(index.minDateMs, dateMs) : dateMs,
    maxDateMs:
      index?.maxDateMs != null ? Math.max(index.maxDateMs, dateMs) : dateMs,
    updatedAtMs: Date.now(),
  };
}

export function buildFyVoucherIndexFromKeys(
  fyKeys: string[],
  minDateMs: number | null = null,
  maxDateMs: number | null = null
): FyVoucherIndex {
  const sorted = sortedUniqueSafeFyKeys(fyKeys);
  return {
    schemaVersion: FY_VOUCHER_INDEX_SCHEMA_VERSION,
    fyKeys: sorted,
    minDateMs,
    maxDateMs,
    updatedAtMs: Date.now(),
  };
}

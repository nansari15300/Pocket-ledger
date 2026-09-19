export const FY_VOUCHER_INDEX_SCHEMA_VERSION = 1;

/** Cached distinct FY keys with vouchers — fiscal split settings (1 doc read online). */
export type FyVoucherIndex = {
  schemaVersion: number;
  fyKeys: string[];
  minDateMs: number | null;
  maxDateMs: number | null;
  updatedAtMs: number;
};

export function normalizeFyVoucherIndex(raw: unknown): FyVoucherIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const schemaVersion = Number(o.schemaVersion) || 0;
  if (schemaVersion !== FY_VOUCHER_INDEX_SCHEMA_VERSION) return null;
  const fyKeys = Array.isArray(o.fyKeys)
    ? o.fyKeys.map((k) => String(k || "").trim()).filter(Boolean)
    : [];
  if (!fyKeys.length) return null;
  const minDateMs = o.minDateMs != null && Number.isFinite(Number(o.minDateMs)) ? Number(o.minDateMs) : null;
  const maxDateMs = o.maxDateMs != null && Number.isFinite(Number(o.maxDateMs)) ? Number(o.maxDateMs) : null;
  const updatedAtMs = Number(o.updatedAtMs) || Date.now();
  return {
    schemaVersion: FY_VOUCHER_INDEX_SCHEMA_VERSION,
    fyKeys: [...new Set(fyKeys)].sort((a, b) => {
      const aStart = Number(a.split("-")[0]) || 0;
      const bStart = Number(b.split("-")[0]) || 0;
      return aStart - bStart;
    }),
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
  const keys = new Set(index?.fyKeys ?? []);
  keys.add(fyKey);
  const sorted = [...keys].sort((a, b) => {
    const aStart = Number(a.split("-")[0]) || 0;
    const bStart = Number(b.split("-")[0]) || 0;
    return aStart - bStart;
  });
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
  const sorted = [...new Set(fyKeys)].sort((a, b) => {
    const aStart = Number(a.split("-")[0]) || 0;
    const bStart = Number(b.split("-")[0]) || 0;
    return aStart - bStart;
  });
  return {
    schemaVersion: FY_VOUCHER_INDEX_SCHEMA_VERSION,
    fyKeys: sorted,
    minDateMs,
    maxDateMs,
    updatedAtMs: Date.now(),
  };
}

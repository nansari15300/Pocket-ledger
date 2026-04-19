import { startOfDay } from "date-fns";

/** Sirf fiscal fields — `useCompany` import avoid (heavy / circular risk). */
type FiscalCompanyLike = {
  fiscalSplitMode?: string;
  fiscalMergePartitionAt?: { toDate?: () => Date } | unknown;
};

/** Synthetic row type: ledger + print isi se divider dikhate hain (merge mode). */
export const FISCAL_YEAR_PARTITION_ROW_TYPE = "fiscal_year_partition";

function rowSortTime(t: any): number | null {
  // Synthetic divider ko sort key mat banao — warna Recent (desc) me boundary galat.
  if (!t || t.type === FISCAL_YEAR_PARTITION_ROW_TYPE || (t as any)._spendWiseSpacer) return null;
  // Opening row ke paas reliable date nahi → transition detect mat karo is se
  if (t.type === "opening_balance") return null;
  const raw = t.date;
  if (!raw) return null;
  const d =
    raw instanceof Date ? raw : typeof raw.toDate === "function" ? raw.toDate() : new Date(raw);
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return startOfDay(d).getTime();
}

/**
 * Merge divider: partition date ke dono taraf list ho (asc ya desc) — boundary cross par ek hi row.
 */
export function insertFiscalPartitionRows(
  rowsInDisplayOrder: any[],
  partitionAt: Date | null | undefined,
  label?: string | null
): any[] {
  if (!partitionAt || !rowsInDisplayOrder?.length) return rowsInDisplayOrder;
  const boundary = startOfDay(partitionAt).getTime();
  const defaultLabel = (label && String(label).trim()) || "── Closing fiscal period · New fiscal period ──";
  const out: any[] = [];
  let lastKeyed: number | null = null;
  let inserted = false;
  for (let i = 0; i < rowsInDisplayOrder.length; i++) {
    const t = rowsInDisplayOrder[i];
    if (t?.type === FISCAL_YEAR_PARTITION_ROW_TYPE) {
      out.push(t);
      continue;
    }
    const key = rowSortTime(t);
    if (!inserted && lastKeyed != null && key != null) {
      const ascCross = lastKeyed < boundary && key >= boundary;
      const descCross = lastKeyed >= boundary && key < boundary;
      if (ascCross || descCross) {
        out.push({
          id: `__fiscal_partition_${boundary}_${i}`,
          type: FISCAL_YEAR_PARTITION_ROW_TYPE,
          _partitionLabel: defaultLabel,
        });
        inserted = true;
      }
    }
    out.push(t);
    if (key != null) lastKeyed = key;
  }
  return out;
}

/** Timestamp / local `{ toDate }` / ISO string (localStorage merge) se Date. */
function coercePartitionDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return !isNaN(raw.getTime()) ? startOfDay(raw) : null;
  if (typeof raw === "object" && raw !== null && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? startOfDay(d) : null;
  }
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    return d instanceof Date && !isNaN(d.getTime()) ? startOfDay(d) : null;
  }
  return null;
}

/** Company doc (+ locally merged) se merge partition date (AD start-of-day). */
export function getFiscalMergePartitionDateFromCompany(company: FiscalCompanyLike | null | undefined): Date | null {
  if (!company || company.fiscalSplitMode !== "merge") return null;
  const d = coercePartitionDate(company.fiscalMergePartitionAt);
  return d;
}

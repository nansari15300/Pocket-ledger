import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { patchVoucherFields } from "@/lib/writeGateway/voucherActionsClient";
import {
  autoVoucherIncludesFySegment,
  DEFAULT_VOUCHER_PREFIX_LABELS,
  formatContraVoucherNumbersFromSerial,
  getVoucherPrefixKeyFromLike,
  resolveCompanyVoucherPrefixList,
  resolveVoucherNumberFyFormat,
  resolveVoucherPrefixForKey,
  voucherSerialPrefixAliases,
} from "@/lib/nextVoucherNumber";
import { voucherFySegmentForDate } from "@/lib/fiscalYearLabel";
import { formatVoucherNumberWithFy, normalizePrefix } from "@/lib/voucherNumberFormat";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

export type RepairAutoVoucherNumbersProgress = { done: number; total: number };

function voucherRowDate(row: Record<string, unknown>): Date {
  const d = parseFirestoreDateFieldToJsDate(row.date);
  return d && !isNaN(d.getTime()) ? d : new Date(0);
}

function isAutoNumberingEnabledForRow(
  companyDoc: Record<string, unknown>,
  prefixKey: string
): boolean {
  const map = companyDoc.autoVoucherNumbering as Record<string, boolean> | undefined;
  return map?.[prefixKey] !== false;
}

function detectPrefixForVoucherNo(
  voucherNo: string,
  prefixKey: string,
  companyDoc: Record<string, unknown>
): string | null {
  const configured = resolveCompanyVoucherPrefixList(
    prefixKey,
    (companyDoc.voucherPrefixes as Record<string, string[] | undefined> | undefined)?.[prefixKey]
  );
  const trimmed = (voucherNo || "").trim();
  if (!trimmed) return configured[0] || null;
  let best: { prefix: string; len: number } | null = null;
  for (const p of configured) {
    for (const alias of voucherSerialPrefixAliases(prefixKey, p)) {
      const norm = normalizePrefix(alias);
      if (trimmed.startsWith(alias) || (norm && trimmed.startsWith(norm))) {
        const len = Math.max(alias.length, norm.length);
        if (!best || len > best.len) best = { prefix: resolveVoucherPrefixForKey(prefixKey, p), len };
      }
    }
  }
  return best?.prefix || configured[0] || null;
}

type NumberingGroupKey = string;

function buildGroupKey(prefixKey: string, prefix: string, fySegment: string | null): NumberingGroupKey {
  return `${prefixKey}\0${normalizePrefix(prefix)}\0${fySegment || ""}`;
}

/**
 * Renumber vouchers that use auto numbering — FY segment from each voucher's date when enabled.
 */
export async function repairAutoVoucherNumbers(params: {
  companyId: string;
  companyDoc: Record<string, unknown>;
  onProgress?: (p: RepairAutoVoucherNumbersProgress) => void;
}): Promise<{ updated: number; skipped: number }> {
  const { companyId, companyDoc, onProgress } = params;
  const includeFy = autoVoucherIncludesFySegment(companyDoc);
  const fyFormat = resolveVoucherNumberFyFormat(companyDoc);

  const rows = await listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true });
  const active = rows.filter((r) => {
    if ((r as { isDeleted?: boolean }).isDeleted) return false;
    if ((r as { deletedAt?: unknown }).deletedAt) return false;
    return true;
  });

  type Grouped = {
    prefixKey: string;
    prefix: string;
    fySegment: string | null;
    items: Array<{ id: string; row: Record<string, unknown> }>;
  };
  const groups = new Map<NumberingGroupKey, Grouped>();

  for (const row of active) {
    const id = String((row as { id?: string }).id || "").trim();
    if (!id) continue;
    const type = String(row.type || "");
    const prefixKey = getVoucherPrefixKeyFromLike({
      type,
      subType: row.subType as string | undefined,
      lineItems: row.lineItems as Array<{ type?: string }> | undefined,
    });
    if (!isAutoNumberingEnabledForRow(companyDoc, prefixKey)) continue;

    const voucherNo =
      type === "production"
        ? String((row as { productionNumber?: string }).productionNumber || row.voucherNumber || "")
        : type === "contra"
          ? String((row as { voucherNumberOut?: string }).voucherNumberOut || row.voucherNumber || "")
          : String(row.voucherNumber || "");
    if (!voucherNo.trim()) continue;

    const prefix =
      detectPrefixForVoucherNo(voucherNo, prefixKey, companyDoc) ||
      resolveVoucherPrefixForKey(prefixKey, DEFAULT_VOUCHER_PREFIX_LABELS[prefixKey] || "V-");
    const date = voucherRowDate(row);
    const fySegment = includeFy
      ? voucherFySegmentForDate(
          companyDoc as { country?: string; fiscalYearStart?: unknown },
          date,
          fyFormat
        )
      : null;
    const key = buildGroupKey(prefixKey, prefix, fySegment);
    const g = groups.get(key) || { prefixKey, prefix, fySegment, items: [] };
    g.items.push({ id, row });
    groups.set(key, g);
  }

  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const g of groups.values()) {
    g.items.sort((a, b) => {
      const da = voucherRowDate(a.row).getTime();
      const db = voucherRowDate(b.row).getTime();
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });
    let serial = 0;
    for (const { id, row } of g.items) {
      serial += 1;
      const type = String(row.type || "");
      if (type === "contra") {
        const nums = formatContraVoucherNumbersFromSerial(
          companyDoc.voucherPrefixes as Record<string, string[] | undefined> | undefined,
          g.prefix,
          serial,
          g.fySegment
        );
        const patch: Record<string, unknown> = {};
        if (row.voucherNumber !== nums.voucherNumber) patch.voucherNumber = nums.voucherNumber;
        if ((row as { voucherNumberOut?: string }).voucherNumberOut !== nums.voucherNumberOut) {
          patch.voucherNumberOut = nums.voucherNumberOut;
        }
        if ((row as { voucherNumberIn?: string }).voucherNumberIn !== nums.voucherNumberIn) {
          patch.voucherNumberIn = nums.voucherNumberIn;
        }
        if (Object.keys(patch).length > 0) updates.push({ id, patch });
        continue;
      }
      if (type === "production") {
        const next = formatVoucherNumberWithFy(g.prefix, g.fySegment, serial);
        const cur = String((row as { productionNumber?: string }).productionNumber || "");
        if (cur !== next) updates.push({ id, patch: { productionNumber: next } });
        continue;
      }
      const next = formatVoucherNumberWithFy(g.prefix, g.fySegment, serial);
      if (String(row.voucherNumber || "") !== next) {
        updates.push({ id, patch: { voucherNumber: next } });
      }
    }
  }

  const total = updates.length;
  let done = 0;
  let updated = 0;
  for (const { id, patch } of updates) {
    await patchVoucherFields(companyId, id, patch, { forceSqliteFirst: true });
    updated += 1;
    done += 1;
    onProgress?.({ done, total });
  }

  const skipped = active.length - updated;
  return { updated, skipped };
}

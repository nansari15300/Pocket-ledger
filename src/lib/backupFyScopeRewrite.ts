/**
 * FY-scoped PL backup ("From FY ... To").
 *
 * Pure, in-memory rewrite of a backup payload (the live company is never touched):
 * - vouchers before the cut (start of the first kept FY) and after the last kept FY are omitted;
 * - every master account's closing before the cut becomes its book opening (`openingBalance`,
 *   `openingBalanceDate` = cut), as if entered in the account form. Originals are kept in
 *   `_plOriginalOpeningBalance` / `_plOriginalOpeningBalanceDate`;
 * - items: opening qty + value = closing stock at the cut (Stock Summary maths:
 *   qty = opening + purchase - sale in smallest unit, value = qty x purchasePrice);
 * - System "Opening Balance" (equity) ledger = -sum(master openings), so profit / loss of the
 *   omitted years lands in the capital / reserve opening (same formula as balanceOpeningBalanceWithCapital);
 * - bill-wise / spend-wise links of kept vouchers that point to an omitted voucher are dropped.
 *
 * Closing maths = `computeEntityClosingBalancesBeforeMs` (openingSnapshotHydrate) carry rules, run on
 * the backup's full in-memory rows (SQLite + Firestore merge) with a one-pass id index for speed.
 */
import { startOfDay } from "date-fns";
import type { Context } from "@/components/vouchers/TransactionsTable";
import { getTransactionAmounts } from "@/hooks/use-transactions";
import { buildPartyLedgerAggregateMap } from "@/lib/partyListLedgerBalance";
import {
  effectiveOpeningBalanceDateBeforeMs,
  isLedgerTransactionOnOrAfterOpeningDate,
} from "@/lib/fyPagination/ledgerOpeningDateFilter";
import {
  fiscalYearRangeForKey,
  priorFyKeyFromRunning,
  runningFyKey,
} from "@/lib/fyPagination/periodBounds";
import { OPENING_BALANCE_SYSTEM_LEDGER_ID } from "@/lib/reports/openingBalanceLedgerAccounts";
import {
  computeExpectedSystemOpeningBalance,
  systemOpeningBalanceLedgerFields,
} from "@/lib/reports/systemOpeningBalanceEquity";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

/** Manual backup: From FY + optional To FY (null = latest). Auto backup: From FY only (open-ended). */
export type BackupFyScope = "all" | { fromFyKey: string; toFyKey?: string | null };
export type AutoBackupFyScope = "all" | { fromFyKey: string; toFyKey?: string | null };

export type BackupFyScopeMarker = {
  mode: "selected";
  fromFyKey: string;
  /** null = open-ended (latest vouchers included). */
  toFyKey: string | null;
  cutMs: number;
  cutIso: string;
  toMs: number | null;
  country: string | null;
  openingsCarriedForward: true;
  mastersRewritten: number;
  itemsRewritten: number;
  vouchersKept: number;
  vouchersOmittedBefore: number;
  vouchersOmittedAfter: number;
  linksDropped: number;
  systemOpeningBalance: number | null;
  generatedAtMs: number;
};

export type ApplyBackupFyScopeResult =
  | { ok: true; applied: false }
  | { ok: true; applied: true; marker: BackupFyScopeMarker; fileNameSuffix: string }
  | { ok: false; error: string };

type Row = Record<string, unknown> & { id?: string };

const FY_KEY_RE = /^\d{4}-\d{4}$/;

export function isBackupFyKey(raw: unknown): raw is string {
  return typeof raw === "string" && FY_KEY_RE.test(raw.trim());
}

export function fyKeyStartYear(fyKey: string): number {
  return Number(String(fyKey).split("-")[0]) || 0;
}

export function normalizeBackupFyScope(raw: unknown): BackupFyScope {
  if (!raw || raw === "all" || typeof raw !== "object") return "all";
  const o = raw as { fromFyKey?: unknown; toFyKey?: unknown };
  const from = isBackupFyKey(o.fromFyKey) ? o.fromFyKey.trim() : "";
  if (!from) return "all";
  const to = isBackupFyKey(o.toFyKey) ? o.toFyKey.trim() : null;
  if (to && fyKeyStartYear(to) < fyKeyStartYear(from)) return { fromFyKey: from };
  return to ? { fromFyKey: from, toFyKey: to } : { fromFyKey: from };
}

export function normalizeAutoBackupFyScope(raw: unknown): AutoBackupFyScope {
  return normalizeBackupFyScope(raw);
}

/** @deprecated Prefer voucher FY scan (loadFiscalSplitFyRows). Calendar pad only — not for backup UI. */
export function listSelectableBackupFyKeys(country?: string | null, count = 15, today = new Date()): string[] {
  const out: string[] = [];
  let cursor: string | null = runningFyKey(country ?? undefined, today);
  for (let i = 0; i < count && cursor; i++) {
    out.push(cursor);
    cursor = priorFyKeyFromRunning(cursor);
  }
  return out;
}

export function formatBackupFyScopeLabel(scope: BackupFyScope | null | undefined): string {
  const s = normalizeBackupFyScope(scope);
  if (s === "all") return "All FY";
  return `FY ${s.fromFyKey} to ${s.toFyKey || "latest"}`;
}

export function backupFyScopeFileNameSuffix(scope: BackupFyScope | null | undefined): string | null {
  const s = normalizeBackupFyScope(scope);
  if (s === "all") return null;
  return `FY${s.fromFyKey}_to_${s.toFyKey || "latest"}`;
}

/** Marker from a decoded backup payload (top-level or companyDetails[0]). */
export function readBackupFyScopeMarker(backupData: unknown): BackupFyScopeMarker | null {
  if (!backupData || typeof backupData !== "object") return null;
  const bd = backupData as Record<string, unknown>;
  const details = Array.isArray(bd.companyDetails) ? (bd.companyDetails[0] as Row | undefined) : undefined;
  const raw = (bd.backupFyScope ?? details?.backupFyScope) as Partial<BackupFyScopeMarker> | undefined;
  if (!raw || typeof raw !== "object" || raw.mode !== "selected" || !isBackupFyKey(raw.fromFyKey)) return null;
  return raw as BackupFyScopeMarker;
}

export function isFyScopedBackupData(backupData: unknown): boolean {
  return readBackupFyScopeMarker(backupData) != null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function asRows(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

function dayMsOf(raw: unknown): number | null {
  const d = parseFirestoreDateFieldToJsDate(raw);
  return d ? startOfDay(d).getTime() : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const MASTER_COLLECTIONS: Array<{ collection: string; context: Context }> = [
  { collection: "parties", context: "party" as Context },
  { collection: "bank_accounts", context: "account" as Context },
  { collection: "staff", context: "staff" as Context },
  { collection: "taxes", context: "tax" as Context },
  { collection: "expense_accounts", context: "expense" as Context },
];

/** Keys never scanned for links / ids (amount-bearing lines + audit trail). */
const LINK_SCRUB_SKIP_KEYS = new Set([
  "id",
  "history",
  "lineItems",
  "items",
  "entries",
  "fileUrls",
  "attachments",
]);

const LINK_ELEMENT_ID_FIELDS = [
  "voucherId",
  "linkedVoucherId",
  "paymentInId",
  "paymentOutId",
  "sourceVoucherId",
  "targetVoucherId",
  "billId",
  "invoiceId",
];

/** Drop link entries of a kept voucher that point to an omitted voucher. */
function scrubOmittedVoucherLinks(v: Row, omitted: Set<string>): { row: Row; dropped: number } {
  let out: Row | null = null;
  let dropped = 0;
  for (const [key, val] of Object.entries(v)) {
    if (LINK_SCRUB_SKIP_KEYS.has(key)) continue;
    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      const filtered = val.filter((el) => {
        if (typeof el === "string") return !omitted.has(el);
        if (isPlainObject(el)) {
          for (const f of LINK_ELEMENT_ID_FIELDS) {
            const s = el[f];
            if (typeof s === "string" && omitted.has(s)) return false;
          }
        }
        return true;
      });
      if (filtered.length !== val.length) {
        if (!out) out = { ...v };
        out[key] = filtered;
        dropped += val.length - filtered.length;
      }
    } else if (isPlainObject(val)) {
      const hits = Object.keys(val).filter((k) => omitted.has(k));
      if (hits.length) {
        const copy: Record<string, unknown> = { ...val };
        for (const h of hits) delete copy[h];
        if (!out) out = { ...v };
        out[key] = copy;
        dropped += hits.length;
      }
    }
  }
  return { row: out ?? v, dropped };
}

/** One pass: master id -> indices of pre-cut vouchers that mention it anywhere (except history). */
function buildMasterIdVoucherIndex(vouchers: Row[], masterIds: Set<string>): Map<string, number[]> {
  const index = new Map<string, number[]>();
  const visit = (val: unknown, idx: number, depth: number) => {
    if (typeof val === "string") {
      if (masterIds.has(val)) {
        const list = index.get(val);
        if (!list) index.set(val, [idx]);
        else if (list[list.length - 1] !== idx) list.push(idx);
      }
      return;
    }
    if (depth > 6 || !val || typeof val !== "object") return;
    if (Array.isArray(val)) {
      for (const el of val) visit(el, idx, depth + 1);
      return;
    }
    if (!isPlainObject(val)) return;
    for (const [k, child] of Object.entries(val)) {
      if (depth === 0 && k === "history") continue;
      visit(child, idx, depth + 1);
    }
  };
  vouchers.forEach((v, i) => visit(v, i, 0));
  return index;
}

/** Stock Summary / useVouchers unit factor (opening): 0 when no conversion path. */
function openingUnitFactor(item: Row, unit: string): number {
  const conversions = (Array.isArray(item.unitConversions) ? item.unitConversions : []) as Array<Record<string, unknown>>;
  const smallestUnit =
    conversions.length > 0 ? String(conversions[conversions.length - 1].toUnit ?? "") : String(item.openingBalanceUnit ?? "");
  if (!unit || conversions.length === 0) return 1;
  if (unit === smallestUnit) return 1;
  let factor = 1;
  let currentUnit = unit;
  for (let i = 0; i < 10; i++) {
    const conv = conversions.find((c) => c.fromUnit === currentUnit);
    if (!conv) return 0;
    factor *= Number(conv.conversionFactor) || 1;
    currentUnit = String(conv.toUnit ?? "");
    if (currentUnit === smallestUnit) break;
  }
  return factor;
}

/** useVouchers voucher line factor (partial chain kept when path ends early). */
function lineUnitFactor(item: Row, lineUnit: unknown): number {
  const conversions = (Array.isArray(item.unitConversions) ? item.unitConversions : []) as Array<Record<string, unknown>>;
  const smallestUnit =
    conversions.length > 0 ? String(conversions[conversions.length - 1].toUnit ?? "") : String(item.openingBalanceUnit ?? "");
  let factor = 1;
  if (lineUnit && lineUnit !== smallestUnit) {
    let currentUnit = String(lineUnit);
    for (let k = 0; k < 10; k++) {
      const conv = conversions.find((c) => c.fromUnit === currentUnit);
      if (!conv) break;
      factor *= Number(conv.conversionFactor) || 1;
      currentUnit = String(conv.toUnit ?? "");
      if (currentUnit === smallestUnit) break;
    }
  }
  return factor;
}

function originalDateIso(raw: unknown): string | null {
  const d = parseFirestoreDateFieldToJsDate(raw);
  return d ? d.toISOString() : null;
}

/**
 * Apply an FY range to a backup payload in place (backupData collections are replaced with new arrays).
 * `scope` "all" / empty = no-op.
 */
export function applyBackupFyScopeToBackupData(
  backupData: Record<string, unknown>,
  options: { scope: BackupFyScope | null | undefined; country?: string | null; nowMs?: number }
): ApplyBackupFyScopeResult {
  const scope = normalizeBackupFyScope(options.scope);
  if (scope === "all") return { ok: true, applied: false };
  const country = options.country ? String(options.country) : undefined;

  const fromRange = fiscalYearRangeForKey(country, scope.fromFyKey);
  if (!fromRange || !Number.isFinite(fromRange.fromMs) || fromRange.fromMs <= 0) {
    return { ok: false, error: `Invalid From FY "${scope.fromFyKey}".` };
  }
  const cutMs = startOfDay(new Date(fromRange.fromMs)).getTime();
  let toMs: number | null = null;
  if (scope.toFyKey) {
    const toRange = fiscalYearRangeForKey(country, scope.toFyKey);
    if (!toRange || toRange.toMs < cutMs) {
      return { ok: false, error: `Invalid FY range ${scope.fromFyKey} to ${scope.toFyKey}.` };
    }
    toMs = toRange.toMs;
  }
  const cutDay = new Date(cutMs);
  const cutDateValue = new Date(cutDay.getFullYear(), cutDay.getMonth(), cutDay.getDate(), 12, 0, 0, 0);

  // --- 1. Partition vouchers (single pass) ---
  const allVouchers = asRows(backupData.vouchers);
  const kept: Row[] = [];
  const preCutLive: Row[] = [];
  const omitted = new Set<string>();
  let omittedBefore = 0;
  let omittedAfter = 0;
  for (const v of allVouchers) {
    const dayMs = dayMsOf(v?.date);
    const id = String(v?.id ?? "").trim();
    if (dayMs != null && dayMs < cutMs) {
      omittedBefore++;
      if (id) omitted.add(id);
      if (v.isDeleted !== true) preCutLive.push(v);
      continue;
    }
    if (dayMs != null && toMs != null && dayMs > toMs) {
      omittedAfter++;
      if (id) omitted.add(id);
      continue;
    }
    kept.push(v);
  }

  // --- 2. Master closings before cut ---
  const taxesRows = asRows(backupData.taxes).filter((t) => t.isDeleted !== true);
  const masterIds = new Set<string>();
  for (const { collection } of MASTER_COLLECTIONS) {
    for (const row of asRows(backupData[collection])) {
      const id = String(row?.id ?? "").trim();
      if (!id || row.isDeleted === true || id === OPENING_BALANCE_SYSTEM_LEDGER_ID) continue;
      masterIds.add(id);
    }
  }
  const index = buildMasterIdVoucherIndex(preCutLive, masterIds);
  const preCutDates = preCutLive.map((v) => parseFirestoreDateFieldToJsDate(v.date));

  let mastersRewritten = 0;
  const cutIso = cutDateValue.toISOString();
  const carryNarration = `Opening carried forward (backup from FY ${scope.fromFyKey})`;

  for (const { collection, context } of MASTER_COLLECTIONS) {
    const rows = asRows(backupData[collection]);
    if (!rows.length) continue;
    let changed = false;
    const nextRows = rows.map((row) => {
      const id = String(row?.id ?? "").trim();
      if (!id || row.isDeleted === true || id === OPENING_BALANCE_SYSTEM_LEDGER_ID) return row;
      const ob = Number(row.openingBalance) || 0;
      const asOn = parseFirestoreDateFieldToJsDate(row.openingBalanceDate);
      if (asOn && startOfDay(asOn).getTime() >= cutMs) return row; // own As-on after cut: unchanged
      const effective = effectiveOpeningBalanceDateBeforeMs(asOn, cutMs, true);
      const candidateIdx = index.get(id) ?? [];
      if (!candidateIdx.length) return row;
      const candidates: Row[] = [];
      for (const i of candidateIdx) {
        const d = preCutDates[i];
        if (!d) continue;
        if (!isLedgerTransactionOnOrAfterOpeningDate(d, effective)) continue;
        candidates.push(preCutLive[i]);
      }
      let closing = ob;
      if (context === ("party" as Context)) {
        const agg = buildPartyLedgerAggregateMap(candidates, new Set([id]));
        const a = agg.get(id) || { debit: 0, credit: 0 };
        closing = ob + (Number(a.debit) || 0) - (Number(a.credit) || 0);
      } else {
        for (const t of candidates) {
          const amounts = getTransactionAmounts(t, context, { id }, "amount", undefined, taxesRows as any[]);
          closing += (Number(amounts.debit) || 0) - (Number(amounts.credit) || 0);
        }
      }
      closing = round2(closing);
      if (Math.abs(closing - ob) < 0.005) return row;
      changed = true;
      mastersRewritten++;
      const narration = typeof row.openingBalanceNarration === "string" ? row.openingBalanceNarration.trim() : "";
      return {
        ...row,
        _plOriginalOpeningBalance: ob,
        _plOriginalOpeningBalanceDate: originalDateIso(row.openingBalanceDate),
        openingBalance: closing,
        openingBalanceDate: cutDateValue,
        ...(narration ? {} : { openingBalanceNarration: carryNarration }),
      };
    });
    if (changed) backupData[collection] = nextRows;
  }

  // --- 3. Items: closing stock at cut (Stock Summary maths) ---
  let itemsRewritten = 0;
  const itemRows = asRows(backupData.items);
  if (itemRows.length) {
    const itemById = new Map<string, Row>();
    for (const it of itemRows) {
      const id = String(it?.id ?? "").trim();
      if (id && it.isDeleted !== true) itemById.set(id, it);
    }
    const stock = new Map<string, { stockIn: number; stockOut: number }>();
    for (const v of preCutLive) {
      if (v.type !== "purchase" && v.type !== "sale") continue;
      if (!Array.isArray(v.lineItems)) continue;
      for (const line of v.lineItems as Array<Record<string, unknown>>) {
        const itemId = typeof line?.itemId === "string" ? line.itemId : "";
        const item = itemId ? itemById.get(itemId) : undefined;
        if (!item) continue;
        const qty = (Number(line.quantity) || 0) * lineUnitFactor(item, line.unit);
        const cur = stock.get(itemId) || { stockIn: 0, stockOut: 0 };
        if (v.type === "purchase") cur.stockIn += qty;
        else cur.stockOut += qty;
        stock.set(itemId, cur);
      }
    }
    if (stock.size) {
      backupData.items = itemRows.map((item) => {
        const id = String(item?.id ?? "").trim();
        const s = id ? stock.get(id) : undefined;
        if (!s || item.isDeleted === true) return item;
        if (Math.abs(s.stockIn) < 1e-9 && Math.abs(s.stockOut) < 1e-9) return item;
        const asOn = parseFirestoreDateFieldToJsDate(item.openingBalanceDate);
        if (asOn && startOfDay(asOn).getTime() >= cutMs) return item;
        const conversions = (Array.isArray(item.unitConversions) ? item.unitConversions : []) as Array<Record<string, unknown>>;
        const smallestUnit =
          conversions.length > 0 ? String(conversions[conversions.length - 1].toUnit ?? "") : String(item.openingBalanceUnit ?? "");
        let openingUnit = String(item.openingBalanceUnit || (conversions.length > 0 ? conversions[0].fromUnit : "") || "");
        let factor = openingUnit ? openingUnitFactor(item, openingUnit) : 1;
        const openingSmallest = (Number(item.openingBalance) || 0) * factor;
        const closingSmallest = openingSmallest + s.stockIn - s.stockOut;
        if (!(factor > 0)) {
          openingUnit = smallestUnit;
          factor = 1;
        }
        const purchasePrice = Number(item.purchasePrice) || 0;
        const value = round2(closingSmallest * purchasePrice);
        const newQty = Math.round((closingSmallest / factor) * 1e6) / 1e6;
        const newRate = Math.abs(newQty) > 1e-9 ? round2(value / newQty) : round2(purchasePrice * factor);
        itemsRewritten++;
        const narration = typeof item.openingBalanceNarration === "string" ? item.openingBalanceNarration.trim() : "";
        return {
          ...item,
          _plOriginalOpeningBalance: Number(item.openingBalance) || 0,
          _plOriginalOpeningBalanceDate: originalDateIso(item.openingBalanceDate),
          _plOriginalOpeningBalanceRate: Number(item.openingBalanceRate) || 0,
          _plOriginalOpeningBalanceTaxId: item.openingBalanceTaxId ?? null,
          openingBalance: newQty,
          ...(openingUnit ? { openingBalanceUnit: openingUnit } : {}),
          openingBalanceRate: newRate,
          openingBalanceTaxId: null,
          isOpeningBalanceTaxInclusive: false,
          openingBalanceDate: cutDateValue,
          stockQty: closingSmallest,
          balance: value,
          ...(narration ? {} : { openingBalanceNarration: carryNarration }),
        };
      });
    }
  }

  // --- 4. System Opening Balance (equity) = -sum(master openings) => omitted-years P/L into capital ---
  let systemOpeningBalance: number | null = null;
  if (mastersRewritten > 0) {
    const entities: Array<{ openingBalance?: number }> = [];
    for (const { collection } of MASTER_COLLECTIONS) {
      for (const row of asRows(backupData[collection])) {
        if (row.isDeleted === true) continue;
        if (collection === "parties" && String(row.id) === OPENING_BALANCE_SYSTEM_LEDGER_ID) continue;
        entities.push({ openingBalance: Number(row.openingBalance) || 0 });
      }
    }
    systemOpeningBalance = computeExpectedSystemOpeningBalance(entities);
    const parties = asRows(backupData.parties);
    let found = false;
    backupData.parties = parties.map((row) => {
      if (String(row?.id) !== OPENING_BALANCE_SYSTEM_LEDGER_ID) return row;
      found = true;
      return {
        ...row,
        _plOriginalOpeningBalance: Number(row.openingBalance) || 0,
        ...systemOpeningBalanceLedgerFields(systemOpeningBalance as number),
      };
    });
    if (!found) backupData.parties = parties; // restore reconcile creates the system ledger
  }

  // --- 5. Links of kept vouchers that point to omitted vouchers ---
  let linksDropped = 0;
  const keptOut = omitted.size
    ? kept.map((v) => {
        const r = scrubOmittedVoucherLinks(v, omitted);
        linksDropped += r.dropped;
        return r.row;
      })
    : kept;
  backupData.vouchers = keptOut;

  // --- 6. Marker ---
  const marker: BackupFyScopeMarker = {
    mode: "selected",
    fromFyKey: scope.fromFyKey,
    toFyKey: scope.toFyKey || null,
    cutMs,
    cutIso,
    toMs,
    country: country ?? null,
    openingsCarriedForward: true,
    mastersRewritten,
    itemsRewritten,
    vouchersKept: keptOut.length,
    vouchersOmittedBefore: omittedBefore,
    vouchersOmittedAfter: omittedAfter,
    linksDropped,
    systemOpeningBalance,
    generatedAtMs: options.nowMs ?? Date.now(),
  };
  backupData.backupFyScope = marker;
  if (Array.isArray(backupData.companyDetails) && backupData.companyDetails.length) {
    const [first, ...rest] = backupData.companyDetails as Row[];
    backupData.companyDetails = [{ ...(first || {}), backupFyScope: marker }, ...rest];
  }

  return {
    ok: true,
    applied: true,
    marker,
    fileNameSuffix: backupFyScopeFileNameSuffix(scope) as string,
  };
}
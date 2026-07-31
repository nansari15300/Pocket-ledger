"use client";

import type { RecurringVoucherTemplate } from "@/lib/recurringVouchers";
import {
  computeRecurringAccrualPeriodStartMs,
  effectiveScheduleBsDay,
  getNextRecurringDueAd,
  projectNextRecurringMonetaryTotal,
} from "@/lib/recurringVouchers";
import { adToBs } from "@/lib/bs-date";

/** Journal (saved) lines se Dr/Cr joda — dashboard + popup list ke liye */
export function journalEntryDrCrTotals(v: Record<string, unknown> | null | undefined): { dr: number; cr: number } {
  let dr = 0;
  let cr = 0;
  if (!v || String(v.type || "").trim() !== "journal") return { dr, cr };
  const entries = v.entries;
  if (!Array.isArray(entries)) return { dr, cr };
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const d = Number(e.debit);
    const c = Number(e.credit);
    if (Number.isFinite(d) && d > 0) dr += d;
    if (Number.isFinite(c) && c > 0) cr += c;
    const t = String(e.type || "").toLowerCase();
    const amt = Number(e.amount);
    if (t === "debit" && Number.isFinite(amt) && amt > 0) dr += amt;
    if (t === "credit" && Number.isFinite(amt) && amt > 0) cr += amt;
  }
  return { dr, cr };
}

/** Non-journal recurring body ke liye rough Dr/Cr (AddVoucherDialog jaisa single total split nahi) */
export function voucherTypeDefaultDrCr(type: string): { dr: number; cr: number } {
  const t = String(type || "").trim();
  if (["sale", "payment_in", "direct_income", "note", "production"].includes(t)) return { dr: 0, cr: 1 };
  if (["purchase", "payment_out", "direct_expense", "add_salary", "salary"].includes(t)) return { dr: 1, cr: 0 };
  // Inter Company — entity ledger par role se Dr/Cr; yahan generic placeholder
  if (t === "inter_company") return { dr: 0, cr: 0 };
  return { dr: 0, cr: 0 };
}

/** Journal line se numeric Dr/Cr — face totals + popup columns dono yahi parse */
export function journalLineDrCr(e: Record<string, unknown>): { dr: number; cr: number } {
  const d = Number(e.debit);
  const c = Number(e.credit);
  const t = String(e.type || "").toLowerCase();
  const amt = Number(e.amount);
  let dr = Number.isFinite(d) && d > 0 ? d : 0;
  let cr = Number.isFinite(c) && c > 0 ? c : 0;
  if (t === "debit" && Number.isFinite(amt) && amt > 0) dr = amt;
  if (t === "credit" && Number.isFinite(amt) && amt > 0) cr = amt;
  return { dr, cr };
}

/**
 * Company-centric view: andar aane wala paisa → `inDr` (card par Dr row), bahar jaane wala → `outCr` (Cr row).
 * Saved journal rows aksar sirf `accountId` rakhte hain — isliye masters (party/staff/tax/expense/bank) se match.
 */
export type CompanyFlowDrCrContext = {
  partyIds: Set<string>;
  staffIds: Set<string>;
  taxIds: Set<string>;
  /** Income-type expense master ids */
  incomeAccountIds: Set<string>;
  /** Expense / salary masters (Income type excluded) */
  expenseOrSalaryAccountIds: Set<string>;
  bankCashIds: Set<string>;
  /** Trade payable style system ledgers (e.g. purchase_account) */
  purchaseLedgerIds: Set<string>;
  /** Trade receivable / sales style system ledgers */
  salesLedgerIds: Set<string>;
  /** Item master ids — journal `accountId` item par ho to clearing rule (user: item + bank/income/expense) */
  itemIds: Set<string>;
};

/**
 * UI + hook ke liye: taxes, expense masters, bank/cash accounts se `CompanyFlowDrCrContext` banao.
 * Party/staff ids maps ki keys se aate hain (already voucher bodies me use ho sakti hain).
 */
export function buildCompanyFlowDrCrContext(args: {
  partyIds: Iterable<string>;
  staffIds: Iterable<string>;
  taxIds: Iterable<string>;
  expenseAccounts: ReadonlyArray<{ id?: string; type?: string }>;
  bankCashAccountIds: Iterable<string>;
  /** Optional — items list se journal item lines classify */
  itemIds?: Iterable<string>;
}): CompanyFlowDrCrContext {
  const partyIds = new Set<string>();
  for (const x of args.partyIds) {
    const id = String(x || "").trim();
    if (id) partyIds.add(id);
  }
  const staffIds = new Set<string>();
  for (const x of args.staffIds) {
    const id = String(x || "").trim();
    if (id) staffIds.add(id);
  }
  const taxIds = new Set<string>();
  for (const x of args.taxIds) {
    const id = String(x || "").trim();
    if (id) taxIds.add(id);
  }
  const incomeAccountIds = new Set<string>();
  const expenseOrSalaryAccountIds = new Set<string>();
  for (const e of args.expenseAccounts) {
    const id = String(e?.id || "").trim();
    if (!id) continue;
    const tp = String(e?.type || "");
    if (tp === "Income") incomeAccountIds.add(id);
    else expenseOrSalaryAccountIds.add(id);
  }
  const bankCashIds = new Set<string>();
  for (const x of args.bankCashAccountIds) {
    const id = String(x || "").trim();
    if (id) bankCashIds.add(id);
  }
  const purchaseLedgerIds = new Set(["purchase_account"]);
  const salesLedgerIds = new Set(["sales_account"]);
  const itemIds = new Set<string>();
  for (const x of args.itemIds ?? []) {
    const id = String(x || "").trim();
    if (id) itemIds.add(id);
  }
  return {
    partyIds,
    staffIds,
    taxIds,
    incomeAccountIds,
    expenseOrSalaryAccountIds,
    bankCashIds,
    purchaseLedgerIds,
    salesLedgerIds,
    itemIds,
  };
}

/** Non-journal clone body: voucher type se company in vs out face weights */
export function companyFlowFaceNonJournal(v: Record<string, unknown> | null | undefined): { inDr: number; outCr: number } {
  if (!v) return { inDr: 0, outCr: 0 };
  const vtype = String(v.type || "").trim();
  const amt = Number(v.total ?? v.amount ?? 0);
  if (!Number.isFinite(amt) || amt <= 0) return { inDr: 0, outCr: 0 };
  if (["sale", "payment_in", "direct_income", "note", "production"].includes(vtype)) return { inDr: amt, outCr: 0 };
  if (["purchase", "payment_out", "direct_expense", "add_salary", "salary"].includes(vtype)) return { inDr: 0, outCr: amt };
  return { inDr: 0, outCr: 0 };
}

/**
 * Ek journal line → popup Dr (inflow) vs Cr (outflow).
 * User rule: party/staff/tax/payable = “bahar” — voucher Cr → Cr column, voucher Dr → Dr column.
 * Bank / income / expense / item = “clear” — income/sales dono posting Dr column; expense+item Dr→Cr column Cr, Cr→Dr; bank Dr→Dr, Cr→Cr.
 */
export function companyFlowContributionForJournalLine(
  e: Record<string, unknown>,
  ctx: CompanyFlowDrCrContext,
): { inDr: number; outCr: number } {
  let inDr = 0;
  let outCr = 0;
  const aid = String(e.accountId || "").trim();
  const linePartyId = String(e.partyId || "").trim();
  const lineStaffId = String(e.staffId || "").trim();
  const { dr, cr } = journalLineDrCr(e);
  if (dr <= 0 && cr <= 0) return { inDr, outCr };
  if (!aid && !linePartyId && !lineStaffId) return { inDr, outCr };

  const isStaff = (lineStaffId && ctx.staffIds.has(lineStaffId)) || (aid && ctx.staffIds.has(aid));
  const isParty =
    !isStaff && ((linePartyId && ctx.partyIds.has(linePartyId)) || (aid && ctx.partyIds.has(aid)));
  const isTax = !!(aid && ctx.taxIds.has(aid));
  const isPurchaseLedger = !!(aid && ctx.purchaseLedgerIds.has(aid));
  const isExternal = isStaff || isParty || isTax || isPurchaseLedger;

  const isBank = !!(aid && ctx.bankCashIds.has(aid));
  const isIncome = !!(aid && (ctx.incomeAccountIds.has(aid) || ctx.salesLedgerIds.has(aid)));
  const isExpense = !!(aid && ctx.expenseOrSalaryAccountIds.has(aid));
  const isItem = !!(aid && ctx.itemIds.has(aid));

  if (isExternal) {
    if (cr > 0) outCr += cr;
    if (dr > 0) inDr += dr;
    return { inDr, outCr };
  }
  if (isIncome) {
    if (dr > 0) inDr += dr;
    if (cr > 0) inDr += cr;
    return { inDr, outCr };
  }
  if (isExpense || isItem) {
    if (dr > 0) outCr += dr;
    if (cr > 0) inDr += cr;
    return { inDr, outCr };
  }
  if (isBank) {
    if (dr > 0) inDr += dr;
    if (cr > 0) outCr += cr;
    return { inDr, outCr };
  }
  inDr += dr;
  outCr += cr;
  return { inDr, outCr };
}

/**
 * Recurring popup: **ek voucher = ek row** — line ko sirf Dr **ya** Cr list me bhejna.
 * Rule (user): **Cr field** par company ledger (bank, income, expense, item, sales) → **Dr** column;
 * Cr par party / staff / tax / purchase payable → **Cr** column.
 * Sirf **Dr** wali line: company debit → **Cr** column (outflow); external debit → **Dr** column (inflow).
 */
export function recurringJournalLineDetailSide(
  e: Record<string, unknown>,
  ctx: CompanyFlowDrCrContext,
): "dr" | "cr" | null {
  const aid = String(e.accountId || "").trim();
  const linePartyId = String(e.partyId || "").trim();
  const lineStaffId = String(e.staffId || "").trim();
  const { dr, cr } = journalLineDrCr(e);
  if (dr <= 0 && cr <= 0) return null;
  if (!aid && !linePartyId && !lineStaffId) return null;

  const isStaff = (lineStaffId && ctx.staffIds.has(lineStaffId)) || (aid && ctx.staffIds.has(aid));
  const isParty =
    !isStaff && ((linePartyId && ctx.partyIds.has(linePartyId)) || (aid && ctx.partyIds.has(aid)));
  const isTax = !!(aid && ctx.taxIds.has(aid));
  const isPurchaseLedger = !!(aid && ctx.purchaseLedgerIds.has(aid));
  const isExternal = isStaff || isParty || isTax || isPurchaseLedger;

  const isBank = !!(aid && ctx.bankCashIds.has(aid));
  const isIncome = !!(aid && (ctx.incomeAccountIds.has(aid) || ctx.salesLedgerIds.has(aid)));
  const isExpense = !!(aid && ctx.expenseOrSalaryAccountIds.has(aid));
  const isItem = !!(aid && ctx.itemIds.has(aid));
  const isCompany = isBank || isIncome || isExpense || isItem;

  if (cr > 0) {
    if (isCompany) return "dr";
    if (isExternal) return "cr";
    if (linePartyId || lineStaffId) return "cr";
    return "dr";
  }
  if (dr > 0) {
    if (isCompany) return "cr";
    if (isExternal) return "dr";
    return "dr";
  }
  return null;
}

/** Journal entries par accountId classify karke company in (Dr display) vs out (Cr display) weights */
export function companyFlowFaceFromJournal(
  v: Record<string, unknown> | null | undefined,
  ctx: CompanyFlowDrCrContext,
): { inDr: number; outCr: number } {
  let inDr = 0;
  let outCr = 0;
  if (!v || String(v.type || "").trim() !== "journal" || !Array.isArray(v.entries)) return { inDr, outCr };

  for (const raw of v.entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const add = companyFlowContributionForJournalLine(e, ctx);
    inDr += add.inDr;
    outCr += add.outCr;
  }
  return { inDr, outCr };
}

/** Journal ya non-journal — ek hi shape: accrued split ratio ke liye face weights */
export function companyFlowFaceFromBody(v: Record<string, unknown> | null | undefined, ctx: CompanyFlowDrCrContext): { inDr: number; outCr: number } {
  if (!v) return { inDr: 0, outCr: 0 };
  if (String(v.type || "").trim() === "journal") return companyFlowFaceFromJournal(v, ctx);
  return companyFlowFaceNonJournal(v);
}

/**
 * Accrual bucket: party credit line → "cr", party debit → "dr"; nahi to voucher type default.
 * Card par Cr / Dr row split isi se (AddVoucher linear accrual jaisa).
 */
export function recurringAccrualBucketForBody(v: Record<string, unknown> | null | undefined): "dr" | "cr" {
  if (!v) return "cr";
  if (String(v.type || "").trim() === "journal" && Array.isArray(v.entries)) {
    for (const raw of v.entries) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const pid = String(e.partyId || "").trim();
      const sid = String(e.staffId || "").trim();
      if (!pid && !sid) continue;
      const c = Number(e.credit);
      const d = Number(e.debit);
      const t = String(e.type || "").toLowerCase();
      const amt = Number(e.amount);
      if (Number.isFinite(c) && c > 0) return "cr";
      if (Number.isFinite(d) && d > 0) return "dr";
      if (t === "credit" && Number.isFinite(amt) && amt > 0) return "cr";
      if (t === "debit" && Number.isFinite(amt) && amt > 0) return "dr";
    }
  }
  const { dr, cr } = voucherTypeDefaultDrCr(String(v.type));
  return dr >= cr ? "dr" : "cr";
}

/** Ek enabled template + clone body — linear accrued (AddVoucherDialog jaisa); null = skip row */
export function computeTemplateAccruedAmount(
  template: RecurringVoucherTemplate,
  bodyVoucher: Record<string, unknown>,
  lastGeneratedAtMs: number | null | undefined,
  nowMs: number = Date.now(),
  /** `resolveRecurringTemplateProgress` — recycle-bin last auto par raw template key mat use karo */
  effectiveLastGeneratedPeriodKey?: string | null,
): number | null {
  const scheduleDay = effectiveScheduleBsDay(template);
  let lastPkForDue =
    effectiveLastGeneratedPeriodKey !== undefined
      ? effectiveLastGeneratedPeriodKey
      : template.lastGeneratedPeriodKey;
  // Stale/null lastGenerated → body voucher BS month se heal (warna -old due + full accrued).
  try {
    const rawDate = bodyVoucher?.date;
    const d =
      rawDate instanceof Date
        ? rawDate
        : typeof rawDate === "string" || typeof rawDate === "number"
          ? new Date(rawDate)
          : rawDate && typeof rawDate === "object" && typeof (rawDate as { toDate?: () => Date }).toDate === "function"
            ? (rawDate as { toDate: () => Date }).toDate()
            : null;
    if (d && !Number.isNaN(d.getTime())) {
      const bs = adToBs(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0));
      const bodyPk = `${bs.y}-${String(bs.m).padStart(2, "0")}`;
      const lastS = lastPkForDue != null && String(lastPkForDue).trim() ? String(lastPkForDue).trim() : null;
      if (!lastS || bodyPk > lastS) lastPkForDue = bodyPk;
    }
  } catch {
    /* keep lastPkForDue */
  }
  const nextDue = getNextRecurringDueAd(
    scheduleDay,
    new Date(nowMs),
    lastPkForDue,
    template.suppressedPeriodKeys,
  );
  if (!nextDue) return null;
  const noonLocal = new Date(
    nextDue.getFullYear(),
    nextDue.getMonth(),
    nextDue.getDate(),
    12,
    0,
    0,
    0,
  );
  const bs = adToBs(noonLocal);
  const projected = projectNextRecurringMonetaryTotal(template, bodyVoucher, { y: bs.y, m: bs.m });
  if (!Number.isFinite(projected) || projected <= 0) return null;
  const periodStart = computeRecurringAccrualPeriodStartMs(
    template,
    nextDue,
    lastGeneratedAtMs,
    lastPkForDue,
  );
  const endMs = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate(), 23, 59, 59, 999).getTime();
  const totalSpan = endMs - periodStart;
  if (totalSpan <= 0) return null;
  const frac = Math.min(1, Math.max(0, (nowMs - periodStart) / totalSpan));
  return Math.round(projected * frac * 100) / 100;
}

export type RecurringDashboardLine = {
  templateDocId: string;
  /** Template ka source / clone body — edit voucher isi id se khulta hai */
  bodyVoucherId: string;
  voucherNumber: string;
  narration: string;
  voucherType: string;
  accountLabel: string;
  debit: number;
  credit: number;
};

export type RecurringDashboardTemplateRow = {
  templateDocId: string;
  bodyVoucherId: string;
  voucherNumber: string;
  narration: string;
  voucherType: string;
  drTotal: number;
  crTotal: number;
  accrued: number | null;
  bucket: "dr" | "cr";
};

/**
 * Payment allocation utilities for "Link Payment to Txns" feature.
 * Pure helpers: allocated amount per voucher, outstanding, validate, auto-link, payment status.
 */
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

/** Special voucherId used when allocating payment to party/staff opening balance. */
export const OPENING_BALANCE_VOUCHER_ID = "opening_balance";

export type Allocation = {
  voucherId: string;
  amount: number;
  /** Amount allocated to tax portion of the target voucher (tax and net are separate accounts) */
  taxAmount?: number;
  /** Amount allocated to net portion of the target voucher */
  netAmount?: number;
  /** Journal bill-wise: party/staff account id for which this allocation applies */
  linkedAccountId?: string;
};

/** For backward compatibility: total allocated = amount. If taxAmount/netAmount set, amount should equal taxAmount + netAmount. */
export function getAllocationTotal(a: Allocation | { voucherId?: string; amount?: number; taxAmount?: number; netAmount?: number; linkedAccountId?: string }): number {
  const tax = Number((a as any).taxAmount) || 0;
  const net = Number((a as any).netAmount) || 0;
  if (tax > 0 || net > 0) return tax + net;
  return Number(a.amount) || 0;
}

export function getTaxFromAllocation(a: Allocation): number {
  return Number((a as any).taxAmount) || 0;
}

export function getNetFromAllocation(a: Allocation): number {
  const tax = getTaxFromAllocation(a);
  const net = Number((a as any).netAmount) || 0;
  if (tax > 0 || net > 0) return net;
  return Number(a.amount) || 0;
}

export type PaymentStatus = "paid" | "partially_paid" | "unpaid";

export type PaymentStatusResult = {
  status: PaymentStatus;
  isOverdue: boolean;
  outstanding: number;
  allocated: number;
};

const safeToDate = (d: unknown): Date | null => {
  // Overdue logic receives dueDate from Firestore, backup JSON, and SQLite mirror; use one parser for all shapes.
  return parseFirestoreDateFieldToJsDate(d);
};

/**
 * Build map: voucherId -> total amount allocated to that voucher (from all payment_in vouchers).
 */
export function getAllocatedByVoucherId(vouchers: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of vouchers) {
    if (v.type !== "payment_in" && v.type !== "direct_income") continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      if (!a.voucherId) continue;
      map.set(a.voucherId, (map.get(a.voucherId) ?? 0) + getAllocationTotal(a));
    }
  }
  return map;
}

/**
 * Build map: voucherId -> total amount allocated to that voucher (from all payment_out vouchers).
 */
export function getAllocatedByVoucherIdFromPaymentOuts(vouchers: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of vouchers) {
    if (v.type !== "payment_out" && v.type !== "direct_expense") continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      if (!a.voucherId) continue;
      map.set(a.voucherId, (map.get(a.voucherId) ?? 0) + getAllocationTotal(a));
    }
  }
  return map;
}

/** Allocations TO Sale from Purchase (purchase return). For bill-wise status: Sale receives from Purchase; used so Status shows Paid/Partial. */
export function getAllocatedByVoucherIdFromPurchase(vouchers: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of vouchers) {
    if (v.type !== "purchase" && v.type !== "purchase_service") continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      if (!a.voucherId) continue;
      map.set(a.voucherId, (map.get(a.voucherId) ?? 0) + getAllocationTotal(a));
    }
  }
  return map;
}

/** Allocations TO Purchase from Sale (sale return). For bill-wise status: Purchase receives from Sale; used so Status shows Paid/Partial. */
export function getAllocatedByVoucherIdFromSale(vouchers: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of vouchers) {
    if (v.type !== "sale" && v.type !== "sale_service") continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      if (!a.voucherId) continue;
      map.set(a.voucherId, (map.get(a.voucherId) ?? 0) + getAllocationTotal(a));
    }
  }
  return map;
}

/** Allocations TO Sale/Purchase from Journal vouchers. Journal bill-wise link reduces target's outstanding; balance update ke liye. */
export function getAllocatedByVoucherIdFromJournal(vouchers: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of vouchers) {
    if (v.type !== "journal") continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      if (!a.voucherId) continue;
      map.set(a.voucherId, (map.get(a.voucherId) ?? 0) + getAllocationTotal(a));
    }
  }
  return map;
}

/** Amount this Sale/Purchase has allocated OUT to opposite type (reduces own outstanding). E.g. Purchase linked to Sale from Sale form → Purchase allocated to Sale → Purchase status should update. */
export function getOutgoingAllocatedToOpposite(voucher: any): number {
  const allocations = (voucher.allocations as Allocation[] | undefined) || [];
  return allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
}

function isBillWiseLinkSourceVoucherType(type: string): boolean {
  return (
    type === "sale" ||
    type === "sale_service" ||
    type === "purchase" ||
    type === "purchase_service" ||
    type === "journal"
  );
}

/** Incoming allocations from sale/purchase/journal vouchers → target voucherId (Link dialog `allocatedByBillWiseVouchers`). */
export function getAllocatedByBillWiseSourceVouchers(vouchers: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of vouchers) {
    if (!isBillWiseLinkSourceVoucherType(String(v?.type ?? ""))) continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      const key = String(a.voucherId ?? "");
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + getAllocationTotal(a));
    }
  }
  return map;
}

/**
 * Bill-wise: kitna amount target (sale/purchase) par allocate ho chuka hai.
 * Payment Out/In + target.allocations dono record ho sakte hain — sum se double-count na ho (Link dialog = max).
 */
export function getBillWiseAllocatedToTarget(
  targetVoucher: any,
  targetVoucherId: string,
  vouchers: any[]
): number {
  const vid = String(targetVoucherId);
  const allocatedByPaymentIn = getAllocatedByVoucherId(vouchers);
  const allocatedByPaymentOut = getAllocatedByVoucherIdFromPaymentOuts(vouchers);
  const allocatedByBillWiseSources = getAllocatedByBillWiseSourceVouchers(vouchers);

  const sourceInbound =
    (allocatedByPaymentIn.get(vid) ?? 0) +
    (allocatedByPaymentOut.get(vid) ?? 0) +
    (allocatedByBillWiseSources.get(vid) ?? 0);

  const fromTarget = ((targetVoucher?.allocations as Allocation[] | undefined) || []).reduce(
    (sum, a) => sum + getAllocationTotal(a),
    0
  );

  const obInAllocations = ((targetVoucher?.allocations as Allocation[] | undefined) || [])
    .filter((a) => String(a?.voucherId ?? "") === OPENING_BALANCE_VOUCHER_ID)
    .reduce((s, a) => s + getAllocationTotal(a), 0);
  const targetObAlloc = Math.max(
    0,
    (Number(targetVoucher?.openingBalanceAllocated) || 0) - obInAllocations
  );

  return Math.max(fromTarget, sourceInbound) + targetObAlloc;
}

export function isSaleOrPurchaseBillVoucherType(type: string | undefined): boolean {
  const t = String(type ?? "");
  return t === "sale" || t === "sale_service" || t === "purchase" || t === "purchase_service";
}

export type TaxNetAllocated = { tax: number; net: number };

/**
 * Build map: voucherId -> { tax, net } allocated from payment_out vouchers.
 * Legacy allocations (only amount) are treated as net.
 */
export function getTaxNetAllocatedByVoucherIdFromPaymentOuts(vouchers: any[]): Map<string, TaxNetAllocated> {
  const map = new Map<string, TaxNetAllocated>();
  for (const v of vouchers) {
    if (v.type !== "payment_out" && v.type !== "direct_expense") continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      if (!a.voucherId) continue;
      const cur = map.get(a.voucherId) ?? { tax: 0, net: 0 };
      cur.tax += getTaxFromAllocation(a);
      cur.net += getNetFromAllocation(a);
      map.set(a.voucherId, cur);
    }
  }
  return map;
}

/**
 * For a payment_in voucher: total allocated = sum(allocations). Remaining = amount - total allocated.
 */
export function getPaymentInRemaining(v: any): number {
  const amount = Number(v.amount ?? v.total ?? 0);
  const allocations = (v.allocations as Allocation[] | undefined) || [];
  const allocated = allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
  return Math.max(0, amount - allocated);
}

/**
 * For a payment_out voucher: total allocated = sum(allocations). Remaining = amount - total allocated.
 */
export function getPaymentOutRemaining(v: any): number {
  const amount = Number(v.amount ?? v.total ?? 0);
  const allocations = (v.allocations as Allocation[] | undefined) || [];
  const allocated = allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
  return Math.max(0, amount - allocated);
}

/**
 * For any voucher with amount and allocations: remaining = amount - total allocated.
 * Used for purchase, sale, etc. when they act as bill-wise link sources.
 * Sale/Purchase use total; prefer total for correct remaining.
 */
export function getVoucherRemaining(v: any): number {
  const amount = Number(v.total ?? v.amount ?? 0);
  const allocations = (v.allocations as Allocation[] | undefined) || [];
  const allocated = allocations.reduce((s, a) => s + getAllocationTotal(a), 0);
  return Math.max(0, amount - allocated);
}

/**
 * Outstanding = total - allocated.
 */
export function getOutstanding(total: number, allocated: number): number {
  return Math.max(0, Number(total) - Number(allocated));
}

/**
 * Payment status from total and allocated.
 * Optional dueDate: if provided and today > dueDate and outstanding > 0, isOverdue = true.
 */
export function getPaymentStatus(
  total: number,
  allocated: number,
  dueDate?: unknown
): PaymentStatusResult {
  const t = Number(total) || 0;
  const a = Number(allocated) || 0;
  const outstanding = getOutstanding(t, a);

  let status: PaymentStatus = "unpaid";
  if (outstanding <= 0) status = "paid";
  else if (a > 0) status = "partially_paid";

  let isOverdue = false;
  if (outstanding > 0 && dueDate != null) {
    const due = safeToDate(dueDate);
    if (due) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueOnly = new Date(due);
      dueOnly.setHours(0, 0, 0, 0);
      if (today > dueOnly) isOverdue = true;
    }
  }

  return { status, isOverdue, outstanding, allocated: a };
}

/**
 * Validate: sum(allocations) <= receivedAmount and each amount <= that voucher's outstanding.
 */
export function validateAllocations(
  allocations: Allocation[],
  receivedAmount: number,
  outstandingByVoucherId: Map<string, number>
): { valid: boolean; error?: string } {
  const received = Number(receivedAmount) || 0;
  let sum = 0;
  for (const a of allocations) {
    const amt = getAllocationTotal(a);
    if (amt < 0) return { valid: false, error: "Invalid allocation amount." };
    sum += amt;
    const outstanding = outstandingByVoucherId.get(a.voucherId) ?? 0;
    if (a.amount > outstanding)
      return { valid: false, error: `Allocation exceeds outstanding for voucher.` };
  }
  if (sum > received) return { valid: false, error: "Total linked amount exceeds received amount." };
  return { valid: true };
}

/**
 * Auto-link: distribute receivedAmount across sales (oldest first) by outstanding.
 * Returns array of { voucherId, amount } for vouchers that get a non-zero allocation.
 */
export function autoLink(
  receivedAmount: number,
  salesWithOutstanding: Array<{ id: string; total: number; allocated: number }>
): Allocation[] {
  const received = Number(receivedAmount) || 0;
  if (received <= 0) return [];

  const result: Allocation[] = [];
  let remaining = received;

  for (const s of salesWithOutstanding) {
    if (remaining <= 0) break;
    const outstanding = getOutstanding(s.total, s.allocated);
    if (outstanding <= 0) continue;
    const allocate = Math.min(remaining, outstanding);
    if (allocate > 0) {
      result.push({ voucherId: s.id, amount: allocate });
      remaining -= allocate;
    }
  }

  return result;
}

export type LinkedAmountRow = { date: Date | null; voucherNumber: string; amount: number; paymentVoucherId?: string };

export type LinkedAmountKind = "all" | "tax" | "net";

/**
 * For a sale or purchase voucher, return payment allocations TO this voucher.
 * kind: 'tax' = only tax-linked amounts, 'net' = only net-linked amounts, 'all' = total per payment.
 */
export function getLinkedAmountsToVoucher(
  vouchers: any[],
  targetVoucherId: string | null | undefined,
  type: "sale" | "purchase",
  kind: LinkedAmountKind = "all"
): LinkedAmountRow[] {
  if (!targetVoucherId || !vouchers?.length) return [];

  const paymentTypes =
    type === "sale"
      ? ["payment_in", "direct_income", "purchase", "purchase_service", "journal"]
      : ["payment_out", "direct_expense", "sale", "sale_service", "journal"];

  const rows: LinkedAmountRow[] = [];

  const targetVoucher = vouchers.find((v) => v.id === targetVoucherId);
  const obAllocated = Number(targetVoucher?.openingBalanceAllocated) || 0;
  if (obAllocated > 0) {
    rows.push({
      date: null,
      voucherNumber: "Opening Balance",
      amount: obAllocated,
      paymentVoucherId: OPENING_BALANCE_VOUCHER_ID,
    });
  }

  for (const v of vouchers) {
    if (!paymentTypes.includes(v.type)) continue;
    const allocations = (v.allocations as Allocation[] | undefined) || [];
    for (const a of allocations) {
      if (a.voucherId !== targetVoucherId) continue;
      const taxAmt = getTaxFromAllocation(a);
      const netAmt = getNetFromAllocation(a);
      const amt = kind === "tax" ? taxAmt : kind === "net" ? netAmt : getAllocationTotal(a);
      if (amt <= 0) continue;
      const date = safeToDate(v.date);
      rows.push({
        date,
        voucherNumber: v.voucherNumber ?? v.voucher_number ?? "",
        amount: amt,
        paymentVoucherId: v.id,
      });
    }
  }

  rows.sort((a, b) => {
    const tA = a.date ? a.date.getTime() : 0;
    const tB = b.date ? b.date.getTime() : 0;
    return tA - tB;
  });

  return rows;
}

/**
 * For a sale or purchase voucher, return rows when THIS voucher has allocated TO others (outgoing links).
 * E.g. Purchase linked to Sale from Sale form → allocation on Purchase; Purchase form should show "linked to Sale".
 */
export function getOutgoingLinkedAmountRows(
  vouchers: any[],
  targetVoucherId: string | null | undefined,
  type: "sale" | "purchase",
  kind: LinkedAmountKind = "all"
): LinkedAmountRow[] {
  if (!targetVoucherId || !vouchers?.length) return [];
  const targetVoucher = vouchers.find((v) => v.id === targetVoucherId);
  if (!targetVoucher) return [];
  const allocations = (targetVoucher.allocations as Allocation[] | undefined) || [];
  const oppositeTypes = type === "sale" ? ["purchase", "purchase_service"] : ["sale", "sale_service"];
  const rows: LinkedAmountRow[] = [];
  for (const a of allocations) {
    if (!a.voucherId) continue;
    const toVoucher = vouchers.find((v) => v.id === a.voucherId);
    if (!toVoucher || !oppositeTypes.includes(toVoucher.type)) continue;
    const amt = kind === "tax" ? getTaxFromAllocation(a) : kind === "net" ? getNetFromAllocation(a) : getAllocationTotal(a);
    if (amt <= 0) continue;
    const date = safeToDate(toVoucher.date);
    rows.push({
      date,
      voucherNumber: (toVoucher.voucherNumber ?? toVoucher.voucher_number ?? "") as string,
      amount: amt,
      paymentVoucherId: toVoucher.id,
    });
  }
  rows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  return rows;
}

/**
 * Build linked-amount rows from pending allocations (e.g. after user clicks DONE in link dialog).
 * Used so the voucher form shows updated link list before Save; same shape as getLinkedAmountsToVoucher.
 * Journal bhi include – LinkAdvancesToVoucherDialog se journal select karne par PUR/Sale form pe dikhe.
 */
export function getLinkedAmountRowsFromPending(
  pending: Record<string, number>,
  vouchers: any[],
  type: "sale" | "purchase"
): LinkedAmountRow[] {
  if (!pending || !vouchers?.length) return [];
  const paymentTypes = type === "sale" ? ["payment_in", "direct_income", "purchase", "purchase_service", "journal"] : ["payment_out", "direct_expense", "sale", "sale_service", "journal"];
  const rows: LinkedAmountRow[] = [];
  const obAmt = Number(pending[OPENING_BALANCE_VOUCHER_ID]) || 0;
  if (obAmt > 0) rows.push({ date: null, voucherNumber: "Opening Balance", amount: obAmt, paymentVoucherId: OPENING_BALANCE_VOUCHER_ID });
  for (const [voucherId, amount] of Object.entries(pending)) {
    const amt = Number(amount) || 0;
    if (amt <= 0 || voucherId === OPENING_BALANCE_VOUCHER_ID) continue;
    const v = vouchers.find((x: any) => x.id === voucherId);
    if (!v || !paymentTypes.includes(v.type)) continue;
    const date = safeToDate(v.date);
    rows.push({ date, voucherNumber: (v.voucherNumber ?? v.voucher_number ?? "") as string, amount: amt, paymentVoucherId: voucherId });
  }
  rows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  return rows;
}

/** Merge incoming and outgoing linked rows, sort by date. */
export function mergeLinkedRows(incoming: LinkedAmountRow[], outgoing: LinkedAmountRow[]): LinkedAmountRow[] {
  const result = [...incoming, ...outgoing];
  result.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  return result;
}

/**
 * True when some journal voucher bill-wise row allocates to this voucher (mirror of use-transactions status enrichment).
 * Needed because we intentionally ignore linkedFromVoucherNos on payment rows for edit-lock — those arrays are often UI-only.
 */
export function hasJournalBillWiseLinkToVoucherId(voucherId: string | undefined, allVouchers: any[]): boolean {
  if (!voucherId || !Array.isArray(allVouchers)) return false;
  for (const v of allVouchers) {
    if (v.isDeleted || v.type !== "journal") continue;
    const allocations = (v.allocations as Allocation[] | undefined) ?? [];
    if (allocations.some((a) => a.voucherId === voucherId && getAllocationTotal(a) > 0)) return true;
  }
  return false;
}

/**
 * Returns true if the voucher has real bill/spend link data on the document (not display-only linkedFrom/linkedTo nos from use-transactions).
 * Payment In/Out: linkedFromVoucherNos can list journals from table enrichment even when the edit dialog should follow allocations + spend ids only — that mismatch looked like "fiscal companies break edit".
 */
export function hasPaymentLinks(voucherData: any): boolean {
  if (!voucherData) return false;
  const alloc = (voucherData.allocations as any[] | undefined) ?? [];
  if (alloc.some((a) => getAllocationTotal(a) > 0)) return true;
  const type = voucherData.type;
  if (type === "payment_out" || type === "direct_expense") {
    const ids = (voucherData.linkedPaymentInIds as string[] | undefined) ?? [];
    if (ids.some(Boolean)) return true;
  }
  if (
    type === "payment_in" ||
    type === "payment_out" ||
    type === "direct_income" ||
    type === "direct_expense"
  ) {
    return false;
  }
  const from = (voucherData.linkedFromVoucherNos as string[] | undefined) ?? [];
  const to = (voucherData.linkedToVoucherNos as string[] | undefined) ?? [];
  return from.length > 0 || to.length > 0 || alloc.length > 0;
}

/**
 * Returns true if any payment_in, direct_income, payment_out, direct_expense, journal, sale, purchase voucher
 * has allocations targeting the given voucherId (bill-wise link to a sale/purchase).
 * Used so sale/purchase edit is disabled when linked from "Link to Txns" or journal.
 */
export function hasAllocationsToVoucherId(voucherId: string, allVouchers: any[]): boolean {
  if (!voucherId || !Array.isArray(allVouchers)) return false;
  for (const v of allVouchers) {
    if (v.isDeleted) continue;
    const type = v.type;
    const isBillWiseSource = ["payment_in", "direct_income", "payment_out", "direct_expense", "purchase", "purchase_service", "sale", "sale_service", "journal"].includes(type);
    if (!isBillWiseSource) continue;
    const allocations = (v.allocations as Allocation[] | undefined) ?? [];
    if (allocations.some((a) => a.voucherId === voucherId)) return true;
  }
  return false;
}

/** Returns true if the voucher has spend-wise links (Link for spend wise). Used with bill-wise hasPaymentLinks to disable voucher edit until both are unlinked. */
export function hasSpendWiseLinks(voucherData: any, allVouchers: any[]): boolean {
  if (!voucherData?.id || !Array.isArray(allVouchers)) return false;
  const id = voucherData.id;
  const type = voucherData.type;
  if (type === "payment_out" || type === "direct_expense") {
    const ids = (voucherData.linkedPaymentInIds as string[] | undefined) ?? [];
    return ids.some(Boolean);
  }
  if (type === "payment_in" || type === "direct_income") {
    return allVouchers.some(
      (v: any) =>
        !v.isDeleted &&
        Array.isArray(v.linkedPaymentInIds) &&
        v.linkedPaymentInIds.includes(id)
    );
  }
  if (type === "contra") {
    const fromIds = (voucherData.linkedPaymentInIds as string[] | undefined) ?? [];
    if (fromIds.length > 0) return true;
    return allVouchers.some(
      (v: any) =>
        !v.isDeleted &&
        Array.isArray(v.linkedPaymentInIds) &&
        v.linkedPaymentInIds.includes(id)
    );
  }
  return false;
}

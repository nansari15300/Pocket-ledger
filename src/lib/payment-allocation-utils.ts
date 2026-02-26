/**
 * Payment allocation utilities for "Link Payment to Txns" feature.
 * Pure helpers: allocated amount per voucher, outstanding, validate, auto-link, payment status.
 */

/** Special voucherId used when allocating payment to party/staff opening balance. */
export const OPENING_BALANCE_VOUCHER_ID = "opening_balance";

export type Allocation = {
  voucherId: string;
  amount: number;
  /** Amount allocated to tax portion of the target voucher (tax and net are separate accounts) */
  taxAmount?: number;
  /** Amount allocated to net portion of the target voucher */
  netAmount?: number;
};

/** For backward compatibility: total allocated = amount. If taxAmount/netAmount set, amount should equal taxAmount + netAmount. */
export function getAllocationTotal(a: Allocation): number {
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
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof (d as { toDate?: () => Date }).toDate === "function") return (d as { toDate: () => Date }).toDate();
  const parsed = new Date(d as string | number);
  return isNaN(parsed.getTime()) ? null : parsed;
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
      ? ["payment_in", "direct_income"]
      : ["payment_out", "direct_expense"];

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

/** Returns true if the voucher has payment links (allocations or linked voucher refs). Such vouchers should not be deleted until unlinked. */
export function hasPaymentLinks(voucherData: any): boolean {
  if (!voucherData) return false;
  const from = (voucherData.linkedFromVoucherNos as string[] | undefined) ?? [];
  const to = (voucherData.linkedToVoucherNos as string[] | undefined) ?? [];
  const alloc = (voucherData.allocations as any[] | undefined) ?? [];
  return from.length > 0 || to.length > 0 || alloc.length > 0;
}

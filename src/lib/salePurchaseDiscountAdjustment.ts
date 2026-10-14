/** Sale / Purchase discount — adjustment expense posting (+/−) like journal/adjustment voucher. */

export type SalePurchaseDiscountSign = "+" | "-";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeSalePurchaseDiscountSign(raw: unknown): SalePurchaseDiscountSign {
  return String(raw ?? "-").trim() === "+" ? "+" : "-";
}

export function salePurchaseDiscountMagnitude(v: { discount?: unknown } | null | undefined): number {
  return round2(Math.max(0, toNum(v?.discount)));
}

/** Net change to subtotal (− = classic discount). */
export function salePurchaseDiscountNetEffect(
  sign: SalePurchaseDiscountSign,
  magnitude: number
): number {
  const mag = round2(Math.max(0, magnitude));
  return sign === "-" ? -mag : mag;
}

export function salePurchaseTaxableAmount(v: {
  type?: string;
  subTotal?: unknown;
  discount?: unknown;
  discountSign?: unknown;
  amount?: unknown;
  total?: unknown;
}): number {
  const subTotal = toNum(v.subTotal);
  if (subTotal <= 0) return toNum(v.amount ?? v.total);
  const net = salePurchaseDiscountNetEffect(
    normalizeSalePurchaseDiscountSign(v.discountSign),
    salePurchaseDiscountMagnitude(v)
  );
  return round2(subTotal + net);
}

export function resolveAdjustmentExpenseAccountId(
  accounts: Array<{ id: string; name?: string; isSystemAccount?: boolean }> | null | undefined
): string {
  const list = accounts ?? [];
  const found = list.find(
    (a) => a.isSystemAccount === true || String(a.name ?? "").trim().toLowerCase() === "adjustment"
  );
  return found?.id ? String(found.id) : "";
}

/** Extra Dr/Cr on sales/purchase + adjustment expense accounts for discount row. */
export function salePurchaseDiscountExpenseLedgerAmounts(
  v: {
    type?: string;
    discount?: unknown;
    discountSign?: unknown;
    discountExpenseAccountId?: unknown;
    salesAccountId?: unknown;
    incomeAccountId?: unknown;
    purchaseAccountId?: unknown;
    expenseAccountId?: unknown;
  },
  entityId: string
): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  const id = String(entityId || "").trim();
  if (!id) return { debit, credit };

  const mag = salePurchaseDiscountMagnitude(v);
  if (mag <= 0) return { debit, credit };

  const expId = String(v.discountExpenseAccountId ?? "").trim();
  if (!expId) return { debit, credit };

  const sign = normalizeSalePurchaseDiscountSign(v.discountSign);
  const type = String(v.type ?? "");

  if (type === "sale") {
    const salesId = String(v.salesAccountId ?? v.incomeAccountId ?? "sales_account");
    if (id === salesId) {
      if (sign === "-") credit += mag;
      else debit += mag;
    }
    if (id === expId) {
      if (sign === "-") debit += mag;
      else credit += mag;
    }
  } else if (type === "purchase") {
    const purchaseId = String(v.purchaseAccountId ?? v.expenseAccountId ?? "purchase_account");
    if (id === purchaseId) {
      if (sign === "-") debit += mag;
      else credit += mag;
    }
    if (id === expId) {
      if (sign === "-") credit += mag;
      else debit += mag;
    }
  }

  return { debit, credit };
}

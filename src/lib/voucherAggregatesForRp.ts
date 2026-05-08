/**
 * useVouchers `voucherAggregates` loop ka pure copy — Receivables/Payables server summary
 * aur client fallback ke processed entity lists ko client jaisa rakhne ke liye (party/staff/tax maps).
 */
export type RpDebitCredit = { debit: number; credit: number };
export type RpItemAgg = RpDebitCredit & { stockIn: number; stockOut: number };

export type RpVoucherAggregateMaps = {
  partyMap: Map<string, RpDebitCredit>;
  staffMap: Map<string, RpDebitCredit>;
  accountMap: Map<string, RpDebitCredit>;
  taxMap: Map<string, RpDebitCredit>;
  expenseMap: Map<string, RpDebitCredit>;
  itemMap: Map<string, RpItemAgg>;
};

function addVal(
  map: Map<string, RpDebitCredit>,
  id: string,
  type: "debit" | "credit",
  val: number
) {
  if (!id) return;
  const current = map.get(id) || { debit: 0, credit: 0 };
  if (type === "debit") current.debit += val;
  else current.credit += val;
  map.set(id, current);
}

/** Vouchers ek baar scan — party/staff/tax/expense maps (dashboard R/P jaisa). */
export function buildVoucherAggregateMapsForRp(
  vouchers: any[],
  staff: any[],
  items: any[]
): RpVoucherAggregateMaps {
  const partyMap = new Map<string, RpDebitCredit>();
  const staffMap = new Map<string, RpDebitCredit>();
  const accountMap = new Map<string, RpDebitCredit>();
  const taxMap = new Map<string, RpDebitCredit>();
  const expenseMap = new Map<string, RpDebitCredit>();
  const itemMap = new Map<string, RpItemAgg>();

  const itemConfigMap = new Map<string, any>();
  items.forEach((i) => itemConfigMap.set(i.id, i));

  vouchers.forEach((v) => {
    const amount = Number(v.amount || v.total || 0);
    const subTotal = Number(v.subTotal || amount);

    if (v.type === "journal" && v.subType === "add_salary" && Array.isArray(v.entries)) {
      v.entries.forEach((entry: any) => {
        const isStaff = staff.some((s: any) => s.id === entry.accountId);
        if (isStaff) {
          addVal(staffMap, entry.accountId, "credit", Number(entry.credit || 0));
        }
      });
    } else if (v.staffId) {
      if (v.type === "payment_out") {
        addVal(staffMap, v.staffId, "debit", amount);
      } else if (v.type === "payment_in") {
        addVal(staffMap, v.staffId, "credit", amount);
      }
    }

    if (v.partyId) {
      if (["sale", "payment_out", "direct_income"].includes(v.type)) {
        addVal(partyMap, v.partyId, "debit", amount);
      } else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) {
        addVal(partyMap, v.partyId, "credit", amount);
      }
    }

    if (v.type === "sale") {
      const selectedSalesAccountId = v.salesAccountId || v.incomeAccountId || "sales_account";
      addVal(expenseMap, selectedSalesAccountId, "credit", subTotal);
    } else if (v.type === "purchase") {
      const selectedPurchaseAccountId = v.purchaseAccountId || v.expenseAccountId || "purchase_account";
      addVal(expenseMap, selectedPurchaseAccountId, "debit", subTotal);
    }

    const fromAccId = v.fromAccountId || v.accountId;
    if (fromAccId) {
      if (["payment_in", "direct_income", "sale"].includes(v.type)) addVal(accountMap, fromAccId, "debit", amount);
      else if (["payment_out", "direct_expense", "purchase"].includes(v.type))
        addVal(accountMap, fromAccId, "credit", amount);
    }

    if (v.type === "contra") {
      if (v.toAccountId) addVal(accountMap, v.toAccountId, "debit", amount);
      if (v.fromAccountId) addVal(accountMap, v.fromAccountId, "credit", amount);
    }

    if (v.taxAccountId) {
      if (v.type === "payment_out") addVal(taxMap, v.taxAccountId, "debit", amount);
      else if (v.type === "payment_in") addVal(taxMap, v.taxAccountId, "credit", amount);
    }

    if (v.type === "payment_in") {
      const incomeAccId = v.incomeAccountId || v.toAccountId;
      if (incomeAccId) addVal(expenseMap, incomeAccId, "credit", amount);
    }
    if (v.type === "payment_out") {
      const expenseAccId = v.expenseAccountId || v.toAccountId;
      if (expenseAccId) addVal(expenseMap, expenseAccId, "debit", amount);
    }
    if (v.type === "direct_income" && v.incomeAccountId) {
      addVal(expenseMap, v.incomeAccountId, "credit", amount);
    } else if (["direct_expense"].includes(v.type)) {
      const toAccId = v.toAccountId || v.expenseAccountId;
      if (toAccId) addVal(expenseMap, toAccId, "debit", amount);
    }

    if (v.lineItems && Array.isArray(v.lineItems)) {
      v.lineItems.forEach((line: any) => {
        if (line.taxAccountId && line.taxAmount) {
          const tAmt = Number(line.taxAmount);
          if (v.type === "purchase") addVal(taxMap, line.taxAccountId, "debit", tAmt);
          else if (v.type === "sale") addVal(taxMap, line.taxAccountId, "credit", tAmt);
        }

        if (line.itemId) {
          const item = itemConfigMap.get(line.itemId);
          if (item) {
            const current =
              itemMap.get(line.itemId) || { debit: 0, credit: 0, stockIn: 0, stockOut: 0 };
            const qty = Number(line.quantity) || 0;
            const rate = Number(line.rate) || 0;
            const lineAmount = qty * rate;

            if (v.type === "purchase") current.debit += lineAmount;
            if (v.type === "sale") {
              current.credit +=
                v.totalPurchasePrice && v.totalPurchasePrice > 0
                  ? v.totalPurchasePrice
                  : qty * (item.purchasePrice || rate);
            }

            const conversions = (item.unitConversions || []) as any[];
            const smallestUnit =
              conversions.length > 0
                ? conversions[conversions.length - 1].toUnit
                : item.openingBalanceUnit || "";

            let factor = 1;
            if (line.unit && line.unit !== smallestUnit) {
              let currentUnit = line.unit;
              let found = false;
              for (let k = 0; k < 10; k++) {
                const conv = conversions.find((c: any) => c.fromUnit === currentUnit);
                if (!conv) break;
                factor *= Number(conv.conversionFactor) || 1;
                currentUnit = conv.toUnit;
                if (currentUnit === smallestUnit) {
                  found = true;
                  break;
                }
              }
              void found;
            }

            const standardizedQty = qty * factor;

            if (v.type === "purchase") current.stockIn += standardizedQty;
            if (v.type === "sale") current.stockOut += standardizedQty;

            itemMap.set(line.itemId, current);
          }
        }
      });
    }

    if (v.type === "journal" && Array.isArray(v.entries)) {
      v.entries.forEach((entry: any) => {
        const d = Number(entry.debit || 0);
        const c = Number(entry.credit || 0);
        if (entry.accountId) {
          addVal(partyMap, entry.accountId, "debit", d);
          addVal(partyMap, entry.accountId, "credit", c);
          if (v.subType !== "add_salary") {
            addVal(staffMap, entry.accountId, "debit", d);
            addVal(staffMap, entry.accountId, "credit", c);
          }
          addVal(accountMap, entry.accountId, "debit", d);
          addVal(accountMap, entry.accountId, "credit", c);
          addVal(taxMap, entry.accountId, "debit", d);
          addVal(taxMap, entry.accountId, "credit", c);
          addVal(expenseMap, entry.accountId, "debit", d);
          addVal(expenseMap, entry.accountId, "credit", c);
        }
      });
    }
  });

  return { partyMap, staffMap, accountMap, taxMap, expenseMap, itemMap };
}

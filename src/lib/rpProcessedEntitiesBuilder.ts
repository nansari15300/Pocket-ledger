/**
 * Firestore raw parties/staff/taxes + vouchers se `processed*` lists banata hai —
 * `useVouchers` ke processedParties / processedStaff / processedTaxes jaisa (R/P summary ke liye).
 */
import { buildVoucherAggregateMapsForRp } from "@/lib/voucherAggregatesForRp";

const SYSTEM_PARTY_IDS = ["sales_account", "purchase_account"] as const;

export function buildProcessedPartiesStaffTaxesForRp(args: {
  parties: any[];
  staff: any[];
  taxes: any[];
  expenseAccounts: any[];
  vouchers: any[];
  items: any[];
}): { processedParties: any[]; processedStaff: any[]; processedTaxes: any[] } {
  const { parties, staff, taxes, expenseAccounts, vouchers, items } = args;
  const { partyMap, staffMap, taxMap, expenseMap } = buildVoucherAggregateMapsForRp(
    vouchers,
    staff,
    items
  );

  const regularParties = parties
    .filter((p) => !p.isDeleted)
    .map((p) => {
      const stats = partyMap.get(p.id) || { debit: 0, credit: 0 };
      const isOpeningBalanceLedger = p.id === "opening_balance_ledger";
      const balance = isOpeningBalanceLedger
        ? Number(p.openingBalance) || 0
        : (Number(p.openingBalance) || 0) + stats.debit - stats.credit;
      return {
        ...p,
        openingBalance: Number(p.openingBalance) || 0,
        debit: isOpeningBalanceLedger ? (balance > 0 ? balance : 0) : stats.debit,
        credit: isOpeningBalanceLedger ? (balance < 0 ? Math.abs(balance) : 0) : stats.credit,
        balance,
        isSystemAccount: p.isSystemReserved || p.isSystemAccount || false,
      };
    });

  const systemParties = SYSTEM_PARTY_IDS.map((id) => {
    const stats = expenseMap.get(id) || { debit: 0, credit: 0 };
    const originalAcc = expenseAccounts.find((a: any) => a.id === id);
    return {
      id,
      name: originalAcc?.name || (id === "sales_account" ? "Sales Account" : "Purchase Account"),
      groupId: id === "sales_account" ? "income" : "expenses",
      debit: stats.debit,
      credit: stats.credit,
      balance: stats.debit - stats.credit,
      isSystemAccount: originalAcc?.isSystemReserved ?? true,
      openingBalance: 0,
    };
  }).filter((sp) => sp.debit !== 0 || sp.credit !== 0);

  const processedParties = [...regularParties, ...systemParties];

  const processedStaff = staff
    .filter((s) => !s.isDeleted)
    .map((s) => {
      const stats = staffMap.get(s.id) || { debit: 0, credit: 0 };
      return {
        ...s,
        openingBalance: Number(s.openingBalance) || 0,
        debit: stats.debit,
        credit: stats.credit,
        balance: (Number(s.openingBalance) || 0) + stats.debit - stats.credit,
      };
    });

  const processedTaxes = taxes
    .filter((t) => !t.isDeleted)
    .map((t) => {
      const stats = taxMap.get(t.id) || { debit: 0, credit: 0 };
      return {
        ...t,
        debit: stats.debit,
        credit: stats.credit,
        balance: (Number(t.openingBalance) || 0) + stats.debit - stats.credit,
      };
    });

  return { processedParties, processedStaff, processedTaxes };
}

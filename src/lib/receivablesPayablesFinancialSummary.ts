import { endOfDay, startOfDay } from "date-fns";

/** Dashboard date filter — `ad-calendar` DateRange jaisa; server/lib boundary par local type taaki "use client" import na ho. */
export type ReceivablesPayablesDateRange = { from?: Date; to?: Date };

/** Firestore Timestamp / string / Date — R/P date filter ke liye. */
export function safeToDateRp(date: unknown): Date | null {
  if (date == null) return null;
  if (date instanceof Date) return date;
  const d = date as { toDate?: () => Date };
  if (typeof d.toDate === "function") return d.toDate();
  const parsed = new Date(date as string);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export type ReceivablesPayablesFinancialSummary = {
  totalReceivable: number;
  totalPayable: number;
  receivables: { parties: any[]; staff: any[]; taxes: any[] };
  payables: { parties: any[]; staff: any[]; taxes: any[] };
  recCount: number;
  payCount: number;
};

const EMPTY: ReceivablesPayablesFinancialSummary = {
  totalReceivable: 0,
  totalPayable: 0,
  receivables: { parties: [], staff: [], taxes: [] },
  payables: { parties: [], staff: [], taxes: [] },
  recCount: 0,
  payCount: 0,
};

/**
 * Dashboard + FinancialSummaryCards dono ka shared R/P block — vouchers × entities par
 * processEntity (openingBalance + filtered vouchers).
 */
export function computeReceivablesPayablesFinancialSummary(args: {
  vouchers: any[];
  processedParties: any[];
  processedStaff: any[];
  processedTaxes: any[];
  receivablesDateRange: ReceivablesPayablesDateRange | undefined;
  /** true = abhi data load ho raha; zero skeleton (pehle jaisa). */
  loading?: boolean;
}): ReceivablesPayablesFinancialSummary {
  const {
    vouchers,
    processedParties,
    processedStaff,
    processedTaxes,
    receivablesDateRange,
    loading = false,
  } = args;
  if (loading) return { ...EMPTY };

  let filteredVouchers = vouchers;
  if (receivablesDateRange?.from) {
    const fromDate = startOfDay(receivablesDateRange.from);
    const toDate = receivablesDateRange.to
      ? endOfDay(receivablesDateRange.to)
      : endOfDay(fromDate);
    filteredVouchers = vouchers.filter((v) => {
      const txDate = safeToDateRp(v.date);
      return txDate && txDate >= fromDate && txDate <= toDate;
    });
  }

  const receivables = { parties: [] as any[], staff: [] as any[], taxes: [] as any[] };
  const payables = { parties: [] as any[], staff: [] as any[], taxes: [] as any[] };

  const processEntity = (entity: any, type: "party" | "staff" | "tax") => {
    let balance = Number(entity.openingBalance) || 0;

    filteredVouchers.forEach((v) => {
      const amount = v.total || v.amount || 0;

      if (v.type === "journal") {
        const entry = v.entries?.find((e: any) => e.accountId === entity.id);
        if (entry) {
          balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
        }
      } else {
        if (v.partyId === entity.id && type === "party") {
          if (["sale", "payment_out", "direct_income"].includes(v.type)) balance += amount;
          else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) balance -= amount;
        } else if (v.staffId === entity.id && type === "staff") {
          if (v.type === "payment_out") balance += amount;
          else if (v.type === "payment_in") balance -= amount;
        } else if (v.taxAccountId === entity.id && type === "tax") {
          if (v.type === "payment_out") balance += amount;
          else if (v.type === "payment_in") balance -= amount;
        } else if (v.lineItems?.some((li: any) => li.taxAccountId === entity.id) && type === "tax") {
          const taxAmount = v.lineItems.reduce(
            (sum: number, li: any) => (li.taxAccountId === entity.id ? sum + Number(li.taxAmount || 0) : sum),
            0
          );
          if (v.type === "purchase") balance += taxAmount;
          else if (v.type === "sale") balance -= taxAmount;
        }
      }
    });

    const entityData = { party: entity.name, balance, fileUrl: entity.fileUrl };
    if (balance > 0.01) {
      if (type === "party") receivables.parties.push(entityData);
      if (type === "staff") receivables.staff.push(entityData);
      if (type === "tax") receivables.taxes.push(entityData);
    } else if (balance < -0.01) {
      if (type === "party") payables.parties.push(entityData);
      if (type === "staff") payables.staff.push(entityData);
      if (type === "tax") payables.taxes.push(entityData);
    }
  };

  processedParties.forEach((p) => processEntity(p, "party"));
  processedStaff.forEach((s) => processEntity(s, "staff"));
  processedTaxes.forEach((t) => processEntity(t, "tax"));

  const sortFn = (a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance);
  receivables.parties.sort(sortFn);
  receivables.staff.sort(sortFn);
  receivables.taxes.sort(sortFn);
  payables.parties.sort(sortFn);
  payables.staff.sort(sortFn);
  payables.taxes.sort(sortFn);

  const calcSum = (arr: any[]) => arr.reduce((sum, item) => sum + item.balance, 0);
  const totalReceivable =
    calcSum(receivables.parties) + calcSum(receivables.staff) + calcSum(receivables.taxes);
  const totalPayable =
    calcSum(payables.parties) + calcSum(payables.staff) + calcSum(payables.taxes);

  const recCount =
    receivables.parties.length + receivables.staff.length + receivables.taxes.length;
  const payCount = payables.parties.length + payables.staff.length + payables.taxes.length;

  return { totalReceivable, totalPayable, receivables, payables, recCount, payCount };
}

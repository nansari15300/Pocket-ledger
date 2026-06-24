import { FISCAL_YEAR_PARTITION_ROW_TYPE } from "@/lib/fiscalPartitionRows";

/** Spend-wise Balance column: statement jaisa cumulative running (group-internal _spendWiseRunningBalance alag rahe blink ke liye). */
export function applySpendWiseStatementRunningBalances<T = any>(list: readonly T[], openingBalance: number): T[] {
  let running = Number(openingBalance) || 0;
  return (list || []).map((raw) => {
    const tx = raw as any;
    if (tx?._spendWiseSpacer) return raw;

    if (tx?.type === "opening_balance") {
      const explicit =
        typeof tx.runningBalance === "number" ? Number(tx.runningBalance) : running;
      running = explicit;
      return {
        ...tx,
        _spendWiseLedgerRunningBalance: running,
        runningBalance: running,
        balance: running,
      } as T;
    }

    if (tx?.type === FISCAL_YEAR_PARTITION_ROW_TYPE) {
      return {
        ...tx,
        _spendWiseLedgerRunningBalance: running,
        runningBalance: running,
        balance: running,
      } as T;
    }

    let debit = Number(tx.debit) || 0;
    let credit = Number(tx.credit) || 0;
    const linkedAmt = Number(tx._spendWiseLinkedAmount) || 0;
    if (tx._spendWiseChild && linkedAmt > 0) {
      const isOutflow =
        tx.type === "payment_out" ||
        tx.type === "direct_expense" ||
        (Number(tx.credit) > 0);
      if (isOutflow) {
        debit = 0;
        credit = linkedAmt;
      } else {
        debit = linkedAmt;
        credit = 0;
      }
    }

    running += debit - credit;
    return {
      ...tx,
      _spendWiseLedgerRunningBalance: running,
      runningBalance: running,
      balance: running,
    } as T;
  });
}

/**
 * Statement top chips (`Money In` / `Money Out`): payment_in/out ke alawa
 * **`journal` / `contra`** rows ka entity-centric **Cr → In**, **Dr → Out**
 * (`useTransactions` se bani table row jo user ko dikh rahe — same numbers).
 *
 * Salary journal bilkul alag Staff chip hai — Money In mix na ho isliye `add_salary` skip.
 */
export function mergePaymentAndLedgerJournalContraFlows(
  paymentMoneyIn: number,
  paymentMoneyOut: number,
  ledgerRows: readonly any[]
): { moneyIn: number; moneyOut: number } {
  let jrnlCr = 0;
  let jrnlDr = 0;
  for (const row of ledgerRows) {
    if (row?.type === "journal") {
      if (row?.subType === "add_salary") continue;
      jrnlCr += Number(row.credit) || 0;
      jrnlDr += Number(row.debit) || 0;
    } else if (row?.type === "contra") {
      jrnlCr += Number(row.credit) || 0;
      jrnlDr += Number(row.debit) || 0;
    }
  }
  return { moneyIn: paymentMoneyIn + jrnlCr, moneyOut: paymentMoneyOut + jrnlDr };
}

import type { Loan } from "../types/loanTypes";
import { roundMoney } from "./loanRounding";

/** Sanctioned principal still not drawn. */
export function remainingUndisbursedAmount(loan: Pick<Loan, "principalAmount" | "disbursedAmount">): number {
  return roundMoney(Math.max(0, Number(loan.principalAmount || 0) - Number(loan.disbursedAmount || 0)));
}

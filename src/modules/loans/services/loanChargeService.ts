import type { LoanChargeInput } from "../types/loanTransactionTypes";
import { addLoanCharge as postCharge } from "./loanChargePostingService";

export async function addLoanCharge(params: {
  companyId: string;
  userId: string;
  userName: string;
  company: Parameters<typeof postCharge>[0]["company"];
  loanId: string;
  input: LoanChargeInput;
}): Promise<void> {
  return postCharge(params);
}

export { changeInterestRate } from "./loanRateChangeImpl";

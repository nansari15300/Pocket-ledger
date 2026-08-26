import {
  LOAN_INTEREST_ACCOUNT_NAME,
  LOAN_LATE_FEE_ACCOUNT_NAME,
  LOAN_PROCESSING_ACCOUNT_NAME,
} from "../constants/loanConstants";

type NamedExpense = { id: string; name?: string; accountName?: string; isDeleted?: boolean };

function norm(name: string): string {
  return String(name || "").trim().toLowerCase();
}

export function findExpenseAccountIdByName(accounts: NamedExpense[], name: string): string | undefined {
  const wanted = norm(name);
  const row = accounts.find(
    (a) => !a.isDeleted && norm(String(a.name || a.accountName || "")) === wanted
  );
  return row?.id;
}

/** Bind standard loan expense ledgers when they already exist in the company chart. */
export function resolveExistingLoanExpenseDefaults(accounts: NamedExpense[]): {
  interestExpenseAccountId?: string;
  processingFeeAccountId?: string;
  lateFeeAccountId?: string;
} {
  return {
    interestExpenseAccountId: findExpenseAccountIdByName(accounts, LOAN_INTEREST_ACCOUNT_NAME),
    processingFeeAccountId: findExpenseAccountIdByName(accounts, LOAN_PROCESSING_ACCOUNT_NAME),
    lateFeeAccountId: findExpenseAccountIdByName(accounts, LOAN_LATE_FEE_ACCOUNT_NAME),
  };
}

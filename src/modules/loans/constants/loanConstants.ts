export const LOAN_COLLECTIONS = {
  loans: "loans",
  schedules: "loan_schedules",
  transactions: "loan_transactions",
  rateHistory: "loan_rate_history",
  charges: "loan_charges",
  audit: "loan_audit_logs",
  settings: "loan_settings",
  documents: "loan_documents",
} as const;

export const LOAN_SETTINGS_DOC_ID = "default";

export const LOAN_LIABILITY_GROUP_ID = "loans_liabilities";
/** Canonical staff_groups doc for loan accounts without a user group. */
export const LOAN_UNGROUPED_GROUP_ID = "ungrouped_staff";
/** Synthetic list row id (Bank/Staff Groups tab jaisa). */
export const LOAN_UNGROUPED_UI_ID = "ungrouped";
export const LOAN_FINANCE_GROUP_NAME = "Finance Costs";
export const LOAN_INTEREST_ACCOUNT_NAME = "Loan Interest";
export const LOAN_PROCESSING_ACCOUNT_NAME = "Loan Processing Charges";
export const LOAN_LATE_FEE_ACCOUNT_NAME = "Loan Late Payment Charges";

export const LOAN_TYPES = [
  "Term Loan",
  "Business Loan",
  "Personal Loan",
  "Vehicle Loan",
  "Home Loan",
  "Working Capital Loan",
  "Overdraft (OD)",
  "Cash Credit",
  "Secured Loan",
  "Unsecured Loan",
  "Other",
] as const;

export const REPAYMENT_TYPES = ["emi", "interest_only", "bullet"] as const;

export const REPAYMENT_TYPE_LABELS: Record<(typeof REPAYMENT_TYPES)[number], string> = {
  emi: "EMI (Principal + Interest)",
  interest_only: "Interest Only",
  bullet: "Bullet (Principal at maturity)",
};

/** Loan types that default to interest-only repayment (OD / CC). */
export const OD_LOAN_TYPES = ["Overdraft (OD)", "Cash Credit"] as const;

export const LENDER_TYPES = ["Bank", "NBFC", "Cooperative", "Individual", "Government", "Other"] as const;

export const INTEREST_METHODS = [
  "reducing_balance",
  "flat_rate",
  "simple_interest",
  "compound_interest",
  "daily_reducing_balance",
] as const;

export const INTEREST_RATE_TYPES = ["fixed", "floating"] as const;

export const TENURE_UNITS = ["months", "years"] as const;

export const PAYMENT_FREQUENCIES = ["monthly", "quarterly", "half_yearly", "yearly", "custom"] as const;

export const DAY_BASIS_OPTIONS = [365, 366, 360] as const;

export const LOAN_STATUSES = ["draft", "active", "overdue", "restructured", "closed", "cancelled"] as const;

export const SCHEDULE_STATUSES = [
  "upcoming",
  "due",
  "partially_paid",
  "paid",
  "overdue",
  "waived",
  "cancelled",
] as const;

export const CHARGE_TYPES = [
  "processing_fee",
  "documentation_fee",
  "insurance",
  "late_payment_fee",
  "prepayment_fee",
  "other",
] as const;

export const LATE_FEE_MODES = ["none", "fixed", "percent", "daily_percent"] as const;

export const PREPAYMENT_MODES = ["reduce_emi", "reduce_tenure"] as const;

export const AUDIT_ACTIONS = [
  "loan_created",
  "loan_updated",
  "schedule_generated",
  "emi_posted",
  "emi_reversed",
  "partial_payment",
  "prepayment",
  "interest_rate_changed",
  "charge_added",
  "charge_removed",
  "loan_restructured",
  "loan_closed",
  "loan_reopened",
  "disbursement_posted",
] as const;

export const FREQUENCY_MONTHS: Record<(typeof PAYMENT_FREQUENCIES)[number], number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
  custom: 1,
};

export const PERIODS_PER_YEAR: Record<(typeof PAYMENT_FREQUENCIES)[number], number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
  custom: 12,
};

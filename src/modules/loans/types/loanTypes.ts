import type {
  CHARGE_TYPES,
  DAY_BASIS_OPTIONS,
  INTEREST_METHODS,
  INTEREST_RATE_TYPES,
  LATE_FEE_MODES,
  LENDER_TYPES,
  LOAN_STATUSES,
  LOAN_TYPES,
  PAYMENT_FREQUENCIES,
  PREPAYMENT_MODES,
  REPAYMENT_TYPES,
  TENURE_UNITS,
} from "../constants/loanConstants";

export type LoanType = (typeof LOAN_TYPES)[number] | string;
export type LenderType = (typeof LENDER_TYPES)[number];
export type InterestMethod = (typeof INTEREST_METHODS)[number];
export type InterestRateType = (typeof INTEREST_RATE_TYPES)[number];
export type TenureUnit = (typeof TENURE_UNITS)[number];
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];
export type DayBasis = (typeof DAY_BASIS_OPTIONS)[number];
export type LoanStatus = (typeof LOAN_STATUSES)[number];
export type ChargeType = (typeof CHARGE_TYPES)[number];
export type LateFeeMode = (typeof LATE_FEE_MODES)[number];
export type PrepaymentMode = (typeof PREPAYMENT_MODES)[number];
export type RepaymentType = (typeof REPAYMENT_TYPES)[number];
export type PaymentDayMode = "same_day" | "month_end" | "custom_day";

export type LoanAutoPayEmiPaymentDateMode = "due_date" | "today" | "due_plus_offset";
export type LoanAutoPayEmiJournalDateMode = "same_as_payment" | "today";
export type LoanAutoPayEmiAmountMode = "full" | "partial";
export type LoanAutoPayEmiNoteMode = "auto" | "manual" | "both";

export type LoanAutoPayEmiSettings = {
  enabled: boolean;
  paymentDateMode: LoanAutoPayEmiPaymentDateMode;
  journalDateMode: LoanAutoPayEmiJournalDateMode;
  /** Days after schedule due date (used when paymentDateMode is due_plus_offset). */
  dayOffset: number;
  /** Ordered bank/cash accounts to try (first with enough balance wins). */
  accountIds: string[];
  amountMode: LoanAutoPayEmiAmountMode;
  /** When true, never pay more than account available balance. */
  enforceAvailableBalance: boolean;
  noteMode: LoanAutoPayEmiNoteMode;
  autoNoteTemplate: string;
  /** When true, auto-post EMI when Pay EMI dialog opens (if due row exists). */
  autoPostOnOpen: boolean;
  lastAutoPaidScheduleId?: string | null;
};

export type Loan = {
  id: string;
  companyId: string;
  loanNumber: string;
  loanName: string;
  lenderName: string;
  lenderType: LenderType;
  bankAccountId: string;
  loanAccountId: string;
  interestExpenseAccountId: string;
  processingFeeAccountId: string;
  lateFeeAccountId: string;
  /** Set when the loan was started from Add Existing Account (bank stays Bank/Cash). */
  convertedFromBankAccountId?: string;
  loanType: LoanType;
  loanPurpose: string;
  principalAmount: number;
  disbursedAmount: number;
  disbursementDate: string;
  firstPaymentDate: string;
  maturityDate: string;
  interestMethod: InterestMethod;
  interestRate: number;
  interestRateType: InterestRateType;
  tenure: number;
  tenureUnit: TenureUnit;
  paymentFrequency: PaymentFrequency;
  customIntervalMonths: number;
  emiAmount: number;
  emiIsManual: boolean;
  repaymentType?: RepaymentType;
  paymentDayMode: PaymentDayMode;
  paymentDay: number;
  gracePeriodDays: number;
  dayBasis: DayBasis;
  compoundingFrequency: PaymentFrequency;
  lateFeeMode: LateFeeMode;
  lateFeeValue: number;
  autoPostLateFee: boolean;
  postDisbursementOnSave: boolean;
  disbursementJournalId: string | null;
  scheduleVersion: number;
  outstandingPrincipal: number;
  outstandingInterest: number;
  accruedInterest: number;
  paidPrincipal: number;
  paidInterest: number;
  paidCharges: number;
  status: LoanStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  createdBy: string;
  updatedBy: string;
  isDeleted?: boolean;
  /** Per-loan auto pay EMI configuration (Pay EMI → Settings). */
  autoPayEmiSettings?: LoanAutoPayEmiSettings;
};

export type LoanDraftInput = {
  loanName: string;
  loanNumber?: string;
  lenderName: string;
  lenderType: LenderType;
  bankAccountId: string;
  loanAccountId?: string;
  interestExpenseAccountId?: string;
  processingFeeAccountId?: string;
  lateFeeAccountId?: string;
  createLoanAccount?: boolean;
  createInterestAccount?: boolean;
  convertedFromBankAccountId?: string;
  loanType: LoanType;
  customLoanType?: string;
  loanPurpose: string;
  principalAmount: number;
  disbursedAmount: number;
  disbursementDate: string;
  firstPaymentDate: string;
  interestMethod: InterestMethod;
  interestRate: number;
  interestRateType: InterestRateType;
  tenure: number;
  tenureUnit: TenureUnit;
  paymentFrequency: PaymentFrequency;
  customIntervalMonths?: number;
  emiAmount?: number;
  emiIsManual?: boolean;
  repaymentType?: RepaymentType;
  paymentDayMode: PaymentDayMode;
  paymentDay?: number;
  gracePeriodDays: number;
  dayBasis: DayBasis;
  compoundingFrequency?: PaymentFrequency;
  lateFeeMode: LateFeeMode;
  lateFeeValue: number;
  autoPostLateFee: boolean;
  postDisbursementOnSave: boolean;
  notes?: string;
  /** Staged group for a new loan liability staff account (before save). */
  loanLiabilityGroupId?: string;
  /** Staged on loan form save — persisted on linked staff (loan liability) account. */
  liabilityAvatar?: File | string | null;
  liabilityDocuments?: (File | string)[];
};

export type LoanSettings = {
  id: string;
  companyId: string;
  defaultDayBasis: DayBasis;
  defaultGracePeriodDays: number;
  defaultLateFeeMode: LateFeeMode;
  defaultLateFeeValue: number;
  autoPostLateFee: boolean;
  defaultInterestMethod: InterestMethod;
  updatedAt: string;
};

export type LoanDashboardStats = {
  activeLoans: number;
  totalBorrowed: number;
  outstanding: number;
  principalPaid: number;
  interestPaid: number;
  upcomingEmi: number;
  overdueAmount: number;
  overdueInstallments: number;
  maturingSoon: number;
};

export type LoanPreview = {
  emiAmount: number;
  installmentCount: number;
  totalInterest: number;
  totalRepayment: number;
  maturityDate: string;
  firstPaymentDate: string;
};

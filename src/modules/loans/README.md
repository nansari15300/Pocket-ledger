# Loan Management Module

Pocket Ledger’s **Loan Overview** does not replace the existing books. It stores loan schedules, EMI, charges, and audit in company-scoped `company_docs` collections, and posts **real journals** through `saveVoucher` into the existing voucher / ledger / Chart of Accounts system.

Sidebar: **Loan Overview**. **Create Loan Account** opens a full form.

## Folder structure

```
src/modules/loans/
  index.ts
  README.md
  constants/loanConstants.ts, loanFormIntros.ts
  types/          loanTypes.ts, loanScheduleTypes.ts, loanTransactionTypes.ts
  utils/          dates, rounding, validation, status, loanLiabilityStaff.ts
  calculations/   EMI engines + loanCalculation.selftest.ts
  db/             repository over company_docs (no new SQL ALTER tables)
  services/       mapping, journals, payment, prepayment, rate, close, reports
  hooks/          useLoans, useLoan, …
  components/     dashboard, form, details, dialogs
  pages/          LoansPage.tsx, LoanDetailsPage.tsx
```

Routes: `src/app/(dashboard)/loans/page.tsx`, `src/app/(dashboard)/loans/[id]/page.tsx`

## Database (company_docs)

All rows are **company-scoped** (`companyId` + `listCompanyDocsFromBrowserDb` / `writeLoanEntity` SQLite-first). No second database.

| Collection | When populated |
| --- | --- |
| `loans` | On Save Loan |
| `loan_schedules` | On Save Loan (and after prepay / rate change) |
| `loan_transactions` | Disbursement, EMI, partial, prepayment, charge, reversal |
| `loan_rate_history` | Initial rate + each rate change |
| `loan_charges` | When a charge is posted |
| `loan_audit_logs` | Create, schedule, EMI, reverse, prepay, rate, charge, close, reopen |
| `loan_documents` | Only if the user adds a document title on the loan |
| `loan_settings` | Reserved; not written by the current UI |

Backup / restore / online pull / delta / company delete include these collection names in the existing lists (`companyBackupCollections`, `firestoreToLocalCompanyPull`, `companyDeltaCache`, `deleteCompanyFirestoreClient`, loans route in `FirebaseLedgerDeltaSyncManager`). There is **no** separate loan backup engine.

## Chart of Accounts — how accounts are created

This product has **no standalone unified COA screen**. Ledgers live in existing masters:

| Need | Existing master | Group | Created name |
| --- | --- | --- | --- |
| Loan liability (payable) | **Staff** | System group `loans_liabilities` (**Loans & Liabilities**, type Liability, parent `liabilities`) | Loan Name (find-or-create) |
| Interest expense | **Income & Expense** (`expense_accounts`) | **Finance Costs** (created under `indirect_expense` if missing) | `Loan Interest` |
| Processing fee | same | Finance Costs | `Loan Processing Charges` |
| Late fee | same | Finance Costs | `Loan Late Payment Charges` |
| Bank / cash | Existing **Bank/Cash** | User’s selected account | **Never auto-created** |

Duplicate names are reused (same company). A Staff **employee** with the same name is **not** reused as a loan payable. If two loans would share one liability, a unique suffix (`Name (2)`) is created.

Loan Staff rows have `isLoanAccount: true` and `groupId: loans_liabilities`. They appear under **Staff → group Loans & Liabilities** (that is this app’s liability COA). They are hidden from **Add Salary** staff dropdowns. They remain selectable in Journal / Payment In / Payment Out so the ledger is usable outside the Loan module.

**Do not convert a Bank account into a Staff account.** Add Existing Account keeps Bank/Cash as money and links a separate liability Staff row.

## Accounting flow (real journals)

Journals call `saveVoucher({ type: "journal", entries: [{ accountId, debit, credit }] })` with the **actual** Bank, Staff, and Expense IDs. They are approved loan-module vouchers (`isLoanModuleVoucher`).

### Disbursement (on Save, if “Post disbursement” is checked)

Dr Bank/Cash  principal  
Cr Loan Liability (Staff)  principal  

Loan outstanding = disbursed amount. Status = **Active**.

If disbursement is not posted: status = **Draft**, outstanding = **0** (matches ledger). EMI / prepay / charges are blocked until disbursement exists.

### EMI / partial payment

Dr Loan Liability  principal portion  
Dr Loan Interest (expense)  interest portion  
Dr Late fee expense  (if included)  
Cr Bank/Cash  total paid  

Outstanding principal falls **only** by the principal portion.

Sample reducing 5,000,000 @ 10.50% / 60 months: first interest = 5,000,000 × (10.50%/12) = **43,750**. EMI is calculated, not hardcoded. Principal portion = EMI − 43,750. Closing = 5,000,000 − that principal.

### Prepayment

Dr Loan Liability  prepay amount  
Cr Bank/Cash  prepay amount  

Interest expense is **not** increased. Future unpaid rows are rebuilt (Reduce EMI or Reduce Tenure). Posted EMI journals are not rewritten.

### Charge

Dr fee expense  amount  
Cr Bank/Cash  amount  

### Reversal (latest EMI / partial)

Original journal is **kept**. A new reversing journal swaps Debit/Credit. Schedule paid amounts and loan outstanding are restored. Audit: `emi_reversed`.

## Interest methods

1. Reducing balance — standard amortization  
2. Flat rate — interest on original principal for the tenure, split across installments  
3. Simple interest — P × r × period on original principal each installment  
4. Compound interest — outstanding grown by (1+r) then installment applied  
5. Daily reducing — outstanding × rate × actual days / day basis (365 / 366 / 360)

## Dates

Due dates are local calendar `YYYY-MM-DD` parsed at **local noon** (no UTC `toISOString` on the calendar day). Journals pass a local `Date` into `saveVoucher`. Month-end / 31st clamping and leap 2028-02-29 are covered by tests.

Due date, payment date, and journal date are stored separately. Paying on 05-09-2026 does not change due date 01-09-2026.

## EMI / schedule

Calculate Schedule **before save** shows EMI, total interest, total repayment, installment count, maturity, and the installment table (opening / principal / interest / EMI / closing).

Partial payment: status **Partially Paid**, remaining = EMI − paid, not marked Paid until remaining is 0.

## Prepayment / rate change / close

- Prepay Reduce EMI / Reduce Tenure rebuilds **future** rows only; historical posted rows stay (`isHistorical` / cancelled copies of unpaid future).  
- Rate change stores old/new/effective date/reason/user/time; future unpaid rows use the new rate.  
- Close requires outstanding principal 0 (unless force). Pay EMI on closed/draft is blocked.

## Reports

Loan Reports view uses loan collections + schedules/transactions (outstanding, overdue, paid principal/interest). Profit & Loss / Balance Sheet / Bank ledger use **existing voucher-based reports**. Interest hits P&L only because the EMI journal debits `Loan Interest` expense. Liability hits the Staff ledger / Balance Sheet because the journal credits/debits the Staff ID under Loans & Liabilities.

## Known limitations

- Loan outstanding on the loan document is updated by this module from posted principal splits. Staff ledger balance is computed from **all** journals on that Staff ID. They match if money only moves through Loan-module journals. A **manual** journal on the same Staff ID can diverge.  
- `loan_settings` is not used by the UI yet.  
- Documents are title/reference only (no file pack).  
- Schedule row stores the **last** payment’s `journalEntryId`; earlier partials remain on `loan_transactions`.  
- Reduce-tenure length search uses reducing-EMI math; other methods keep the loan’s method when rebuilding the future table.  
- Staff flat list still shows loan payables (they belong in that master). Salary dropdown excludes them.  
- Reversal is implemented for the **latest** EMI / partial only (not disbursement/prepay/charge in one click).

## Tests

```
npm run test:loans
```

Sample used in tests: 5,000,000 · 10.50% · reducing · 60 months · first EMI 2026-09-01.

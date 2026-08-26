# Loan Module

Canonical description: [`src/modules/loans/README.md`](../src/modules/loans/README.md).

**Sidebar:** Loan Overview  
**Create:** Create Loan Account (Calculate Schedule shows the full installment table before save).  
**Add Existing Account:** Bank/Cash stays a money account; a Staff payable under **Loans & Liabilities** is created or reused.  
**Help:** (i) on fields, English / हिन्दी / नेपाली (default English).

## Accounting (existing vouchers)

| Event | Journal |
| --- | --- |
| Disbursement | Dr Bank/Cash · Cr Staff (Loans & Liabilities) |
| EMI | Dr Staff (principal) · Dr expense `Loan Interest` · Cr Bank/Cash |
| Charge / late fee | Dr expense · Cr Bank/Cash |
| Prepayment | Dr Staff · Cr Bank/Cash (principal only) |
| EMI reversal | New opposite journal; original voucher kept |

## Auto-created existing masters

- Staff `{Loan Name}` in group `loans_liabilities` (not an employee; `isLoanAccount`)  
- Expense group `Finance Costs`  
- Expense accounts `Loan Interest`, `Loan Processing Charges`, `Loan Late Payment Charges`  
- Bank/Cash is **selected**, never duplicated  

Find-or-create by name; employees are not reused; two loans do not share one liability.

## Data

`company_docs`: `loans`, `loan_schedules`, `loan_transactions`, `loan_rate_history`, `loan_charges`, `loan_audit_logs`, `loan_settings` (unused UI), `loan_documents` (optional titles).

Included in existing backup, restore, pull, delta, and company-delete collection lists. Company isolation is `companyId` on every row.

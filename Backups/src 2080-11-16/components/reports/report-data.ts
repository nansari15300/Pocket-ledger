
export type Report = {
  id: string;
  name: string;
  description: string;
  /** When set, clicking this item navigates to the href instead of opening report details. */
  href?: string;
  /** When set, this report is only shown when company country matches (e.g. Nepal for Anusuchi 13). */
  countryOnly?: string;
};

export const reports: Report[] = [
  {
    id: "financialsummary",
    name: "Financial Summary",
    description: "Overview of receivables and payables.",
  },
  {
    id: "balancesheet",
    name: "Balance Sheet",
    description: "A snapshot of the company's financial health.",
  },
  {
    id: "trialbalance",
    name: "Trial Balance",
    description: "Summary of all ledger balances to verify equality.",
  },
  {
    id: "profitandloss",
    name: "Profit & Loss Statement",
    description: "Summarizes revenues, costs, and expenses over a period.",
  },
  {
    id: "cashflow",
    name: "Cash Flow Statement",
    description: "Shows how cash moves in and out of the company.",
  },
  {
    id: "day-book",
    name: "Day Book",
    description: "A chronological record of all daily transactions.",
  },
  {
    id: "accounts-statement",
    name: "Account Summary",
    description: "View all accounts and account groups in a tree structure.",
  },
  {
    id: "group-statement",
    name: "Group Summary",
    description: "View the transaction history for a specific group.",
  },
  {
    id: "expense-statement",
    name: "Income & Expense Report",
    description: "View Income & Expense account or group transaction history.",
  },
  {
    id: "item-statement",
    name: "Item Statement",
    description: "View item or item group transaction history.",
  },
  {
    id: "stock-summary",
    name: "Stock Summary",
    description: "Overview of item stock levels and values.",
  },
  { id: "sale", name: "Sale Register", description: "Create and manage sales / invoices." },
  { id: "purchase", name: "Purchase Register", description: "Create and manage purchases." },
  { id: "payment-in", name: "Payment In", description: "Record incoming payments." },
  { id: "payment-out", name: "Payment Out", description: "Record outgoing payments." },
  { id: "add-salary", name: "Add Salary", description: "Add salary entries for staff." },
  { id: "contra", name: "Contra Report", description: "Transfer between bank and cash accounts." },
  { id: "journal", name: "Journals", description: "Create journal entries." },
  {
    id: "notes",
    name: "Notes",
    description: "Create and manage notes.",
  },
  {
    id: "anusuchi-13",
    name: "Anusuchi 13",
    description: "Nepali VAT: Parties with transaction of one lac or above.",
    countryOnly: "Nepal",
  },
  {
    id: "gst-report-1",
    name: "GSTR-1",
    description: "Summary of all outward supplies (sales).",
  },
  {
    id: "gst-report-2",
    name: "GSTR-2",
    description: "Summary of all inward supplies (purchases).",
  },
  {
    id: "gst-report-3b",
    name: "GSTR-3B",
    description: "Monthly summary return of sales and purchases.",
  },
];

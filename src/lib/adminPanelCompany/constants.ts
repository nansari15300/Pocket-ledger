/**
 * Isolated Admin Panel Company namespace.
 *
 * Keep tenantId / licenseId in every document from day one so a future
 * PL Server Gold host can use its own local tenant without changing this
 * cloud tenant's accounting data shape.
 */
export const ADMIN_PANEL_COMPANIES_COLLECTION = "admin_panel_companies";
export const CLOUD_ADMIN_PANEL_TENANT_ID = "pocket-ledger-cloud";

export const ADMIN_PANEL_COMPANY_NAME = "Pocket Ledger Admin Panel Company";

export const ADMIN_PANEL_DEFAULT_LEDGER_ACCOUNTS = [
  {
    id: "subscription-sales",
    name: "Subscription Sales",
    type: "income",
    systemGenerated: true,
  },
  {
    id: "gateway-clearing",
    name: "Gateway Clearing / Bank",
    type: "asset",
    systemGenerated: true,
  },
  {
    id: "agent-commission-expense",
    name: "Agent Commission Expense",
    type: "expense",
    systemGenerated: true,
  },
  {
    id: "agent-commission-payable",
    name: "Agent Commission Payable",
    type: "liability",
    systemGenerated: true,
  },
  {
    id: "tax-payable",
    name: "Tax Payable",
    type: "liability",
    systemGenerated: true,
  },
] as const;

export const ADMIN_PANEL_ENTITY_KINDS = [
  "parties",
  "bank_accounts",
  "staff",
  "taxes",
  "expense_accounts",
  "vouchers",
] as const;

export type AdminPanelEntityKind = (typeof ADMIN_PANEL_ENTITY_KINDS)[number];

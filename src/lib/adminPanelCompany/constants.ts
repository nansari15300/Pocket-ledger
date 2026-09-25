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

/** Local SQLite / `useCompany` id — data lives in `admin_panel_companies/{CLOUD_ADMIN_PANEL_TENANT_ID}`. */
export const ADMIN_PANEL_COMPANY_LOCAL_ID = "pl-admin-panel-pocket-ledger-cloud";

export const ADMIN_PANEL_COMPANY_MODE_SESSION_KEY = "pl_admin_panel_company_ledger_mode_v1";

/** Legacy combined gateway bank — hidden; use per-gateway ids below. */
export const ADMIN_PANEL_SEED_GATEWAY_BANK_ID = "system-payment-gateway";
export const ADMIN_PANEL_SEED_AGENT_EXPENSE_ID = "agent-commission-expense";

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


import type { MasterGroupListConfig } from "@/lib/masterGroupListTree";
import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import { STAFF_SYSTEM_GROUP_ID } from "@/lib/staffSystemGroups";

export const BANK_ACCOUNT_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "bank-sys:",
  grpExpandPrefix: "bank-grp:",
  branches: [
    {
      id: "bank_accounts_group",
      name: "Bank Accounts",
      rootParentIds: ["bank_accounts_group"],
    },
    {
      id: "cash_in_hand_group",
      name: "Cash-in-Hand",
      rootParentIds: ["cash_in_hand_group"],
    },
  ],
};

export const TAX_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "tax-sys:",
  grpExpandPrefix: "tax-grp:",
  branches: [
    {
      id: "duties_taxes",
      name: "Duties & Taxes",
      rootParentIds: ["duties_taxes"],
    },
  ],
};

export const ITEM_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "item-sys:",
  grpExpandPrefix: "item-grp:",
  branches: [
    {
      id: "stock_items",
      name: "Stock Items",
      rootParentIds: ["stock_items"],
    },
    {
      id: "services",
      name: "Services",
      rootParentIds: ["services"],
    },
  ],
};

export const PARTY_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "party-sys:",
  grpExpandPrefix: "party-grp:",
  focusBranchByGroupId: {
    ic_company: "sundry_debtors",
  },
  branches: [
    {
      id: "sundry_debtors",
      name: "Sundry Debtors",
      rootParentIds: ["sundry_debtors"],
    },
    {
      id: "sundry_creditors",
      name: "Sundry Creditors",
      rootParentIds: ["sundry_creditors"],
    },
  ],
};

export const STAFF_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "staff-sys:",
  grpExpandPrefix: "staff-grp:",
  branches: [
    {
      id: LOAN_LIABILITY_GROUP_ID,
      name: "Loan & Liabilities",
      rootParentIds: [LOAN_LIABILITY_GROUP_ID, STAFF_SYSTEM_GROUP_ID],
    },
  ],
};

/** @deprecated Use STAFF_GROUP_LIST_CONFIG */
export const STAFF_LIABILITY_GROUP_LIST_CONFIG = STAFF_GROUP_LIST_CONFIG;

export const LOAN_ACCOUNT_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "loan-sys:",
  grpExpandPrefix: "loan-grp:",
  branches: [
    {
      id: LOAN_LIABILITY_GROUP_ID,
      name: "Loan & Liabilities",
      rootParentIds: [LOAN_LIABILITY_GROUP_ID],
    },
  ],
};

/** Income & Expense — virtual P&L branches (not in system-groups registry). */
export const EXPENSE_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "exp-sys:",
  grpExpandPrefix: "exp-grp:",
  branches: [
    {
      id: "income",
      name: "Income",
      rootParentIds: ["income", "direct_income", "indirect_income"],
    },
    {
      id: "expenses",
      name: "Expenses",
      rootParentIds: ["expenses", "direct_expense", "indirect_expense"],
    },
  ],
  virtualRootIds: new Set([
    "income",
    "expenses",
    "direct_income",
    "indirect_income",
    "direct_expense",
    "indirect_expense",
  ]),
};

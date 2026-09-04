import {

  BANK_ACCOUNT_GROUP_LIST_CONFIG,

  EXPENSE_GROUP_LIST_CONFIG,

  ITEM_GROUP_LIST_CONFIG,

  PARTY_GROUP_LIST_CONFIG,

  STAFF_GROUP_LIST_CONFIG,

  TAX_GROUP_LIST_CONFIG,

} from "@/lib/masterGroupListConfigs";

import type { MasterGroupListConfig } from "@/lib/masterGroupListTree";

import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";

import { PARTY_SYSTEM_GROUP_OPTIONS } from "@/lib/partySystemGroups";
import {
  STAFF_FORM_DEFAULT_ACCOUNT_TYPE_ID,
  STAFF_SYSTEM_GROUP_ID,
} from "@/lib/staffSystemGroups";



export type MasterEntityGroupFormPreset = {

  config: MasterGroupListConfig;

  topParentOptions: Array<{ id: string; name: string }>;

  /** Nested reserved groups under the top system branch (e.g. Staff under Loan & Liabilities). */
  nestedSystemGroupIds?: string[];

  legacyParentIds?: string[];

  collection: string;

  defaultBranch: string;

  entityLabel: string;

  systemGroupKind: "party" | "bank" | "staff" | "tax" | "item" | "expense";

  localIdPrefix: string;

  prefillEventName: string;

  branchSelectable?: boolean;

};



export const PARTY_ENTITY_GROUP_PRESET: MasterEntityGroupFormPreset = {

  config: PARTY_GROUP_LIST_CONFIG,

  topParentOptions: [...PARTY_SYSTEM_GROUP_OPTIONS],

  legacyParentIds: ["ungrouped_party"],

  collection: "groups",

  defaultBranch: "sundry_creditors",

  entityLabel: "Party Group",

  systemGroupKind: "party",

  localIdPrefix: "group",

  prefillEventName: "prefill-create-group-name",

  branchSelectable: true,

};



export const BANK_ENTITY_GROUP_PRESET: MasterEntityGroupFormPreset = {

  config: BANK_ACCOUNT_GROUP_LIST_CONFIG,

  topParentOptions: [

    { id: "bank_accounts_group", name: "Bank Accounts" },

    { id: "cash_in_hand_group", name: "Cash-in-Hand" },

  ],

  legacyParentIds: ["ungrouped_account"],

  collection: "account_groups",

  defaultBranch: "bank_accounts_group",

  entityLabel: "Account Group",

  systemGroupKind: "bank",

  localIdPrefix: "account_group",

  prefillEventName: "prefill-create-account-group-name",

  branchSelectable: true,

};



export const STAFF_ENTITY_GROUP_PRESET: MasterEntityGroupFormPreset = {

  config: STAFF_GROUP_LIST_CONFIG,

  topParentOptions: [{ id: LOAN_LIABILITY_GROUP_ID, name: "Loan & Liabilities" }],

  nestedSystemGroupIds: [STAFF_FORM_DEFAULT_ACCOUNT_TYPE_ID],

  legacyParentIds: ["ungrouped_staff", "liabilities", STAFF_FORM_DEFAULT_ACCOUNT_TYPE_ID],

  collection: "staff_groups",

  defaultBranch: LOAN_LIABILITY_GROUP_ID,

  entityLabel: "Staff Group",

  systemGroupKind: "staff",

  localIdPrefix: "staff_group",

  prefillEventName: "prefill-create-staff-group-name",

  branchSelectable: true,

};



export const TAX_ENTITY_GROUP_PRESET: MasterEntityGroupFormPreset = {

  config: TAX_GROUP_LIST_CONFIG,

  topParentOptions: [{ id: "duties_taxes", name: "Duties & Taxes" }],

  legacyParentIds: ["ungrouped_tax"],

  collection: "tax_groups",

  defaultBranch: "duties_taxes",

  entityLabel: "Tax Group",

  systemGroupKind: "tax",

  localIdPrefix: "tax_group",

  prefillEventName: "prefill-create-tax-group-name",

  branchSelectable: true,

};



export const ITEM_ENTITY_GROUP_PRESET: MasterEntityGroupFormPreset = {

  config: ITEM_GROUP_LIST_CONFIG,

  topParentOptions: [

    { id: "stock_items", name: "Stock Items" },

    { id: "services", name: "Services" },

  ],

  legacyParentIds: ["ungrouped_item"],

  collection: "item_groups",

  defaultBranch: "stock_items",

  entityLabel: "Item Group",

  systemGroupKind: "item",

  localIdPrefix: "item_group",

  prefillEventName: "prefill-create-item-group-name",

  branchSelectable: true,

};



export const EXPENSE_ENTITY_GROUP_PRESET: MasterEntityGroupFormPreset = {

  config: EXPENSE_GROUP_LIST_CONFIG,

  topParentOptions: [

    { id: "income", name: "Income" },

    { id: "expenses", name: "Expenses" },

  ],

  legacyParentIds: ["ungrouped_expense"],

  collection: "expense_groups",

  defaultBranch: "expenses",

  entityLabel: "Income & Expense Group",

  systemGroupKind: "expense",

  localIdPrefix: "expense_group",

  prefillEventName: "prefill-create-expense-group-name",

  branchSelectable: true,

};



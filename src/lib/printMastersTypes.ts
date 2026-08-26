import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";
/** Master categories available in the print-masters picker. */
export type MasterPrintKind =
  | "party"
  | "partyGroup"
  | "bankCash"
  | "bankCashGroup"
  | "staff"
  | "staffGroup"
  | "tax"
  | "taxGroup"
  | "item"
  | "itemGroup"
  | "expense"
  | "expenseGroup";

export const MASTER_PRINT_KIND_ORDER: MasterPrintKind[] = [
  "party",
  "partyGroup",
  "bankCash",
  "bankCashGroup",
  "staff",
  "staffGroup",
  "tax",
  "taxGroup",
  "item",
  "itemGroup",
  "expense",
  "expenseGroup",
];

export const MASTER_PRINT_KIND_LABELS: Record<MasterPrintKind, string> = {
  party: "Parties",
  partyGroup: "Party groups",
  bankCash: "Bank / Cash accounts",
  bankCashGroup: "Bank / Cash groups",
  staff: STAFF_ENTITY_LABEL,
  staffGroup: "Staff groups",
  tax: "Tax",
  taxGroup: "Tax groups",
  item: "Items",
  itemGroup: "Item groups",
  expense: "Income & expense accounts",
  expenseGroup: "Income & expense groups",
};

export type MasterPrintEntry = { name: string; balance: number };

export type MastersPrintSnapshot = Partial<Record<MasterPrintKind, MasterPrintEntry[]>>;

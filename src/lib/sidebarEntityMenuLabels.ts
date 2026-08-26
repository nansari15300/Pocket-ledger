import { STAFF_ENTITY_LABEL } from "@/lib/staffEntityDisplayName";

/** App sidebar primary nav labels — single source for entity display names. */
export const SIDEBAR_ENTITY_MENU_LABELS = {
  dashboard: "Dashboard",
  party: "Parties",
  bankCash: "Bank/Cash",
  staff: STAFF_ENTITY_LABEL,
  tax: "Tax",
  incomes: "Income & Expense",
  items: "Items & Service",
  reports: "Reports",
  gallery: "Gallery",
  gate: "Gate",
  production: "Production",
  saleNote: "Sale Note",
  purchaseNote: "Purchase Note",
  quotations: "Quotations",
} as const;

export type SidebarEntityMenuKey = keyof typeof SIDEBAR_ENTITY_MENU_LABELS;

export function sidebarEntityMenuLabel(key: SidebarEntityMenuKey): string {
  return SIDEBAR_ENTITY_MENU_LABELS[key];
}

/** Loan accounting tiles — map master collection kind → sidebar menu label. */
export function loanAccountingEntityMenuLabel(kind: "bank" | "staff" | "expense"): string {
  if (kind === "bank") return sidebarEntityMenuLabel("bankCash");
  if (kind === "staff") return sidebarEntityMenuLabel("staff");
  return sidebarEntityMenuLabel("incomes");
}

export type LoanAccountingBracketVariant = "bank" | "cash" | "loan" | "staff" | "income" | "expense";

/** Bracket suffix on loan accounting entity row — specific account subtype only. */
export function loanAccountingEntityTypeBracket(
  kind: "bank" | "staff" | "expense",
  variant?: LoanAccountingBracketVariant
): string | null {
  if (kind === "bank") {
    if (variant === "cash") return "Cash";
    if (variant === "bank") return "Bank";
    return null;
  }
  if (kind === "staff") {
    if (variant === "loan") return "Loan";
    if (variant === "staff") return "Staff";
    return null;
  }
  if (variant === "income") return "Income";
  if (variant === "expense") return "Expense";
  return null;
}

import type { QuotationAccountRow, QuotationFormTabId, QuotationMasterKind } from "./types";

export const QUOTATION_ALL_ACCOUNTS_LIST_ID = "__quotation_all__";

export const QUOTATION_COLLECTION = "quotations";

export const QUOTATION_FORM_TABS: { id: QuotationFormTabId; label: string; ready: boolean }[] = [
  { id: "letter", label: "Letter", ready: true },
  { id: "tab2", label: "Format 2", ready: false },
  { id: "tab3", label: "Format 3", ready: false },
  { id: "tab4", label: "Format 4", ready: false },
  { id: "tab5", label: "Format 5", ready: false },
];

export const QUOTATION_MASTER_KIND_LABEL: Record<QuotationMasterKind, string> = {
  party: "Party",
  bank: "Bank/Cash",
  staff: "Loan & Staff",
  tax: "Tax",
  expense: "Income & Expense",
  item: "Items & Service",
};

export const QUOTATION_FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 42, 48, 56] as const;

export const QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE = 42;
export const QUOTATION_DEFAULT_ADDRESS_FONT_SIZE = 14;
export const QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE = 11;
export const QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR = "#111111";

export const QUOTATION_DEFAULT_BODY_HTML = `<p>Dear Sir/Madam,</p><p></p><p>Please find our quotation below:</p>`;

export const QUOTATION_DEFAULT_PAGE_FLOW = "bottom" as const;

export const QUOTATION_TEXT_COLORS = [
  { label: "Black", value: "#111111" },
  { label: "Blue", value: "#1e4b8c" },
  { label: "Red", value: "#b91c1c" },
  { label: "Green", value: "#15803d" },
  { label: "Orange", value: "#c2410c" },
  { label: "Purple", value: "#7e22ce" },
] as const;

export function quotationAccountListId(kind: QuotationMasterKind, accountId: string): string {
  return `${kind}:${accountId}`;
}

export function quotationAllAccountsRow(quotationCount: number): QuotationAccountRow {
  return {
    id: QUOTATION_ALL_ACCOUNTS_LIST_ID,
    accountId: "",
    kind: "party",
    name: "All",
    quotationCount,
  };
}

export function isQuotationAllAccountsRow(row: QuotationAccountRow | null | undefined): boolean {
  return row?.id === QUOTATION_ALL_ACCOUNTS_LIST_ID;
}

export function parseQuotationAccountListId(
  id: string
): { kind: QuotationMasterKind; accountId: string } | null {
  const idx = id.indexOf(":");
  if (idx <= 0) return null;
  const kind = id.slice(0, idx) as QuotationMasterKind;
  const accountId = id.slice(idx + 1);
  if (!accountId) return null;
  if (!["party", "bank", "staff", "tax", "expense", "item"].includes(kind)) return null;
  return { kind, accountId };
}

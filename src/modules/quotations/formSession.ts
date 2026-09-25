import type { QuotationDraft } from "./types";

const storageKey = (companyId: string) => `pl.quotations.form.${companyId}`;

export type QuotationFormSession = {
  selectedId: string | null;
  draft: QuotationDraft;
};

export function writeQuotationFormSession(
  companyId: string | undefined,
  payload: { selectedId: string | null; draft: QuotationDraft | null }
) {
  if (typeof window === "undefined" || !companyId) return;
  try {
    if (!payload.draft) {
      sessionStorage.removeItem(storageKey(companyId));
      return;
    }
    sessionStorage.setItem(
      storageKey(companyId),
      JSON.stringify({ selectedId: payload.selectedId, draft: payload.draft } satisfies QuotationFormSession)
    );
  } catch {
    /* quota / private mode */
  }
}

export function readQuotationFormSession(companyId: string | undefined): QuotationFormSession | null {
  if (typeof window === "undefined" || !companyId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuotationFormSession;
    if (!parsed?.draft) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function quotationFormQtParam(draft: QuotationDraft | null): string | null {
  if (!draft) return null;
  return draft.id || "new";
}

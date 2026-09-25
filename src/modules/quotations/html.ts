export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(String(value || ""));
}

export function stripHtml(value: string): string {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function setEditableContent(el: HTMLElement, value: string) {
  const text = String(value || "");
  if (looksLikeHtml(text)) el.innerHTML = text;
  else el.textContent = text;
}

function fieldHtml(root: HTMLElement, name: string, fallback: string): string {
  const el = root.querySelector<HTMLElement>(`[data-q-field="${name}"]`);
  return el ? el.innerHTML : fallback;
}

export function snapshotQuotationDraftFromDom<T extends {
  recipientName: string;
  subject: string;
  bodyHtml: string;
  extraPagesHtml?: string[];
  letterhead: {
    panLabel: string;
    pan: string;
    phoneLabel: string;
    phone: string;
    companyName: string;
    address: string;
    companyNameFontSize: number;
    addressFontSize: number;
  };
}>(root: HTMLElement | null, draft: T): T {
  if (!root) return draft;
  const name = root.querySelector<HTMLElement>('[data-q-field="companyName"]');
  const address = root.querySelector<HTMLElement>('[data-q-field="address"]');
  const namePx = parseFloat(name?.style.fontSize || "");
  const addressPx = parseFloat(address?.style.fontSize || "");
  const extraEls = Array.from(root.querySelectorAll<HTMLElement>('[data-q-field="extra-body"]'));
  const extraGapEls = Array.from(root.querySelectorAll<HTMLElement>('[data-q-field="extra-gap"]'));
  const extraTailEls = Array.from(root.querySelectorAll<HTMLElement>('[data-q-field="extra-tail"]'));
  const prevExtras = draft.extraPagesHtml || [];
  const extraPagesHtml = extraEls.map((el, i) => el.innerHTML || prevExtras[i] || "");
  if (extraEls.length < prevExtras.length) {
    extraPagesHtml.push(...prevExtras.slice(extraEls.length));
  }
  const prev = draft as T & {
    gapHtml?: string;
    extraGapHtml?: string[];
    tailHtml?: string;
    extraTailHtml?: string[];
  };
  return {
    ...draft,
    recipientName: fieldHtml(root, "recipientName", draft.recipientName),
    subject: fieldHtml(root, "subject", draft.subject),
    bodyHtml: fieldHtml(root, "body", draft.bodyHtml),
    extraPagesHtml,
    gapHtml: fieldHtml(root, "gap", prev.gapHtml || ""),
    extraGapHtml: extraGapEls.map((el, i) => el.innerHTML || prev.extraGapHtml?.[i] || ""),
    tailHtml: fieldHtml(root, "tail", prev.tailHtml || ""),
    extraTailHtml: extraTailEls.map((el, i) => el.innerHTML || prev.extraTailHtml?.[i] || ""),
    letterhead: {
      ...draft.letterhead,
      panLabel: draft.letterhead.panLabel,
      pan: fieldHtml(root, "pan", draft.letterhead.pan),
      phoneLabel: draft.letterhead.phoneLabel,
      phone: fieldHtml(root, "phone", draft.letterhead.phone),
      companyName: fieldHtml(root, "companyName", draft.letterhead.companyName),
      address: fieldHtml(root, "address", draft.letterhead.address),
      companyNameFontSize: Number.isFinite(namePx) && namePx > 0 ? namePx : draft.letterhead.companyNameFontSize,
      addressFontSize: Number.isFinite(addressPx) && addressPx > 0 ? addressPx : draft.letterhead.addressFontSize,
    },
  };
}

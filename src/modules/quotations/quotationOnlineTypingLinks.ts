import { clientRandomUUID } from "@/lib/clientRandomUUID";

/** External Unicode typing helpers (open in browser; copy → paste into quotation letter). */

export const ADD_NEW_TYPING_ADDRESS_ID = "__add-new-typing-address__";

export type QuotationOnlineTypingLink = {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  hint: string;
  /** Google and many sites block iframe embed (403) — open in a normal browser tab instead. */
  openInBrowserOnly?: boolean;
};

export const QUOTATION_ONLINE_TYPING_LINKS: QuotationOnlineTypingLink[] = [
  {
    id: "nepali-typenepali",
    label: "Type Nepali",
    shortLabel: "Nepali",
    href: "https://www.typenepali.com/",
    hint: "Type Nepali online, then copy and paste into the letter.",
  },
  {
    id: "hindi-easyhindi",
    label: "Easy Hindi Typing",
    shortLabel: "Hindi",
    href: "https://www.easyhindityping.com/",
    hint: "Type Hindi online, then copy and paste into the letter.",
  },
  {
    id: "hindi-google-input",
    label: "Google Input Tools",
    shortLabel: "Hindi (Google)",
    href: "https://www.google.com/inputtools/try/",
    hint: "Try Hindi (or other languages) in the browser, then copy and paste.",
  },
  {
    id: "google-fonts",
    label: "Google Fonts",
    shortLabel: "Fonts",
    href: "https://fonts.google.com/",
    hint: "Browse fonts on fonts.google.com, then copy into the letter.",
    openInBrowserOnly: true,
  },
  {
    id: "google-translate",
    label: "Google Translate",
    shortLabel: "Translate",
    href: "https://translate.google.com/",
    hint: "Paste on the left; translation on the right — copy into the letter.",
    openInBrowserOnly: true,
  },
];

export function quotationTypingLinkAllowsIframe(link: QuotationOnlineTypingLink): boolean {
  return !link.openInBrowserOnly;
}

/** Default site when opening the quotation letter side typing panel from the toolbar. */
export const DEFAULT_QUOTATION_SIDE_TYPING_LINK_ID = "hindi-google-input";

export function openQuotationOnlineTypingLink(link: QuotationOnlineTypingLink): void {
  if (typeof window === "undefined") return;
  window.open(link.href, "_blank", "noopener,noreferrer");
}

const CUSTOM_TYPING_LINKS_KEY = "pl-quotation-custom-typing-links";

export type CustomTypingLink = {
  id: string;
  label: string;
  href: string;
};

function normalizeTypingUrl(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function readCustomTypingLinks(): CustomTypingLink[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_TYPING_LINKS_KEY) || "[]") as CustomTypingLink[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && row.id && row.href);
  } catch {
    return [];
  }
}

export function addCustomTypingLink(label: string, href: string): CustomTypingLink | null {
  const url = normalizeTypingUrl(href);
  if (!url) return null;
  const name = String(label || "").trim() || url;
  const entry: CustomTypingLink = { id: `custom-${clientRandomUUID()}`, label: name, href: url };
  const next = [...readCustomTypingLinks(), entry];
  try {
    window.localStorage.setItem(CUSTOM_TYPING_LINKS_KEY, JSON.stringify(next));
  } catch {
    return null;
  }
  return entry;
}

export function listQuotationTypingLinksForUi(): QuotationOnlineTypingLink[] {
  const custom = readCustomTypingLinks().map((row) => ({
    id: row.id,
    label: row.label,
    shortLabel: row.label,
    href: row.href,
    hint: "Custom typing site — copy text into the letter.",
  }));
  return [...QUOTATION_ONLINE_TYPING_LINKS, ...custom];
}

export function resolveQuotationTypingLink(linkId: string): QuotationOnlineTypingLink {
  return listQuotationTypingLinksForUi().find((row) => row.id === linkId) || QUOTATION_ONLINE_TYPING_LINKS[0];
}

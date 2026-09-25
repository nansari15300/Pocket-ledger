import {
  QUOTATION_DEFAULT_ADDRESS_FONT_SIZE,
  QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE,
} from "./constants";
import type { QuotationLetterhead, QuotationLetterLang, QuotationPanLabelKind, QuotationPhoneLabelKind } from "./types";

type CompanyLetterSource = {
  name?: string;
  pan?: string;
  phone?: string;
  address?: string;
  logoUrl?: string | null;
  country?: string;
} | null | undefined;

export function letterLangFromCountry(country?: string | null): QuotationLetterLang {
  const c = String(country || "").trim().toLowerCase();
  if (!c || c === "nepal") return "ne";
  if (c === "india" || c === "भारत") return "hi";
  return "en";
}

export function asQuotationLetterLang(raw: string | null | undefined): QuotationLetterLang {
  const v = String(raw || "");
  if (v === "ne" || v === "hi") return v;
  return "en";
}

export const QT_NO_LABELS: Record<QuotationLetterLang, string> = {
  en: "QT No.",
  ne: "पत्र संख्या",
  hi: "कोटेशन संख्या",
};

export const SUBJECT_LABELS: Record<QuotationLetterLang, string> = {
  en: "Subject",
  ne: "विषय",
  hi: "विषय",
};

export const DATE_LABELS: Record<QuotationLetterLang, string> = {
  en: "Date",
  ne: "मिति",
  hi: "दिनांक",
};

export const PHONE_LABELS: Record<QuotationLetterLang, string> = {
  en: "Mo. No.",
  ne: "मो. नं.",
  hi: "मो. नं.",
};

export type QuotationPhoneLabelOption = {
  id: string;
  lang: QuotationLetterLang;
  kind: QuotationPhoneLabelKind;
  label: string;
  name: string;
};

export const PHONE_LABEL_OPTIONS: QuotationPhoneLabelOption[] = [
  { id: "en-short", lang: "en", kind: "short", label: "Mo. No.", name: "English" },
  { id: "en-mid", lang: "en", kind: "mid", label: "Mobile No.", name: "English" },
  { id: "en-full", lang: "en", kind: "full", label: "Mobile Number", name: "English" },
  { id: "ne-short", lang: "ne", kind: "short", label: "मो. नं.", name: "नेपाली" },
  { id: "ne-mid", lang: "ne", kind: "mid", label: "मोबाइल नं.", name: "नेपाली" },
  { id: "ne-full", lang: "ne", kind: "full", label: "मोबाइल नम्बर", name: "नेपाली" },
  { id: "hi-short", lang: "hi", kind: "short", label: "मो. नं.", name: "हिन्दी" },
  { id: "hi-mid", lang: "hi", kind: "mid", label: "मोबाइल नं.", name: "हिन्दी" },
  { id: "hi-full", lang: "hi", kind: "full", label: "मोबाइल नंबर", name: "हिन्दी" },
];

export function findPhoneLabelOption(
  lang?: QuotationLetterLang | null,
  kind?: QuotationPhoneLabelKind | null
): QuotationPhoneLabelOption | undefined {
  if (!lang || !kind) return undefined;
  return PHONE_LABEL_OPTIONS.find((row) => row.lang === lang && row.kind === kind);
}

export function defaultPhoneLabelOption(country?: string | null): QuotationPhoneLabelOption {
  const lang = letterLangFromCountry(country);
  return findPhoneLabelOption(lang, "short") || PHONE_LABEL_OPTIONS[0];
}

export function phoneLabelOptionsForCountry(country?: string | null): QuotationPhoneLabelOption[] {
  const lang = letterLangFromCountry(country);
  const deya: QuotationLetterLang = lang === "hi" ? "hi" : "ne";
  const pick = (kind: QuotationPhoneLabelKind, rowLang: QuotationLetterLang) =>
    PHONE_LABEL_OPTIONS.find((row) => row.kind === kind && row.lang === rowLang);
  return [pick("short", "en"), pick("short", deya), pick("mid", "en"), pick("mid", deya), pick("full", "en"), pick("full", deya)].filter(
    (row): row is QuotationPhoneLabelOption => !!row
  );
}

export function resolvePhoneLabelOption(
  lang?: QuotationLetterLang | null,
  kind?: QuotationPhoneLabelKind | null,
  storedLabel?: string | null,
  country?: string | null
): QuotationPhoneLabelOption {
  const exact = findPhoneLabelOption(lang, kind);
  if (exact) return exact;
  const label = String(storedLabel || "")
    .replace(/:$/, "")
    .trim();
  if (label) {
    const fromCountry = letterLangFromCountry(country);
    const byLabel = phoneLabelOptionsForCountry(country).find((row) => row.label === label)
      || PHONE_LABEL_OPTIONS.find((row) => row.label === label);
    if (byLabel) {
      if (byLabel.lang === "hi" && fromCountry === "ne") {
        return findPhoneLabelOption("ne", byLabel.kind) || byLabel;
      }
      if (byLabel.lang === "ne" && fromCountry === "hi") {
        return findPhoneLabelOption("hi", byLabel.kind) || byLabel;
      }
      return byLabel;
    }
    const lower = label.toLowerCase();
    const deyaLang: QuotationLetterLang = fromCountry === "en" ? "ne" : fromCountry;
    if (/mobile number|नम्बर|नंबर/i.test(lower + label)) {
      return findPhoneLabelOption(fromCountry === "en" ? "en" : deyaLang, "full") || defaultPhoneLabelOption(country);
    }
    if (/mobile no\.?|मोबाइल नं/i.test(lower + label)) {
      return findPhoneLabelOption(fromCountry === "en" ? "en" : deyaLang, "mid") || defaultPhoneLabelOption(country);
    }
    if (lower.includes("phone") || /^mo\.?\s*no/i.test(lower) || label.includes("मो")) {
      return findPhoneLabelOption(fromCountry, "short") || defaultPhoneLabelOption(country);
    }
  }
  return defaultPhoneLabelOption(country);
}

export type QuotationPanLabelOption = {
  id: string;
  lang: QuotationLetterLang;
  kind: QuotationPanLabelKind;
  label: string;
  name: string;
};

export const PAN_LABEL_OPTIONS: QuotationPanLabelOption[] = [
  { id: "en-vat", lang: "en", kind: "vat", label: "VAT No.", name: "English" },
  { id: "en-gstin", lang: "en", kind: "gstin", label: "GSTIN No.", name: "English" },
  { id: "en-pan", lang: "en", kind: "pan", label: "PAN No.", name: "English" },
  { id: "ne-vat", lang: "ne", kind: "vat", label: "भ्याट नं.", name: "नेपाली" },
  { id: "ne-pan", lang: "ne", kind: "pan", label: "प्यान नं.", name: "नेपाली" },
  { id: "hi-gstin", lang: "hi", kind: "gstin", label: "GSTIN No.", name: "हिन्दी" },
  { id: "hi-pan", lang: "hi", kind: "pan", label: "PAN No.", name: "हिन्दी" },
  { id: "hi-vat", lang: "hi", kind: "vat", label: "VAT No.", name: "हिन्दी" },
];

export function panLabelOptionId(lang: QuotationLetterLang, kind: QuotationPanLabelKind): string {
  return `${lang}-${kind}`;
}

export function findPanLabelOption(
  lang?: QuotationLetterLang | null,
  kind?: QuotationPanLabelKind | null
): QuotationPanLabelOption | undefined {
  if (!lang || !kind) return undefined;
  return PAN_LABEL_OPTIONS.find((row) => row.lang === lang && row.kind === kind);
}

export function defaultPanLabelOption(country?: string | null): QuotationPanLabelOption {
  const lang = letterLangFromCountry(country);
  if (lang === "ne") return findPanLabelOption("ne", "vat")!;
  if (lang === "hi") return findPanLabelOption("hi", "gstin")!;
  return findPanLabelOption("en", "pan")!;
}

export function resolvePanLabelOption(
  lang?: QuotationLetterLang | null,
  kind?: QuotationPanLabelKind | null,
  storedLabel?: string | null,
  country?: string | null
): QuotationPanLabelOption {
  if (lang === "ne" && kind === "gstin") {
    return findPanLabelOption("ne", "vat")!;
  }
  const exact = findPanLabelOption(lang, kind);
  if (exact) return exact;
  const label = String(storedLabel || "")
    .replace(/:$/, "")
    .trim();
  if (label) {
    const byLabel = PAN_LABEL_OPTIONS.find((row) => row.label === label);
    if (byLabel) return byLabel;
    const lower = label.toLowerCase();
    const fromCountry = letterLangFromCountry(country);
    if (lower.includes("gstin") || label.includes("जीएसटी")) {
      return findPanLabelOption(fromCountry, "gstin") || defaultPanLabelOption(country);
    }
    if (lower.includes("pan") || label.includes("पैन") || label.includes("प्यान") || label === "PAN") {
      return findPanLabelOption(fromCountry, "pan") || defaultPanLabelOption(country);
    }
    if (lower.includes("vat") || label.includes("भ्याट") || label.includes("वैट")) {
      return findPanLabelOption(fromCountry, "vat") || defaultPanLabelOption(country);
    }
  }
  return defaultPanLabelOption(country);
}

export function resolvePhoneLabelLang(
  lang?: QuotationLetterLang | null,
  storedLabel?: string | null,
  country?: string | null
): QuotationLetterLang {
  if (lang === "en" || lang === "ne" || lang === "hi") return lang;
  const s = String(storedLabel || "")
    .replace(/:$/, "")
    .trim();
  if (s === PHONE_LABELS.en || s === "Phone" || /^mo\.?\s*no/i.test(s)) return "en";
  if (s === PHONE_LABELS.ne || s.includes("मो")) {
    const fromCountry = letterLangFromCountry(country);
    return fromCountry === "hi" ? "hi" : "ne";
  }
  return letterLangFromCountry(country);
}

export const LETTER_LANG_OPTIONS: { id: QuotationLetterLang; name: string }[] = [
  { id: "en", name: "English" },
  { id: "ne", name: "नेपाली" },
  { id: "hi", name: "हिन्दी" },
];

export function isNepalCompany(company: CompanyLetterSource): boolean {
  return !company?.country || company.country === "Nepal";
}

export function letterheadFromCompany(company: CompanyLetterSource): QuotationLetterhead {
  const pan = defaultPanLabelOption(company?.country);
  const phone = defaultPhoneLabelOption(company?.country);
  return {
    panLabel: pan.label,
    pan: String(company?.pan || "").trim(),
    phoneLabel: phone.label,
    phone: String(company?.phone || "").trim(),
    companyName: String(company?.name || "").trim(),
    address: String(company?.address || "").trim(),
    logoUrl: company?.logoUrl ? String(company.logoUrl) : null,
    companyNameFontSize: QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE,
    addressFontSize: QUOTATION_DEFAULT_ADDRESS_FONT_SIZE,
  };
}

export function defaultQuotationSubject(company: CompanyLetterSource): string {
  return isNepalCompany(company) ? "कोटेशन सम्बन्धमा" : "Quotation";
}

export function defaultRecipientName(accountName: string, company: CompanyLetterSource): string {
  const name = String(accountName || "").trim();
  if (!name) return "";
  if (isNepalCompany(company) && !/^श्री\s/.test(name)) return `श्री ${name}`;
  return name;
}

export function dateFieldLabel(company: CompanyLetterSource): string {
  return DATE_LABELS[letterLangFromCountry(company?.country)];
}

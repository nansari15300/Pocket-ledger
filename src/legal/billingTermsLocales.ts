import type { BillingTermsDoc } from "./billingTermsEn";
import { BILLING_TERMS_EN } from "./billingTermsEn";
import { BILLING_TERMS_NE } from "./billingTermsNe";
import { BILLING_TERMS_HI } from "./billingTermsHi";

/** Terms page: tab keys match UI labels (English / Nepali / Hindi bodies). */
export type TermsLocale = "en" | "ne" | "hi";

export const BILLING_TERMS_BY_LOCALE: Record<TermsLocale, BillingTermsDoc> = {
  en: BILLING_TERMS_EN,
  ne: BILLING_TERMS_NE,
  hi: BILLING_TERMS_HI,
};

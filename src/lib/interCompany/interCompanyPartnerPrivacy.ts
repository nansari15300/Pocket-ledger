/**
 * Join tab — partner search / view privacy (localStorage per company).
 */
import {
  readInterCompanyLocalSettings,
  type InterCompanyLocalSettings,
} from "@/lib/interCompany/interCompanyLocalStore";

/** Partner search / view field keys */
export type InterCompanyPartnerFieldKey =
  | "accountName"
  | "mobileNo"
  | "panNo"
  | "pocketLedgerAcNo";

export type InterCompanyPartnerFieldFlags = Record<InterCompanyPartnerFieldKey, boolean>;

export const IC_PARTNER_FIELD_LABELS: Record<InterCompanyPartnerFieldKey, string> = {
  accountName: "Account name",
  mobileNo: "Mobile no.",
  panNo: "PAN no.",
  pocketLedgerAcNo: "Pocket ledger A/C no.",
};

export const IC_PARTNER_FIELD_ORDER: InterCompanyPartnerFieldKey[] = [
  "accountName",
  "mobileNo",
  "panNo",
  "pocketLedgerAcNo",
];

export const DEFAULT_PARTNER_SEARCH_BY: InterCompanyPartnerFieldFlags = {
  accountName: true,
  mobileNo: true,
  panNo: false,
  /** Search me band — UI disabled; partners is field se lookup nahi kar sakte */
  pocketLedgerAcNo: false,
};

/** Search-by me kabhi ON nahi — legacy saved settings bhi force off */
export const PARTNER_SEARCH_DISABLED_FIELDS: ReadonlySet<InterCompanyPartnerFieldKey> = new Set([
  "pocketLedgerAcNo",
]);

/** View me bhi band — UI disabled; A/c No form par hamesha poora dikhe (mask nahi) */
export const PARTNER_VIEW_DISABLED_FIELDS: ReadonlySet<InterCompanyPartnerFieldKey> = new Set([
  "pocketLedgerAcNo",
]);

export const DEFAULT_PARTNER_VIEW_FIELDS: InterCompanyPartnerFieldFlags = {
  accountName: true,
  mobileNo: true,
  panNo: true,
  pocketLedgerAcNo: false,
};

/** Global mask ON = middle hidden in partner view */
export const DEFAULT_PARTNER_MASK_IN_VIEW = true;

export function normalizePartnerFieldFlags(
  raw: Partial<InterCompanyPartnerFieldFlags> | undefined,
  fallback: InterCompanyPartnerFieldFlags
): InterCompanyPartnerFieldFlags {
  const out = { ...fallback };
  if (!raw) return out;
  for (const key of IC_PARTNER_FIELD_ORDER) {
    if (typeof raw[key] === "boolean") out[key] = raw[key]!;
  }
  return out;
}

/** Partner search flags — disabled fields hamesha off */
export function normalizePartnerSearchBy(
  raw: Partial<InterCompanyPartnerFieldFlags> | undefined
): InterCompanyPartnerFieldFlags {
  const out = normalizePartnerFieldFlags(raw, DEFAULT_PARTNER_SEARCH_BY);
  for (const key of PARTNER_SEARCH_DISABLED_FIELDS) {
    out[key] = false;
  }
  return out;
}

/** Partner view flags — disabled fields hamesha off */
export function normalizePartnerViewFields(
  raw: Partial<InterCompanyPartnerFieldFlags> | undefined
): InterCompanyPartnerFieldFlags {
  const out = normalizePartnerFieldFlags(raw, DEFAULT_PARTNER_VIEW_FIELDS);
  for (const key of PARTNER_VIEW_DISABLED_FIELDS) {
    out[key] = false;
  }
  return out;
}

/** Ek token — left 3 + beech x + right 3 (PAN / phone / naam ke har shabd par) */
function maskInterCompanyPartnerToken(token: string): string {
  const len = token.length;
  if (len <= 3) return "x".repeat(len);
  if (len <= 6) return `${"x".repeat(len - 3)}${token.slice(-3)}`;
  return `${token.slice(0, 3)}${"x".repeat(len - 6)}${token.slice(-3)}`;
}

/** Partner view — mask ON par left/right 3 char dikhe, beech x; OFF par poora text */
export function maskInterCompanyPartnerValue(raw: string, mask: boolean): string {
  const v = String(raw ?? "").trim();
  if (!v || !mask) return v;
  return v.replace(/\S+/g, (token) => maskInterCompanyPartnerToken(token));
}

export type InterCompanyPartnerPrivacy = {
  searchBy: InterCompanyPartnerFieldFlags;
  viewFields: InterCompanyPartnerFieldFlags;
  maskInView: boolean;
};

export function readInterCompanyPartnerPrivacy(companyId: string): InterCompanyPartnerPrivacy {
  const s = readInterCompanyLocalSettings(companyId);
  return {
    searchBy: s.partnerSearchBy,
    viewFields: s.partnerViewFields,
    maskInView: s.partnerMaskInView,
  };
}

/** Detail card — field dikhe + mask apply (A/c No hamesha poora — mask skip) */
export function formatInterCompanyFieldForPartnerView(
  privacy: InterCompanyPartnerPrivacy,
  field: InterCompanyPartnerFieldKey,
  raw: string | null | undefined
): string | null {
  if (!privacy.viewFields[field]) return null;
  const v = String(raw ?? "").trim();
  if (!v) return null;
  // Inter Co. / pocket ledger A/c — partners ko poora number dikhe, mask mat lagao
  if (field === "pocketLedgerAcNo") return v;
  return maskInterCompanyPartnerValue(v, privacy.maskInView);
}

/** Legacy name lookup helper */
export function canPartnersSearchTargetAccountsByName(targetCompanyId: string): boolean {
  if (!targetCompanyId) return true;
  return readInterCompanyLocalSettings(targetCompanyId).partnerSearchBy.accountName;
}

export function migrateLegacySearchByName(settings: Partial<InterCompanyLocalSettings>): void {
  if (settings.partnerSearchBy) return;
  const legacy = settings.searchTargetAccountByNameFromSource;
  settings.partnerSearchBy = {
    ...DEFAULT_PARTNER_SEARCH_BY,
    accountName: legacy ?? DEFAULT_PARTNER_SEARCH_BY.accountName,
  };
  settings.partnerViewFields = settings.partnerViewFields ?? { ...DEFAULT_PARTNER_VIEW_FIELDS };
  settings.partnerMaskInView = settings.partnerMaskInView ?? DEFAULT_PARTNER_MASK_IN_VIEW;
}

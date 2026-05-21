/**
 * Inter-company preview settings / invites — localStorage (backend baad me).
 */
import {
  DEFAULT_PARTNER_MASK_IN_VIEW,
  DEFAULT_PARTNER_SEARCH_BY,
  DEFAULT_PARTNER_VIEW_FIELDS,
  migrateLegacySearchByName,
  normalizePartnerFieldFlags,
  normalizePartnerSearchBy,
  normalizePartnerViewFields,
  type InterCompanyPartnerFieldFlags,
} from "@/lib/interCompany/interCompanyPartnerPrivacy";

export type { InterCompanyPartnerFieldFlags, InterCompanyPartnerFieldKey } from "@/lib/interCompany/interCompanyPartnerPrivacy";
export { canPartnersSearchTargetAccountsByName } from "@/lib/interCompany/interCompanyPartnerPrivacy";

export type InterCompanyPartnerDisplayMode = "name_and_ac" | "ac_only";

export type InterCompanyLocalSettings = {
  /** Join tab: inter-company invite/txn alerts */
  notificationsEnabled: boolean;
  /** Joined partner company ids (tick list) */
  joinedCompanyIds: string[];
  /** Accepted joins — disconnect block (txn sync); Invite accept / Firestore accepted se bharte hain */
  permanentJoinedCompanyIds: string[];
  /** Partner list label — fixed: name + A/c No */
  partnerDisplayMode: InterCompanyPartnerDisplayMode;
  /** @deprecated — use partnerSearchBy.accountName */
  searchTargetAccountByNameFromSource?: boolean;
  /** How other companies find your accounts */
  partnerSearchBy: InterCompanyPartnerFieldFlags;
  /** What other companies can see in account view */
  partnerViewFields: InterCompanyPartnerFieldFlags;
  /** ON = mask middle in partner view; OFF = show full text */
  partnerMaskInView: boolean;
};

export type InterCompanyPendingInvite = {
  id: string;
  targetLoginOrEmail: string;
  createdAt: number;
  /** Firestore inter_company_invites status — pending = target Join par accept karega */
  status: "pending" | "sent" | "accepted" | "declined";
  message?: string;
};

const SETTINGS_KEY = (companyId: string) => `pl-inter-company-settings::${companyId}`;
const INVITES_KEY = (companyId: string) => `pl-inter-company-invites::${companyId}`;

const DEFAULT_SETTINGS: InterCompanyLocalSettings = {
  notificationsEnabled: true,
  joinedCompanyIds: [],
  permanentJoinedCompanyIds: [],
  partnerDisplayMode: "name_and_ac",
  partnerSearchBy: { ...DEFAULT_PARTNER_SEARCH_BY },
  partnerViewFields: { ...DEFAULT_PARTNER_VIEW_FIELDS },
  partnerMaskInView: DEFAULT_PARTNER_MASK_IN_VIEW,
};

/** Cross-company search — sirf joined partners (empty = all partners) */
export function filterPartnersByJoined<T extends { id: string }>(
  partners: T[],
  joinedCompanyIds: string[]
): T[] {
  if (!joinedCompanyIds.length) return partners;
  const allowed = new Set(joinedCompanyIds);
  return partners.filter((p) => allowed.has(p.id));
}

export function readInterCompanyLocalSettings(companyId: string): InterCompanyLocalSettings {
  if (typeof window === "undefined" || !companyId) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY(companyId));
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<InterCompanyLocalSettings>;
    migrateLegacySearchByName(parsed);
    return {
      notificationsEnabled: parsed.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled,
      joinedCompanyIds: Array.isArray(parsed.joinedCompanyIds)
        ? parsed.joinedCompanyIds.filter((x) => typeof x === "string")
        : [],
      permanentJoinedCompanyIds: Array.isArray(parsed.permanentJoinedCompanyIds)
        ? parsed.permanentJoinedCompanyIds.filter((x) => typeof x === "string")
        : [],
      partnerDisplayMode:
        parsed.partnerDisplayMode === "ac_only" ? "ac_only" : "name_and_ac",
      partnerSearchBy: normalizePartnerSearchBy(parsed.partnerSearchBy),
      partnerViewFields: normalizePartnerViewFields(parsed.partnerViewFields),
      partnerMaskInView: parsed.partnerMaskInView ?? DEFAULT_SETTINGS.partnerMaskInView,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeInterCompanyLocalSettings(
  companyId: string,
  settings: InterCompanyLocalSettings
): void {
  if (typeof window === "undefined" || !companyId) return;
  localStorage.setItem(SETTINGS_KEY(companyId), JSON.stringify(settings));
}

export function readInterCompanyPendingInvites(companyId: string): InterCompanyPendingInvite[] {
  if (typeof window === "undefined" || !companyId) return [];
  try {
    const raw = localStorage.getItem(INVITES_KEY(companyId));
    if (!raw) return [];
    const list = JSON.parse(raw) as InterCompanyPendingInvite[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function appendInterCompanyPendingInvite(
  companyId: string,
  invite: InterCompanyPendingInvite
): void {
  if (typeof window === "undefined" || !companyId) return;
  const prev = readInterCompanyPendingInvites(companyId);
  localStorage.setItem(INVITES_KEY(companyId), JSON.stringify([invite, ...prev].slice(0, 50)));
}

/** Send again / status update — same invite id ya email par row replace */
export function upsertInterCompanyPendingInvite(
  companyId: string,
  invite: InterCompanyPendingInvite
): void {
  if (typeof window === "undefined" || !companyId) return;
  const prev = readInterCompanyPendingInvites(companyId);
  const key = invite.targetLoginOrEmail.trim().toLowerCase();
  const next = [
    invite,
    ...prev.filter(
      (r) => r.id !== invite.id && r.targetLoginOrEmail.trim().toLowerCase() !== key
    ),
  ].slice(0, 50);
  localStorage.setItem(INVITES_KEY(companyId), JSON.stringify(next));
}

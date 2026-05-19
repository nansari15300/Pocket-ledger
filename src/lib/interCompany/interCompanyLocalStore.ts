/**
 * Inter-company preview settings / invites — localStorage (backend baad me).
 */

export type InterCompanyPartnerDisplayMode = "name_and_ac" | "ac_only";

export type InterCompanyLocalSettings = {
  /** Join tab: inter-company invite/txn alerts */
  notificationsEnabled: boolean;
  /** Joined partner company ids (tick list) */
  joinedCompanyIds: string[];
  /** Partner list label — fixed: name + A/c No */
  partnerDisplayMode: InterCompanyPartnerDisplayMode;
  /**
   * Privacy (this company = target): partners may browse account name list.
   * false = others must use Inter Co. A/c No or mobile only.
   */
  searchTargetAccountByNameFromSource: boolean;
};

export type InterCompanyPendingInvite = {
  id: string;
  targetLoginOrEmail: string;
  createdAt: number;
  status: "pending" | "sent";
  message?: string;
};

const SETTINGS_KEY = (companyId: string) => `pl-inter-company-settings::${companyId}`;
const INVITES_KEY = (companyId: string) => `pl-inter-company-invites::${companyId}`;

const DEFAULT_SETTINGS: InterCompanyLocalSettings = {
  notificationsEnabled: true,
  joinedCompanyIds: [],
  partnerDisplayMode: "name_and_ac",
  searchTargetAccountByNameFromSource: true,
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

/** Target company ki privacy — partner name list dikha sakta hai ya nahi */
export function canPartnersSearchTargetAccountsByName(targetCompanyId: string): boolean {
  if (!targetCompanyId) return true;
  return readInterCompanyLocalSettings(targetCompanyId).searchTargetAccountByNameFromSource;
}

export function readInterCompanyLocalSettings(companyId: string): InterCompanyLocalSettings {
  if (typeof window === "undefined" || !companyId) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY(companyId));
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<InterCompanyLocalSettings>;
    return {
      notificationsEnabled: parsed.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled,
      joinedCompanyIds: Array.isArray(parsed.joinedCompanyIds)
        ? parsed.joinedCompanyIds.filter((x) => typeof x === "string")
        : [],
      partnerDisplayMode:
        parsed.partnerDisplayMode === "ac_only" ? "ac_only" : "name_and_ac",
      searchTargetAccountByNameFromSource:
        parsed.searchTargetAccountByNameFromSource ??
        DEFAULT_SETTINGS.searchTargetAccountByNameFromSource,
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

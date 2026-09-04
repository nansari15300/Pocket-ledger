export type MasterAccountContactTier = "none" | "one" | "both";

export type MasterAccountContactChannel = "phone" | "email";

export type MasterAccountContactOption = {
  id: MasterAccountContactChannel;
  label: string;
  value: string;
};

export function hasNonEmptyContactField(value?: string | null): boolean {
  return Boolean(String(value ?? "").trim());
}

export function listMasterAccountContactOptions(entity: {
  phone?: string | null;
  email?: string | null;
  whatsapp?: boolean;
}): MasterAccountContactOption[] {
  const options: MasterAccountContactOption[] = [];
  const phone = String(entity.phone ?? "").trim();
  const email = String(entity.email ?? "").trim();
  if (phone) options.push({ id: "phone", label: entity.whatsapp === true ? "WhatsApp" : "Phone", value: phone });
  if (email) options.push({ id: "email", label: "Email", value: email });
  return options;
}

export function getMasterAccountContactTier(entity: {
  phone?: string | null;
  email?: string | null;
}): MasterAccountContactTier {
  const hasPhone = hasNonEmptyContactField(entity.phone);
  const hasEmail = hasNonEmptyContactField(entity.email);
  if (hasPhone && hasEmail) return "both";
  if (hasPhone || hasEmail) return "one";
  return "none";
}

export const MASTER_ACCOUNT_CONTACT_TIER_PILL_CN: Record<MasterAccountContactTier, string> = {
  none: "border-red-400 bg-red-50 text-red-800 hover:bg-red-50 hover:text-red-800",
  one: "border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 hover:text-blue-900",
  both: "border-green-500 bg-green-50 text-green-800 hover:bg-green-100 hover:text-green-900",
};

export function masterAccountContactTierTitle(
  tier: MasterAccountContactTier,
  actionLabel: string
): string {
  if (tier === "none") return "No phone or email — add contact to send";
  if (tier === "one") return `${actionLabel} (one contact on file)`;
  return `${actionLabel} (phone and email on file)`;
}

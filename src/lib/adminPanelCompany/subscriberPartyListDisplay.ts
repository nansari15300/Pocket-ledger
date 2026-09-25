import type { Party } from "@/components/party/types";

const SUBSCRIBER_UID_NAME_RE = /^Subscriber\s+[A-Za-z0-9_-]{6,}$/i;

export function formatDisplayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "";
  return local
    .replace(/[._+-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Avoid UUID-style "Subscriber abc123…" in list + details chrome. */
export function isSubscriberPartyRow(party: { id?: string; type?: string }): boolean {
  const t = String((party as { type?: string }).type ?? "").toLowerCase();
  return t === "subscriber" || String(party.id ?? "").startsWith("subscriber-");
}

export function resolveSubscriberPartyNameForMirror(input: {
  userName?: string | null;
  userEmail?: string | null;
  customerCompanyName?: string | null;
}): string {
  const userName = (input.userName || "").trim();
  if (userName) return userName;
  const email = (input.userEmail || "").trim();
  if (email) {
    const fromEmail = formatDisplayNameFromEmail(email);
    if (fromEmail) return fromEmail;
  }
  const company = (input.customerCompanyName || "").trim();
  if (company) return company;
  return "Subscriber";
}

export function resolveSubscriberPartyDisplayName(party: Pick<Party, "name" | "email">): string {
  const raw = String(party.name ?? "").trim();
  const email = String(party.email ?? "").trim();
  if (raw && !SUBSCRIBER_UID_NAME_RE.test(raw)) return raw;
  const fromEmail = email ? formatDisplayNameFromEmail(email) : "";
  if (fromEmail) return fromEmail;
  if (raw && !SUBSCRIBER_UID_NAME_RE.test(raw)) return raw;
  return "Subscriber";
}

export function subscriberPartyListTitleLines(
  party: Party
): { primary: string; secondary?: string | null } {
  const email = String(party.email ?? "").trim();
  return {
    primary: resolveSubscriberPartyDisplayName(party),
    secondary: email || null,
  };
}

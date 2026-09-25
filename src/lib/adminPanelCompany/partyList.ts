import type { Party } from "@/components/party/types";
import { isAdminPanelCompanyLocalId } from "@/lib/adminPanelCompany/ledgerMode";

export type PartyListTab =
  | "parties"
  | "groups"
  | "ic_ac"
  | "subscribers"
  | "agents";

export function isAdminPanelPartyPage(companyId: string | null | undefined): boolean {
  return isAdminPanelCompanyLocalId(companyId);
}

export function filterSubscriberParties(parties: Party[]): Party[] {
  return parties.filter((p) => {
    const t = String((p as Party & { type?: string }).type ?? "").toLowerCase();
    return t === "subscriber" || p.id.startsWith("subscriber-");
  });
}

export function filterAgentParties(parties: Party[]): Party[] {
  return parties.filter((p) => {
    const t = String((p as Party & { type?: string }).type ?? "").toLowerCase();
    return t === "agent" || p.id.startsWith("agent-");
  });
}

export function defaultPartyTabForCompany(companyId: string | null | undefined): PartyListTab {
  return isAdminPanelPartyPage(companyId) ? "subscribers" : "parties";
}

export function parsePartyListTab(value: string, adminPartyMode: boolean): PartyListTab {
  if (value === "groups") return "groups";
  if (value === "ic_ac" && !adminPartyMode) return "ic_ac";
  if (adminPartyMode) {
    if (value === "agents") return "agents";
    if (value === "subscribers" || value === "parties") return "subscribers";
    return "subscribers";
  }
  return "parties";
}

export function partyTabViewQuery(tab: PartyListTab): string | null {
  if (tab === "groups") return "groups";
  if (tab === "ic_ac") return "ic_ac";
  if (tab === "subscribers") return "subscribers";
  if (tab === "agents") return "agents";
  return null;
}

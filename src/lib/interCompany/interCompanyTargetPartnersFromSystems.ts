/**
 * Target dropdown — saare system cards se joined partners + system name label.
 */
import type { Company } from "@/hooks/useCompany";
import type { InterCompanyGroupDoc } from "@/lib/interCompany/interCompanyGroups";
import type { AcceptedSystemJoinLink } from "@/lib/interCompany/interCompanySystemJoinRequest";

export type SystemJoinedTargetEntry = {
  partnerCompanyId: string;
  /** Dropdown label ke bracket me — ek ya zyada system */
  systemNames: string[];
};

function ownedCompanyIds(allCompanies: Company[] | undefined): string[] {
  return (allCompanies || [])
    .filter((c) => c?.id && c.isOwned !== false)
    .map((c) => c.id!);
}

/** Partner id → system names (dedupe, sorted) */
export function collectSystemJoinedTargetEntries(args: {
  sourceCompanyId: string;
  allCompanies: Company[] | undefined;
  systems: InterCompanyGroupDoc[];
  /** Har owned company ke joined + permanent joined ids */
  joinedIdsByCompanyId: Map<string, string[]>;
  /** Source company ke accepted system join requests */
  acceptedLinksForSource: AcceptedSystemJoinLink[];
}): SystemJoinedTargetEntry[] {
  const sourceCompanyId = args.sourceCompanyId.trim();
  if (!sourceCompanyId) return [];

  const owned = new Set(ownedCompanyIds(args.allCompanies));
  const partnerSystems = new Map<string, Set<string>>();

  const addPartner = (partnerId: string, systemName: string) => {
    const pid = partnerId.trim();
    const sys = systemName.trim();
    if (!pid || pid === sourceCompanyId || !sys) return;
    if (!partnerSystems.has(pid)) partnerSystems.set(pid, new Set());
    partnerSystems.get(pid)!.add(sys);
  };

  // Accepted join requests — source company requester ya target
  for (const link of args.acceptedLinksForSource) {
    addPartner(link.partnerCompanyId, link.systemName);
  }

  // Har system card — source is system me ho to same-user owned companies bhi target
  for (const system of args.systems) {
    const systemName = String(system.name || "").trim();
    if (!systemName) continue;
    const inSystem = new Set((system.companyIds || []).filter(Boolean));

    // Source is system me nahi — is card se co-owned targets mat lo
    if (!inSystem.has(sourceCompanyId)) continue;

    // View com Owned — same user ki doosri companies (join ki zaroorat nahi)
    for (const ownedId of owned) {
      if (inSystem.has(ownedId)) {
        addPartner(ownedId, systemName);
      }
    }

    // Join settings / permanent join — doosre users ya external partners
    for (const ownedId of owned) {
      if (!inSystem.has(ownedId)) continue;
      const joined = args.joinedIdsByCompanyId.get(ownedId) || [];
      for (const partnerId of joined) {
        addPartner(partnerId, systemName);
      }
    }
  }

  // Source company ki direct joined list — system resolve na ho to bhi partner dikhe
  const sourceJoined = args.joinedIdsByCompanyId.get(sourceCompanyId) || [];
  for (const partnerId of sourceJoined) {
    if (partnerId.trim() && partnerId !== sourceCompanyId && !partnerSystems.has(partnerId)) {
      partnerSystems.set(partnerId, new Set());
    }
  }

  return [...partnerSystems.entries()]
    .map(([partnerCompanyId, names]) => {
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      // Same-user owned — dropdown me ek hi system label (list lamba na ho)
      const systemNames =
        owned.has(partnerCompanyId) && sorted.length > 1
          ? collapseOwnedPartnerSystemLabel({
              sourceCompanyId,
              partnerCompanyId,
              systems: args.systems,
              systemNames: sorted,
            })
          : sorted;
      return { partnerCompanyId, systemNames };
    })
    .sort((a, b) => a.partnerCompanyId.localeCompare(b.partnerCompanyId));
}

/** Owned partner multi-system — source + partner dono jis system me hon, wahi ek naam dikhao */
function collapseOwnedPartnerSystemLabel(args: {
  sourceCompanyId: string;
  partnerCompanyId: string;
  systems: InterCompanyGroupDoc[];
  systemNames: string[];
}): string[] {
  const shared = args.systems
    .filter((system) => {
      const name = String(system.name || "").trim();
      if (!name || !args.systemNames.includes(name)) return false;
      const ids = new Set((system.companyIds || []).filter(Boolean));
      return ids.has(args.sourceCompanyId) && ids.has(args.partnerCompanyId);
    })
    .map((system) => String(system.name || "").trim())
    .sort((a, b) => a.localeCompare(b));
  if (shared.length) return [shared[0]];
  return [args.systemNames[0]];
}

/** Combobox — `Company Name (System Name)` */
export function formatTargetPartnerSystemLabel(companyName: string, systemNames: string[]): string {
  const name = companyName.trim() || "—";
  if (!systemNames.length) return name;
  return `${name} (${systemNames.join(" · ")})`;
}

/**
 * Har owned company ka Inter Company join status — Join tab overview.
 */
import { loadInterCompanyJoinSettings } from "@/lib/interCompany/interCompanyJoinSettingsSync";
import type { InterCompanyGroupDoc } from "@/lib/interCompany/interCompanyGroups";
import { resolveInterCompanyGroupForCompany } from "@/lib/interCompany/interCompanyGroups";

export type OwnedCompanyIcOverviewRow = {
  companyId: string;
  companyName: string;
  groupName: string | null;
  /** Is company ke saath inter-company link active partners */
  joinedPartners: { id: string; label: string }[];
  isCurrent: boolean;
};

export async function loadOwnedCompaniesIcOverview(args: {
  ownedCompanies: { id: string; name: string }[];
  currentCompanyId: string;
  partnerNameById: Map<string, string>;
  groups: InterCompanyGroupDoc[];
}): Promise<OwnedCompanyIcOverviewRow[]> {
  const rows = await Promise.all(
    args.ownedCompanies.map(async (c) => {
      const { settings, companyGroupId } = await loadInterCompanyJoinSettings(c.id);
      const group =
        resolveInterCompanyGroupForCompany(args.groups, c.id) ??
        (companyGroupId ? args.groups.find((g) => g.id === companyGroupId) ?? null : null);
      const joinedIds = settings.joinedCompanyIds.filter(Boolean);
      const joinedPartners = joinedIds.map((id) => ({
        id,
        label: args.partnerNameById.get(id) || id,
      }));
      return {
        companyId: c.id,
        companyName: c.name,
        groupName: group?.name ?? null,
        joinedPartners,
        isCurrent: c.id === args.currentCompanyId,
      };
    })
  );
  return rows.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.companyName.localeCompare(b.companyName);
  });
}

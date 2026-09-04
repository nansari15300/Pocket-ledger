import { toast as sonnerToast } from "sonner";
import type { Company } from "@/hooks/useCompany";
import type { MasterGroupListConfig } from "@/lib/masterGroupListTree";
import type { MasterEntityGroupTreeRow } from "@/lib/masterEntityGroupTreeMove";
import { createMasterEntityGroupTreeMoveHelpers } from "@/lib/masterEntityGroupTreeMove";

type TreeMoveHelpers = ReturnType<typeof createMasterEntityGroupTreeMoveHelpers>;

export function createMasterEntityGroupTreeMoveHandler(args: {
  companyId: string | null | undefined;
  company: Company | null | undefined;
  groupsForName: Array<{ id: string; name?: string }>;
  allGroups: MasterEntityGroupTreeRow[];
  config: MasterGroupListConfig;
  moveHelpers: TreeMoveHelpers;
}) {
  const { companyId, company, groupsForName, allGroups, config, moveHelpers } = args;
  return async (sourceGroupId: string, targetGroupId: string) => {
    if (!companyId) return;
    const sourceName =
      groupsForName.find((g) => g.id === sourceGroupId)?.name || "Group";
    const targetName =
      groupsForName.find((g) => g.id === targetGroupId)?.name ||
      config.branches.find((b) => b.id === targetGroupId)?.name ||
      "group";
    try {
      await moveHelpers.moveGroupToTarget({
        companyId,
        company,
        sourceGroupId,
        targetListGroupId: targetGroupId,
        allGroups,
        config,
      });
      sonnerToast.success("Group moved", {
        description: `"${sourceName}" moved under ${targetName}.`,
      });
    } catch (err) {
      console.error("group list group move", err);
      sonnerToast.error("Could not move group");
    }
  };
}

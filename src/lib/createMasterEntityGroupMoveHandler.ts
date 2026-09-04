import { toast as sonnerToast } from "sonner";
import type { Company } from "@/hooks/useCompany";

type MoveHelpers<T extends { id: string; name?: string; groupId?: string | null }> = {
  moveToGroup: (args: {
    companyId: string;
    company: Company | null | undefined;
    account: T;
    targetListGroupId: string;
  }) => Promise<void>;
};

export function createMasterEntityGroupMoveHandler<
  T extends { id: string; name?: string; groupId?: string | null },
>(args: {
  companyId: string | null | undefined;
  company: Company | null | undefined;
  groupsForName: Array<{ id: string; name?: string }>;
  moveHelpers: MoveHelpers<T>;
  entityLabel?: string;
}) {
  const { companyId, company, groupsForName, moveHelpers, entityLabel = "Account" } = args;
  return async (account: T, targetGroupId: string) => {
    if (!companyId) return;
    const targetName =
      groupsForName.find((g) => g.id === targetGroupId)?.name || "group";
    try {
      await moveHelpers.moveToGroup({
        companyId,
        company,
        account,
        targetListGroupId: targetGroupId,
      });
      sonnerToast.success(`${entityLabel} moved`, {
        description: `"${account.name ?? entityLabel}" moved to ${targetName}.`,
      });
    } catch (err) {
      console.error("group list account move", err);
      sonnerToast.error(`Could not move ${entityLabel.toLowerCase()}`);
    }
  };
}

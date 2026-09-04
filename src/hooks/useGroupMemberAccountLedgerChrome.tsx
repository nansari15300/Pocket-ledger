"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { AdjustBalancePillLabel } from "@/components/vouchers/AdjustBalancePillLabel";
import { useMasterAccountFreezeDetailsChrome } from "@/hooks/useMasterAccountFreezeDetailsChrome";
import { useMasterEntityLivePatch } from "@/hooks/useMasterEntityLivePatch";
import { LEDGER_HEADER_PILL_CN } from "@/lib/ledgerHeaderChrome";
import type { MasterAccountFreezeCollection, MasterAccountFreezeFields } from "@/lib/masterAccountFreeze/types";
import { readMasterAccountFrozen } from "@/lib/masterAccountFreeze/types";
import type { MasterEntityPatchCollection } from "@/lib/masterEntityLiveUpdate";

type GroupMemberAdjustmentEntityType = "party" | "staff" | "account" | "tax" | "expense";

type UseGroupMemberAccountLedgerChromeOpts<T extends MasterAccountFreezeFields & { id: string; name: string }> = {
  companyId: string | undefined;
  collection: MasterAccountFreezeCollection;
  patchCollection: MasterEntityPatchCollection;
  selectedMember: T | null | undefined;
  adjustmentEntityType: GroupMemberAdjustmentEntityType;
  adjustmentDisplayName?: string;
  onMemberUpdated?: (patch?: Partial<T>) => void;
};

/** Freeze toggle + Adjust Balance when a group list member account is selected (not the group row). */
export function useGroupMemberAccountLedgerChrome<T extends MasterAccountFreezeFields & { id: string; name: string }>({
  companyId,
  collection,
  patchCollection,
  selectedMember,
  adjustmentEntityType,
  adjustmentDisplayName,
  onMemberUpdated,
}: UseGroupMemberAccountLedgerChromeOpts<T>) {
  const memberEligible = Boolean(selectedMember?.id);

  const handleMemberUpdated = useMasterEntityLivePatch<T>({
    collection: patchCollection,
    entityId: selectedMember?.id ?? "",
    onUpdated: onMemberUpdated,
  });

  const memberAdjustBalanceActions =
    selectedMember && memberEligible ? (
      <AddVoucherDialog
        defaultTab="adjustment"
        allowedTabs={["adjustment"]}
        defaultVoucherData={{
          defaultTab: "adjustment",
          adjustmentTarget: {
            id: selectedMember.id,
            entityType: adjustmentEntityType,
            name: adjustmentDisplayName ?? selectedMember.name,
          },
        }}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={readMasterAccountFrozen(selectedMember)}
          className={cn(LEDGER_HEADER_PILL_CN, "!h-7 min-h-7 text-xs")}
          title="Adjust Balance"
        >
          <AdjustBalancePillLabel />
        </Button>
      </AddVoucherDialog>
    ) : null;

  const { freezeOverlay, closingBalanceActions, blockNewTransactions } = useMasterAccountFreezeDetailsChrome({
    companyId,
    collection,
    entityId: selectedMember?.id ?? "",
    entity: selectedMember ?? ({ id: "", name: "", isFrozen: false } as T),
    entityEligible: memberEligible,
    onEntityUpdated: handleMemberUpdated,
    adjustBalanceActions: memberAdjustBalanceActions,
  });

  return {
    memberFreezeOverlay: freezeOverlay,
    memberClosingBalanceActions: closingBalanceActions,
    blockMemberNewTransactions: blockNewTransactions,
  };
}

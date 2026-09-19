/**
 * Target approve — restricted source account resolve → peer source voucher patch.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { patchVoucherFields } from "@/lib/voucherActionsClient";
import {
  buildSourceInterCompanyLegsApproved,
  buildSourceInterCompanyLegs,
} from "@/lib/interCompany/interCompanyPostingLegs";
import { readInterCompanyLink } from "@/lib/interCompany/interCompanyVoucherHydrate";

const PAYEE_FIELD: Record<InterCompanyEntityKind, string> = {
  party: "partyId",
  bank: "accountId",
  staff: "staffId",
  tax: "taxAccountId",
  expense: "expenseAccountId",
};

function entityPayeeFields(kind: InterCompanyEntityKind, entityId: string): Record<string, string> {
  const id = String(entityId || "").trim();
  if (!id) return {};
  return { [PAYEE_FIELD[kind]]: id, payeeType: kind === "staff" ? "staff" : kind === "party" ? "party" : kind };
}

/** Target admin ne source account choose kiya — peer source copy update. */
export async function syncInterCompanyResolvedSourceAccountToPeer(args: {
  targetCompanyId: string;
  targetVoucher: Record<string, unknown>;
  resolvedKind: InterCompanyEntityKind;
  resolvedId: string;
  resolvedLabel: string;
  amount: number;
  sourceCompanyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
  sourceAlreadyApproved: boolean;
}): Promise<void> {
  const link = readInterCompanyLink(args.targetVoucher);
  if (!link || link.role !== "target") return;
  const peerCompanyId = String(link.peerCompanyId || "").trim();
  const peerVoucherId = String(link.peerVoucherId || "").trim();
  if (!peerCompanyId || !peerVoucherId) return;

  const patch: Record<string, unknown> = {
    sourceEntityKind: args.resolvedKind,
    sourceEntityId: args.resolvedId,
    sourceEntityLabel: args.resolvedLabel,
    interCompanyResolvedSourceEntityKind: args.resolvedKind,
    interCompanyResolvedSourceEntityId: args.resolvedId,
    interCompanyResolvedSourceEntityLabel: args.resolvedLabel,
    interCompanySourceAccountRestricted: false,
    ...entityPayeeFields(args.resolvedKind, args.resolvedId),
  };

  const useIcConduit = true;
  const icId = String(args.interCompanyCounterpartyPartyId || "").trim();
  const legs = args.sourceAlreadyApproved
    ? buildSourceInterCompanyLegsApproved({
        amount: args.amount,
        entityKind: args.resolvedKind,
        entityId: args.resolvedId,
        companyBankAccountId: args.sourceCompanyBankAccountId,
        interCompanyCounterpartyPartyId: icId,
        useIcConduit,
      })
    : buildSourceInterCompanyLegs({
        amount: args.amount,
        entityKind: args.resolvedKind,
        entityId: args.resolvedId,
        companyBankAccountId: args.sourceCompanyBankAccountId,
        interCompanyCounterpartyPartyId: icId,
        useIcConduit,
      });
  if (legs.length > 0) patch.interCompanyLegs = legs;

  await patchVoucherFields(peerCompanyId, peerVoucherId, patch);
}

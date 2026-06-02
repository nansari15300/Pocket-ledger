/**
 * Target IC voucher approve — pending legs ko bank + entity + IC clear legs se replace.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { buildTargetInterCompanyLegsApproved, interCompanyUsesConduitParty } from "@/lib/interCompany/interCompanyPostingLegs";
import {
  inferInterCompanyEntity,
  interCompanyVoucherViewerSide,
  isInterCompanySourceApprovedForTarget,
  readInterCompanyCompanyBankId,
} from "@/lib/interCompany/interCompanyVoucherHydrate";

/** Target approve tab tak source company approve ho chuki ho (bank/recent visibility). */
export function assertInterCompanyTargetApproveAllowed(
  voucher: Record<string, unknown>
): void {
  if (interCompanyVoucherViewerSide(voucher) !== "target") return;
  if (!isInterCompanySourceApprovedForTarget(voucher)) {
    throw new Error("Source company must approve this Inter Company voucher first.");
  }
}

const PAYEE_FIELD: Record<InterCompanyEntityKind, string> = {
  party: "partyId",
  bank: "accountId",
  staff: "staffId",
  tax: "taxAccountId",
  expense: "expenseAccountId",
};

function normKind(raw: unknown): InterCompanyEntityKind | null {
  const k = String(raw || "")
    .toLowerCase()
    .trim() as InterCompanyEntityKind;
  return k in PAYEE_FIELD ? k : null;
}

/** Approve transaction me merge hone wala patch (legs + legacy fields). */
export function buildInterCompanyTargetApprovalPatch(
  voucher: Record<string, unknown>
): Record<string, unknown> | null {
  if (String(voucher?.type || "") !== "inter_company") return null;
  if (interCompanyVoucherViewerSide(voucher) !== "target") return null;

  const icId = String(voucher.interCompanyCounterpartyPartyId || "").trim();
  const bankId = readInterCompanyCompanyBankId(voucher);
  const useIcConduit = interCompanyUsesConduitParty(voucher);
  if (!bankId) return null;

  const amount = Number(voucher.amount || voucher.total || 0);
  const inferred = inferInterCompanyEntity(voucher, "target");
  let entityKind = inferred?.kind ?? null;
  let entityId = String(inferred?.id || "").trim();
  if (!entityId) {
    const payeeKind = normKind(voucher.payeeType === "staff" ? "staff" : voucher.payeeType);
    if (payeeKind) {
      entityKind = payeeKind;
      entityId = String(voucher[PAYEE_FIELD[payeeKind]] || "").trim();
    }
  }
  if (useIcConduit && entityId && !icId) return null;

  const legs = buildTargetInterCompanyLegsApproved({
    amount,
    entityKind: entityKind || "party",
    entityId,
    companyBankAccountId: bankId,
    interCompanyCounterpartyPartyId: icId,
    useIcConduit,
  });
  if (legs.length === 0) return null;

  return {
    interCompanyLegs: legs,
    interCompanyCounterpartyPartyId: useIcConduit ? icId : null,
    ...(entityId && entityKind ? entityPayeeFields(entityKind, entityId) : {}),
  };
}

function entityPayeeFields(kind: InterCompanyEntityKind, entityId: string): Record<string, string> {
  const id = String(entityId || "").trim();
  if (!id) return {};
  switch (kind) {
    case "party":
      return { partyId: entityId, payeeType: "party" };
    case "bank":
      return { accountId: entityId };
    case "staff":
      return { staffId: entityId, payeeType: "staff" };
    case "tax":
      return { taxAccountId: entityId };
    case "expense":
      return { expenseAccountId: entityId };
    default:
      return {};
  }
}

/**
 * Source IC voucher approve — entity involve ho to bank rasta (Dr+Cr); bank-to-bank par sirf Cr.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { buildSourceInterCompanyLegsApproved, interCompanyUsesConduitParty } from "@/lib/interCompany/interCompanyPostingLegs";
import {
  inferInterCompanyEntity,
  interCompanyVoucherViewerSide,
  readInterCompanyCompanyBankId,
} from "@/lib/interCompany/interCompanyVoucherHydrate";

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

/** Source approve patch — compound legs + payee fields. */
export function buildInterCompanySourceApprovalPatch(
  voucher: Record<string, unknown>
): Record<string, unknown> | null {
  if (String(voucher?.type || "") !== "inter_company") return null;
  if (interCompanyVoucherViewerSide(voucher) !== "source") return null;

  const icId = String(voucher.interCompanyCounterpartyPartyId || "").trim();
  const bankId = readInterCompanyCompanyBankId(voucher);
  const useIcConduit = interCompanyUsesConduitParty(voucher);
  if (!bankId) return null;

  const amount = Number(voucher.amount || voucher.total || 0);
  const inferred = inferInterCompanyEntity(voucher, "source");
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

  const legs = buildSourceInterCompanyLegsApproved({
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

/**
 * Source IC voucher approve — bank par Dr+Cr; approve par target copy par visibility flag.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { buildSourceInterCompanyLegsApproved } from "@/lib/interCompany/interCompanyPostingLegs";
import { interCompanyVoucherViewerSide } from "@/lib/interCompany/interCompanyVoucherHydrate";

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
  const bankId = String(voucher.companyBankAccountId || "").trim();
  if (!icId || !bankId) return null;

  const amount = Number(voucher.amount || voucher.total || 0);
  let entityKind = normKind(voucher.sourceEntityKind);
  let entityId = String(voucher.sourceEntityId || "").trim();
  if (!entityId) {
    entityKind = normKind(voucher.payeeType === "staff" ? "staff" : voucher.payeeType);
    if (entityKind) {
      entityId = String(voucher[PAYEE_FIELD[entityKind]] || "").trim();
    }
  }
  if (!entityKind || !entityId) return null;

  const legs = buildSourceInterCompanyLegsApproved({
    amount,
    entityKind,
    entityId,
    companyBankAccountId: bankId,
    interCompanyCounterpartyPartyId: icId,
  });
  if (legs.length === 0) return null;

  return {
    interCompanyLegs: legs,
    ...entityPayeeFields(entityKind, entityId),
  };
}

function entityPayeeFields(kind: InterCompanyEntityKind, entityId: string): Record<string, string> {
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

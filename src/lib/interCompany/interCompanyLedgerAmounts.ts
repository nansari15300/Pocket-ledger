/**
 * Inter Company — party / bank / staff / tax / expense entity ledgers par Dr/Cr.
 * Source company copy = Payment Out; target copy = Payment In (payment_out / payment_in jaisa).
 */
import type { Context } from "@/components/vouchers/TransactionsTable";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import {
  getInterCompanyLegAmounts,
  interCompanyUsesConduitParty,
  isInterCompanyOperationalEntityInvolved,
  resolveInterCompanyLegsForVoucher,
  resolveInterCompanyViewerSide,
  applyInterCompanyReversedLedgerNetZero,
} from "@/lib/interCompany/interCompanyPostingLegs";
import {
  interCompanyVoucherViewerSide,
  isInterCompanyVisibleOnTargetBank,
  isInterCompanyVisibleOnTargetEntity,
  readInterCompanyCompanyBankId,
} from "@/lib/interCompany/interCompanyVoucherHydrate";

const PAYEE_FIELD: Record<InterCompanyEntityKind, string> = {
  party: "partyId",
  bank: "accountId",
  staff: "staffId",
  tax: "taxAccountId",
  expense: "expenseAccountId",
};

/** Ledger context → inter-company entity kind */
export function interCompanyKindForContext(context: Context): InterCompanyEntityKind | null {
  switch (context) {
    case "party":
      return "party";
    case "account":
      return "bank";
    case "staff":
      return "staff";
    case "tax":
      return "tax";
    case "expense":
      return "expense";
    default:
      return null;
  }
}

function normKind(raw: unknown): InterCompanyEntityKind | null {
  const k = String(raw || "")
    .toLowerCase()
    .trim() as InterCompanyEntityKind;
  return k in PAYEE_FIELD ? k : null;
}

function legKindToContext(kind: InterCompanyEntityKind): Context {
  if (kind === "bank") return "account";
  if (kind === "staff") return "staff";
  if (kind === "tax") return "tax";
  if (kind === "expense") return "expense";
  return "party";
}

/** Voucher is entity se juda hai (legs, IC counterparty, company bank, ya legacy payee) */
export function interCompanyVoucherTouchesEntity(
  transaction: Record<string, unknown> | null | undefined,
  entityId: string,
  kind: InterCompanyEntityKind
): boolean {
  const id = String(entityId || "").trim();
  if (!id || String(transaction?.type || "") !== "inter_company") return false;
  if (!isInterCompanyVisibleOnTargetBank(transaction)) return false;

  const ctx = legKindToContext(kind);
  const legs = resolveInterCompanyLegsForVoucher(transaction as Record<string, unknown>);
  if (legs.length > 0) {
    const icCounterpartyId = String(transaction.interCompanyCounterpartyPartyId || "").trim();
    for (const leg of legs) {
      if (legKindToContext(leg.kind) !== ctx || String(leg.accountId) !== id) continue;
      if (
        kind === "party" &&
        icCounterpartyId &&
        id === icCounterpartyId
      ) {
        if (!interCompanyUsesConduitParty(transaction)) {
          continue;
        }
        const side = resolveInterCompanyViewerSide(transaction);
        if (
          side &&
          (side === "source" || side === "target") &&
          !isInterCompanyOperationalEntityInvolved(transaction, side)
        ) {
          continue;
        }
      }
      return true;
    }
  }

  if (kind === "party" && String(transaction.interCompanyCounterpartyPartyId || "").trim() === id) {
    if (!interCompanyUsesConduitParty(transaction)) {
      return false;
    }
    const side = resolveInterCompanyViewerSide(transaction);
    if (
      side &&
      (side === "source" || side === "target") &&
      !isInterCompanyOperationalEntityInvolved(transaction, side)
    ) {
      return false;
    }
    return true;
  }
  if (kind === "bank" && readInterCompanyCompanyBankId(transaction) === id) {
    return true;
  }

  const payeeField = PAYEE_FIELD[kind];
  if (String(transaction[payeeField] || "").trim() === id) return true;

  const srcKind = normKind(transaction.sourceEntityKind);
  const tgtKind = normKind(transaction.targetEntityKind);
  if (srcKind === kind && String(transaction.sourceEntityId || "").trim() === id) return true;
  if (tgtKind === kind && String(transaction.targetEntityId || "").trim() === id) return true;

  return false;
}

/** Source = Payment Out, target = Payment In; role missing ho to payee vs source/target id se infer */
export function interCompanyPaymentDirection(
  transaction: Record<string, unknown>
): "out" | "in" | null {
  const side = interCompanyVoucherViewerSide(transaction);
  if (side === "source") return "out";
  if (side === "target") return "in";

  const srcId = String(transaction.sourceEntityId || "").trim();
  const tgtId = String(transaction.targetEntityId || "").trim();
  for (const kind of Object.keys(PAYEE_FIELD) as InterCompanyEntityKind[]) {
    const payeeId = String(transaction[PAYEE_FIELD[kind]] || "").trim();
    if (!payeeId) continue;
    if (payeeId === srcId) return "out";
    if (payeeId === tgtId) return "in";
  }
  return null;
}

export type InterCompanyLedgerAmountResult = {
  touched: boolean;
  debit: number;
  credit: number;
};

/**
 * Entity ledger row ke liye Dr/Cr — match na ho to touched=false.
 * Bank context: cash leg (payment_in/out ulta party se).
 */
export function getInterCompanyLedgerAmounts(
  transaction: Record<string, unknown>,
  context: Context,
  entityId: string,
  amount: number
): InterCompanyLedgerAmountResult {
  const empty = { touched: false, debit: 0, credit: 0 };
  if (String(transaction?.type || "") !== "inter_company") return empty;
  // Target bank: IC save ke baad pending Dr; entity ke liye source + target approve alag
  if (!isInterCompanyVisibleOnTargetBank(transaction)) return empty;
  // Target entity: bank approve ke baad hi (party/staff/tax/expense)
  if (
    interCompanyVoucherViewerSide(transaction) === "target" &&
    context !== "account" &&
    !isInterCompanyVisibleOnTargetEntity(transaction)
  ) {
    return empty;
  }

  const kind = interCompanyKindForContext(context);
  if (!kind || !interCompanyVoucherTouchesEntity(transaction, entityId, kind)) return empty;

  // Naye vouchers: compound legs se Dr/Cr
  const legs = resolveInterCompanyLegsForVoucher(transaction);
  if (legs.length > 0) {
    if (
      context === "party" ||
      context === "account" ||
      context === "staff" ||
      context === "tax" ||
      context === "expense"
    ) {
      return getInterCompanyLegAmounts(transaction, context, entityId);
    }
    return empty;
  }

  // Target unapproved + koi stored leg nahi: staff/party par legacy payment_in mat lagao
  if (
    transaction.isApproved !== true &&
    interCompanyVoucherViewerSide(transaction) === "target" &&
    context !== "account"
  ) {
    return empty;
  }

  // Purane vouchers: payment in/out direction
  const dir = interCompanyPaymentDirection(transaction);
  if (!dir) return empty;

  const amt = Number(amount) || 0;
  const isOut = dir === "out";

  if (context === "account") {
    if (isOut) {
      return applyInterCompanyReversedLedgerNetZero(transaction, {
        touched: true,
        debit: 0,
        credit: amt,
      });
    }
    return applyInterCompanyReversedLedgerNetZero(transaction, {
      touched: true,
      debit: amt,
      credit: 0,
    });
  }

  if (isOut) {
    return applyInterCompanyReversedLedgerNetZero(transaction, {
      touched: true,
      debit: amt,
      credit: 0,
    });
  }
  return applyInterCompanyReversedLedgerNetZero(transaction, {
    touched: true,
    debit: 0,
    credit: amt,
  });
}

/** Party list / copy ledger — kya yeh party id inter_company se touch hoti hai */
export function interCompanyTouchesPartyId(
  voucher: Record<string, unknown>,
  partyId: string
): boolean {
  return interCompanyVoucherTouchesEntity(voucher, partyId, "party");
}

/**
 * Target par IC row hide — source approve se pehle (bank + entity); source approve ke baad
 * target unapproved par entity hide, bank `getInterCompanyLegAmounts` se.
 */
export function hideUnapprovedTargetInterCompanyEntityLedger(
  transaction: Record<string, unknown> | null | undefined,
  context: Context,
  entityId: string
): boolean {
  if (!transaction || String(transaction.type || "") !== "inter_company") return false;
  if (!isInterCompanyVisibleOnTargetBank(transaction)) return true;
  if (transaction.isApproved === true) return false;
  if (interCompanyVoucherViewerSide(transaction) !== "target") return false;
  if (context === "account") return false;
  const id = String(entityId || "").trim();
  if (!id) return false;
  const kind = interCompanyKindForContext(context);
  if (!kind) return false;
  return interCompanyVoucherTouchesEntity(transaction, id, kind);
}

/** @deprecated Bank ab unapproved par amount dikhata hai — placeholder zaroorat nahi */
export function keepUnapprovedInterCompanyLedgerPlaceholderRow(
  transaction: Record<string, unknown> | null | undefined,
  context: Context,
  entityId: string
): boolean {
  void transaction;
  void context;
  void entityId;
  return false;
}

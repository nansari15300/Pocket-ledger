/**
 * Inter Company — party / bank / staff / tax / expense entity ledgers par Dr/Cr.
 * Source company copy = Payment Out; target copy = Payment In (payment_out / payment_in jaisa).
 */
import type { Context } from "@/components/vouchers/TransactionsTable";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { interCompanyVoucherViewerSide } from "@/lib/interCompany/interCompanyVoucherHydrate";

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

/** Voucher is entity se juda hai (payee field ya saved source/target ids) */
export function interCompanyVoucherTouchesEntity(
  transaction: Record<string, unknown> | null | undefined,
  entityId: string,
  kind: InterCompanyEntityKind
): boolean {
  const id = String(entityId || "").trim();
  if (!id || String(transaction?.type || "") !== "inter_company") return false;

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

  const kind = interCompanyKindForContext(context);
  if (!kind || !interCompanyVoucherTouchesEntity(transaction, entityId, kind)) return empty;

  const dir = interCompanyPaymentDirection(transaction);
  if (!dir) return empty;

  const amt = Number(amount) || 0;
  const isOut = dir === "out";

  // Bank/cash account — payment_in = Dr, payment_out = Cr
  if (context === "account") {
    if (isOut) return { touched: true, debit: 0, credit: amt };
    return { touched: true, debit: amt, credit: 0 };
  }

  // Party, staff, tax, expense — payment_out = Dr, payment_in = Cr
  if (isOut) return { touched: true, debit: amt, credit: 0 };
  return { touched: true, debit: 0, credit: amt };
}

/** Party list / copy ledger — kya yeh party id inter_company se touch hoti hai */
export function interCompanyTouchesPartyId(
  voucher: Record<string, unknown>,
  partyId: string
): boolean {
  return interCompanyVoucherTouchesEntity(voucher, partyId, "party");
}

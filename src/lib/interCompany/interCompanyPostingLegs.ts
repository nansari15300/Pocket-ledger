/**
 * Inter Company — compound ledger legs (entity ↔ IC counterparty ↔ bank).
 * Source save: Dr entity, Cr IC conduit, Dr IC receivable, Cr bank.
 * Target unapproved: sirf Cr IC payable; approve par bank + entity + IC clear.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import {
  interCompanyVoucherViewerSide,
  isInterCompanyVisibleOnTargetBank,
  isInterCompanyVisibleOnTargetEntity,
} from "@/lib/interCompany/interCompanyVoucherHydrate";

export type InterCompanyLedgerLeg = {
  /** party | bank | staff | tax | expense */
  kind: InterCompanyEntityKind;
  accountId: string;
  debit: number;
  credit: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type IcLegAmountResult = { touched: boolean; debit: number; credit: number };

/**
 * Revert accept ke baad — entity/bank row par Dr/Cr dono equal dikhao;
 * running balance `debit - credit` net zero rahe (sirf ek side se balance na bigde).
 */
export function applyInterCompanyReversedLedgerNetZero(
  voucher: Record<string, unknown>,
  result: IcLegAmountResult
): IcLegAmountResult {
  if (!result.touched || voucher?.interCompanyReversed !== true) return result;
  const bump = Math.max(round2(result.debit), round2(result.credit));
  if (bump <= 0) return result;
  return { touched: true, debit: bump, credit: bump };
}

function finalizeIcLegAmounts(voucher: Record<string, unknown>, result: IcLegAmountResult): IcLegAmountResult {
  return applyInterCompanyReversedLedgerNetZero(voucher, result);
}

/** Source company — bhejne wali posting (save par). */
export function buildSourceInterCompanyLegs(args: {
  amount: number;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  if (amt <= 0) return [];
  const { entityKind, entityId, companyBankAccountId: bankId, interCompanyCounterpartyPartyId: icId } = args;
  const legs: InterCompanyLedgerLeg[] = [];
  if (entityId && icId && bankId) {
    legs.push({ kind: entityKind, accountId: entityId, debit: amt, credit: 0 });
    legs.push({ kind: "party", accountId: icId, debit: 0, credit: amt });
    legs.push({ kind: "party", accountId: icId, debit: amt, credit: 0 });
    legs.push({ kind: "bank", accountId: bankId, debit: 0, credit: amt });
    return legs;
  }
  // Bank abhi select nahi — entity + IC conduit legs se source staff/party ledger me dikhe
  if (entityId && icId) {
    legs.push({ kind: entityKind, accountId: entityId, debit: amt, credit: 0 });
    legs.push({ kind: "party", accountId: icId, debit: 0, credit: amt });
    return legs;
  }
  if (icId && bankId) {
    legs.push({ kind: "party", accountId: icId, debit: amt, credit: 0 });
    legs.push({ kind: "bank", accountId: bankId, debit: 0, credit: amt });
  }
  return legs;
}

/** Target company — create par pending payable (unapproved). */
export function buildTargetInterCompanyLegsPending(args: {
  amount: number;
  interCompanyCounterpartyPartyId: string;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  const icId = String(args.interCompanyCounterpartyPartyId || "").trim();
  if (amt <= 0 || !icId) return [];
  return [{ kind: "party", accountId: icId, debit: 0, credit: amt }];
}

/**
 * Source approve: bank par payment out (Dr+Cr) — target bank approve jaisa history me dono side.
 */
export function buildSourceInterCompanyLegsApproved(args: {
  amount: number;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  if (amt <= 0) return [];
  const { entityKind, entityId, companyBankAccountId: bankId, interCompanyCounterpartyPartyId: icId } = args;
  const legs: InterCompanyLedgerLeg[] = [];
  if (entityId && icId && bankId) {
    legs.push({ kind: entityKind, accountId: entityId, debit: amt, credit: 0 });
    legs.push({ kind: "party", accountId: icId, debit: 0, credit: amt });
    legs.push({ kind: "party", accountId: icId, debit: amt, credit: 0 });
    legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
    return legs;
  }
  if (icId && bankId) {
    legs.push({ kind: "party", accountId: icId, debit: amt, credit: 0 });
    legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
  }
  return legs;
}

/**
 * Target approve: IC clear + entity Cr + bank par receive (Dr) + entity transfer (Cr) — net zero bank balance.
 * Unapproved par sirf bank Dr dikhta tha; approve par history me dono side clear.
 */
export function buildTargetInterCompanyLegsApproved(args: {
  amount: number;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  if (amt <= 0) return [];
  const { entityKind, entityId, companyBankAccountId: bankId, interCompanyCounterpartyPartyId: icId } = args;
  const legs: InterCompanyLedgerLeg[] = [];
  if (entityId && icId && bankId) {
    legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
    legs.push({ kind: "party", accountId: icId, debit: amt, credit: 0 });
    legs.push({ kind: entityKind, accountId: entityId, debit: 0, credit: amt });
    return legs;
  }
  if (icId && bankId) {
    legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
    legs.push({ kind: "party", accountId: icId, debit: amt, credit: 0 });
  }
  return legs;
}

/** Voucher doc se active legs — target unapproved vs approved. */
export function resolveInterCompanyLegsForVoucher(
  voucher: Record<string, unknown>
): InterCompanyLedgerLeg[] {
  const stored = voucher.interCompanyLegs;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .map((row) => {
        const r = row as InterCompanyLedgerLeg;
        return {
          kind: r.kind,
          accountId: String(r.accountId || ""),
          debit: round2(Number(r.debit) || 0),
          credit: round2(Number(r.credit) || 0),
        };
      })
      .filter((r) => r.accountId && (r.debit > 0 || r.credit > 0));
  }
  return [];
}

function normEntityKind(raw: unknown): InterCompanyEntityKind | null {
  const k = String(raw || "")
    .toLowerCase()
    .trim() as InterCompanyEntityKind;
  return k === "party" || k === "bank" || k === "staff" || k === "tax" || k === "expense" ? k : null;
}

function entityKindToLegContext(kind: InterCompanyEntityKind): "party" | "account" | "staff" | "tax" | "expense" {
  if (kind === "bank") return "account";
  if (kind === "staff") return "staff";
  if (kind === "tax") return "tax";
  if (kind === "expense") return "expense";
  return "party";
}

/** Ledger context + account id — is voucher leg se Dr/Cr. */
export function getInterCompanyLegAmounts(
  voucher: Record<string, unknown>,
  context: "party" | "account" | "staff" | "tax" | "expense",
  entityId: string
): IcLegAmountResult {
  const empty = finalizeIcLegAmounts(voucher, { touched: false, debit: 0, credit: 0 });
  if (String(voucher?.type || "") !== "inter_company") return empty;
  const id = String(entityId || "").trim();
  if (!id) return empty;

  const side = interCompanyVoucherViewerSide(voucher);
  const amt = round2(Number(voucher.amount ?? voucher.total) || 0);

  // Target: source approve se pehle ledger me amount mat dikhao
  if (side === "target" && !isInterCompanyVisibleOnTargetBank(voucher)) {
    return empty;
  }

  // Target entity legs — target approve ke baad (bank alag rule)
  if (
    side === "target" &&
    context !== "account" &&
    !isInterCompanyVisibleOnTargetEntity(voucher)
  ) {
    return empty;
  }

  if (voucher.isApproved !== true) {
    // Target: unapproved par bank me receive (Dr); entity/staff approve ke baad
    if (side === "target" && context === "account" && amt > 0) {
      const bankId = String(voucher.companyBankAccountId || "").trim();
      if (bankId && id === bankId) {
        return finalizeIcLegAmounts(voucher, { touched: true, debit: amt, credit: 0 });
      }
    }
    // Source: unapproved bank — sirf Cr (payment out); target jaisa ek side
    if (side === "source" && context === "account" && amt > 0) {
      const bankId = String(voucher.companyBankAccountId || "").trim();
      if (bankId && id === bankId) {
        return finalizeIcLegAmounts(voucher, { touched: true, debit: 0, credit: amt });
      }
    }

    // Target unapproved: sirf bank (upar); party/IC entity approve ke baad
    if (side === "target") {
      return empty;
    }
  }

  // Target approved bank: receive (Dr) + transfer (Cr) — net zero, history clear
  if (side === "target" && voucher.isApproved === true && context === "account" && amt > 0) {
    const bankId = String(voucher.companyBankAccountId || "").trim();
    if (bankId && id === bankId) {
      return finalizeIcLegAmounts(voucher, { touched: true, debit: amt, credit: amt });
    }
  }

  // Source approved bank: payment out (Dr) + Cr — dono side, target mirror
  if (side === "source" && voucher.isApproved === true && context === "account" && amt > 0) {
    const bankId = String(voucher.companyBankAccountId || "").trim();
    if (bankId && id === bankId) {
      return finalizeIcLegAmounts(voucher, { touched: true, debit: amt, credit: amt });
    }
  }

  const legs = resolveInterCompanyLegsForVoucher(voucher);
  let debit = 0;
  let credit = 0;
  for (const leg of legs) {
    const legCtx =
      leg.kind === "bank"
        ? "account"
        : leg.kind === "staff"
          ? "staff"
          : leg.kind === "tax"
            ? "tax"
            : leg.kind === "expense"
              ? "expense"
              : "party";
    if (legCtx !== context) continue;
    if (String(leg.accountId) !== id) continue;
    debit += leg.debit;
    credit += leg.credit;
  }
  if (debit <= 0 && credit <= 0) return empty;
  return finalizeIcLegAmounts(voucher, {
    touched: true,
    debit: round2(debit),
    credit: round2(credit),
  });
}

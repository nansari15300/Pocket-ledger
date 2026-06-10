/**
 * Inter Company — compound ledger legs (entity ↔ IC counterparty ↔ bank).
 * Source save: Dr entity, Cr IC conduit, Dr IC receivable, Cr bank.
 * Target unapproved: sirf Cr IC payable; approve par bank + entity + IC clear.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import {
  inferInterCompanyEntity,
  interCompanyVoucherViewerSide,
  isInterCompanyVisibleOnTargetBank,
  isInterCompanyVisibleOnTargetEntity,
  readInterCompanyCompanyBankId,
  readInterCompanyLink,
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

/** IC Com ledger — source: sent = Dr; target: received = Cr (ek side only). */
function appendIcComSourceLeg(
  legs: InterCompanyLedgerLeg[],
  icId: string,
  amt: number,
  useConduit: boolean
): void {
  if (useConduit && icId) {
    legs.push({ kind: "party", accountId: icId, debit: amt, credit: 0 });
  }
}

function appendIcComTargetLeg(
  legs: InterCompanyLedgerLeg[],
  icId: string,
  amt: number,
  useConduit: boolean
): void {
  if (useConduit && icId) {
    legs.push({ kind: "party", accountId: icId, debit: 0, credit: amt });
  }
}

/** Party/staff/tax/expense — bank sirf company rasta, IC conduit entity nahi. */
export function isInterCompanyNonBankEntity(
  kind: InterCompanyEntityKind | null | undefined,
  entityId: unknown
): boolean {
  const id = String(entityId || "").trim();
  if (!id) return false;
  const k = String(kind || "")
    .toLowerCase()
    .trim();
  return k !== "" && k !== "bank";
}

/** Dono sides par non-bank entity — tab hi IC · Due from/to conduit party. */
export function interCompanyPairUsesConduitParty(args: {
  sourceEntityKind: InterCompanyEntityKind;
  sourceEntityId: string;
  targetEntityKind: InterCompanyEntityKind;
  targetEntityId: string;
}): boolean {
  return (
    isInterCompanyNonBankEntity(args.sourceEntityKind, args.sourceEntityId) &&
    isInterCompanyNonBankEntity(args.targetEntityKind, args.targetEntityId)
  );
}

/** Saved voucher par IC conduit party use hoti hai ya nahi. */
export function interCompanyUsesConduitParty(voucher: Record<string, unknown>): boolean {
  const icId = String(voucher.interCompanyCounterpartyPartyId || "").trim();
  if (icId) return true;
  const src = inferInterCompanyEntity(voucher, "source");
  const tgt = inferInterCompanyEntity(voucher, "target");
  return (
    isInterCompanyNonBankEntity(src?.kind, src?.id) &&
    isInterCompanyNonBankEntity(tgt?.kind, tgt?.id)
  );
}

/** Source company — bhejne wali posting (save par). */
export function buildSourceInterCompanyLegs(args: {
  amount: number;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
  useIcConduit?: boolean;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  if (amt <= 0) return [];
  const { entityKind, entityId, companyBankAccountId: bankId, interCompanyCounterpartyPartyId: icId } = args;
  const useConduit = args.useIcConduit === true;
  const operational = isInterCompanyNonBankEntity(entityKind, entityId);
  const legs: InterCompanyLedgerLeg[] = [];
  appendIcComSourceLeg(legs, icId, amt, useConduit);
  if (operational && entityId) {
    legs.push({ kind: entityKind, accountId: entityId, debit: amt, credit: 0 });
    if (bankId) {
      legs.push({ kind: "bank", accountId: bankId, debit: 0, credit: amt });
    }
    return legs;
  }
  if (bankId) {
    legs.push({ kind: "bank", accountId: bankId, debit: 0, credit: amt });
  }
  return legs;
}

/** Target company — pending legs; IC · Due to + bank Dr jab bank ho. */
export function buildTargetInterCompanyLegsPending(args: {
  amount: number;
  entityKind?: InterCompanyEntityKind;
  entityId?: string;
  companyBankAccountId?: string;
  interCompanyCounterpartyPartyId: string;
  useIcConduit?: boolean;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  if (amt <= 0) return [];
  const entityKind = args.entityKind || "party";
  const entityId = String(args.entityId || "").trim();
  const bankId = String(args.companyBankAccountId || "").trim();
  const icId = String(args.interCompanyCounterpartyPartyId || "").trim();
  const useConduit = args.useIcConduit === true;
  const operational = isInterCompanyNonBankEntity(entityKind, entityId);
  const legs: InterCompanyLedgerLeg[] = [];
  appendIcComTargetLeg(legs, icId, amt, useConduit);
  if (bankId && !operational) {
    legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: 0 });
  }
  return legs;
}

/**
 * Source approve: entity involve ho to bank rasta (Dr+Cr); bank-to-bank par sirf Cr.
 */
export function buildSourceInterCompanyLegsApproved(args: {
  amount: number;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
  useIcConduit?: boolean;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  if (amt <= 0) return [];
  const { entityKind, entityId, companyBankAccountId: bankId, interCompanyCounterpartyPartyId: icId } = args;
  const useConduit = args.useIcConduit === true;
  const operational = isInterCompanyNonBankEntity(entityKind, entityId);
  const legs: InterCompanyLedgerLeg[] = [];
  appendIcComSourceLeg(legs, icId, amt, useConduit);
  if (operational && entityId) {
    legs.push({ kind: entityKind, accountId: entityId, debit: amt, credit: 0 });
    if (bankId) {
      legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
    }
    return legs;
  }
  if (bankId) {
    // Bank + IC Com clearing — approve par Dr+Cr; sirf bank ho to ek side Cr
    if (useConduit && icId) {
      legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
    } else {
      legs.push({ kind: "bank", accountId: bankId, debit: 0, credit: amt });
    }
  }
  return legs;
}

/**
 * Target approve: entity involve ho to bank rasta; IC Com = received (Cr).
 */
export function buildTargetInterCompanyLegsApproved(args: {
  amount: number;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
  useIcConduit?: boolean;
}): InterCompanyLedgerLeg[] {
  const amt = round2(Number(args.amount) || 0);
  if (amt <= 0) return [];
  const { entityKind, entityId, companyBankAccountId: bankId, interCompanyCounterpartyPartyId: icId } = args;
  const useConduit = args.useIcConduit === true;
  const operational = isInterCompanyNonBankEntity(entityKind, entityId);
  const legs: InterCompanyLedgerLeg[] = [];
  appendIcComTargetLeg(legs, icId, amt, useConduit);
  if (operational && entityId) {
    if (bankId) {
      legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
    }
    legs.push({ kind: entityKind, accountId: entityId, debit: 0, credit: amt });
    return legs;
  }
  if (bankId) {
    // Bank + IC Com clearing — approve par Dr+Cr
    if (useConduit && icId) {
      legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: amt });
    } else {
      legs.push({ kind: "bank", accountId: bankId, debit: amt, credit: 0 });
    }
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

/** Is side par party/staff/tax/expense involve — bank sirf rasta (approve par Dr+Cr). */
export function isInterCompanyOperationalEntityInvolved(
  voucher: Record<string, unknown>,
  side: "source" | "target"
): boolean {
  const inferred = inferInterCompanyEntity(voucher, side);
  if (inferred?.id) return isInterCompanyNonBankEntity(inferred.kind, inferred.id);
  const kindKey = side === "source" ? "sourceEntityKind" : "targetEntityKind";
  const idKey = side === "source" ? "sourceEntityId" : "targetEntityId";
  return isInterCompanyNonBankEntity(
    String(voucher[kindKey] || "").toLowerCase() as InterCompanyEntityKind,
    voucher[idKey]
  );
}

/** Source/target role — link.role ya entity snapshot se infer. */
export function resolveInterCompanyViewerSide(
  voucher: Record<string, unknown> | null | undefined
): "source" | "target" | null {
  if (!voucher) return null;
  const side = interCompanyVoucherViewerSide(voucher);
  if (side === "source" || side === "target") return side;
  const role = readInterCompanyLink(voucher)?.role;
  if (role === "source" || role === "target") return role;
  if (isInterCompanyOperationalEntityInvolved(voucher, "source")) return "source";
  if (isInterCompanyOperationalEntityInvolved(voucher, "target")) return "target";
  return null;
}

function isInterCompanyVoucherApproved(voucher: Record<string, unknown>): boolean {
  return voucher?.isApproved === true;
}

/** Is side par party/staff/tax/expense (ya bank entity) involve — bank sirf rasta. */
export function resolveInterCompanyOperationalEntity(args: {
  side: "source" | "target";
  voucher: Record<string, unknown>;
}): { kind: InterCompanyEntityKind; id: string } | null {
  return inferInterCompanyEntity(args.voucher, args.side);
}

/** Bank-to-bank IC — koi operational entity nahi; bank par net Dr/Cr. */
export function isInterCompanyBankToBankOnly(voucher: Record<string, unknown>): boolean {
  const side = resolveInterCompanyViewerSide(voucher);
  if (side !== "source" && side !== "target") return true;
  return !isInterCompanyOperationalEntityInvolved(voucher, side);
}

/** Bank sirf ek side tab jab koi aur account (IC Company / entity) involve na ho. */
function isInterCompanyBankSingleSideOnly(
  voucher: Record<string, unknown>,
  side: "source" | "target"
): boolean {
  const bankId = readInterCompanyCompanyBankId(voucher);
  if (!bankId) return false;
  const icId = String(voucher.interCompanyCounterpartyPartyId || "").trim();
  if (icId && interCompanyUsesConduitParty(voucher)) return false;
  return !isInterCompanyOperationalEntityInvolved(voucher, side);
}

function resolveInterCompanyBankIdForLegs(voucher: Record<string, unknown>): string {
  return readInterCompanyCompanyBankId(voucher);
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

  const side = resolveInterCompanyViewerSide(voucher);
  const amt = round2(Number(voucher.amount ?? voucher.total) || 0);
  const icCounterpartyId = String(voucher.interCompanyCounterpartyPartyId || "").trim();
  const isIcComLedger = context === "party" && icCounterpartyId && id === icCounterpartyId;

  // Target: source approve se pehle ledger me amount mat dikhao
  if (side === "target" && !isInterCompanyVisibleOnTargetBank(voucher)) {
    return empty;
  }

  // Target entity legs — target approve ke baad; IC Com = source approve par
  if (
    side === "target" &&
    context !== "account" &&
    !isIcComLedger &&
    !isInterCompanyVisibleOnTargetEntity(voucher)
  ) {
    return empty;
  }

  if (!isInterCompanyVoucherApproved(voucher)) {
    // Target: unapproved par bank me receive (Dr); entity/staff approve ke baad
    if (side === "target" && context === "account" && amt > 0) {
      const bankId = resolveInterCompanyBankIdForLegs(voucher);
      if (bankId && id === bankId) {
        return finalizeIcLegAmounts(voucher, { touched: true, debit: amt, credit: 0 });
      }
    }
    // Source: unapproved bank — sirf Cr (payment out); target jaisa ek side
    if (side === "source" && context === "account" && amt > 0) {
      const bankId = resolveInterCompanyBankIdForLegs(voucher);
      if (bankId && id === bankId) {
        return finalizeIcLegAmounts(voucher, { touched: true, debit: 0, credit: amt });
      }
    }

    // Target unapproved: IC Com source approve ke baad; baaki entity approve ke baad
    if (side === "target" && !isIcComLedger) {
      return empty;
    }
  }

  // Approved bank — sirf jab koi aur account na ho; clearing (IC/entity) stored legs se Dr+Cr
  if (
    isInterCompanyVoucherApproved(voucher) &&
    context === "account" &&
    amt > 0 &&
    side &&
    isInterCompanyBankSingleSideOnly(voucher, side)
  ) {
    const bankId = resolveInterCompanyBankIdForLegs(voucher);
    if (bankId && id === bankId) {
      if (side === "target") {
        return finalizeIcLegAmounts(voucher, { touched: true, debit: amt, credit: 0 });
      }
      if (side === "source") {
        return finalizeIcLegAmounts(voucher, { touched: true, debit: 0, credit: amt });
      }
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

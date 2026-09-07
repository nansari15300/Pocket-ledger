/** Master ledger opening balance: signed number — Dr (+), Cr (−). */

export type OpeningBalanceSide = "dr" | "cr";

export function openingBalanceSideFromSigned(signed: unknown): OpeningBalanceSide {
  const n = Number(signed) || 0;
  return n < 0 ? "cr" : "dr";
}

export function openingBalanceAbsFromSigned(signed: unknown): number {
  return Math.abs(Number(signed) || 0);
}

export function signedOpeningBalanceFromAbsSide(abs: unknown, side: OpeningBalanceSide): number {
  const amt = Math.abs(Number(abs) || 0);
  if (amt === 0) return 0;
  return side === "cr" ? -amt : amt;
}

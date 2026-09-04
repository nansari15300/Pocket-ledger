import { z } from "zod";

export const MASTER_OPENING_BALANCE_EPS = 0.005;

export const MASTER_OPENING_BALANCE_DATE_REQUIRED_MESSAGE =
  "As on Date is required when Opening Balance is entered.";

export function masterHasOpeningBalanceAmount(openingBalance: unknown): boolean {
  const n = Number(openingBalance);
  return Number.isFinite(n) && Math.abs(n) >= MASTER_OPENING_BALANCE_EPS;
}

/** true when OB entered but As on Date missing — use to disable Save. */
export function isMasterOpeningBalanceDateMissing(
  openingBalance: unknown,
  openingBalanceDate: unknown
): boolean {
  if (!masterHasOpeningBalanceAmount(openingBalance)) return false;
  if (openingBalanceDate == null) return true;
  if (openingBalanceDate instanceof Date) {
    return Number.isNaN(openingBalanceDate.getTime());
  }
  return true;
}

export function refineMasterOpeningBalanceDateRequired<
  T extends { openingBalance?: unknown; openingBalanceDate?: unknown },
>(data: T, ctx: z.RefinementCtx): void {
  if (isMasterOpeningBalanceDateMissing(data.openingBalance, data.openingBalanceDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: MASTER_OPENING_BALANCE_DATE_REQUIRED_MESSAGE,
      path: ["openingBalanceDate"],
    });
  }
}

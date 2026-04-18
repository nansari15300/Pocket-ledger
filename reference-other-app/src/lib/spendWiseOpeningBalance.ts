// Synthetic spend-wise row id for account opening balance linking.
// Firestore map keys cannot start/end with "__", so keep this key plain-safe.
export const SPEND_WISE_OPENING_BALANCE_ID = "spend_wise_opening_balance";

/** History / daybook jahan Dr/Cr side fix nahi: synthetic id ko voucher number ki jagah yeh dikhao (#spend_wi jaisa truncate na ho). */
export const SPEND_WISE_OPENING_BALANCE_HISTORY_LABEL = "Opening Balance (spend wise)";

export type OpeningBalanceSide = "dr" | "cr";

export function getOpeningBalanceBaseAmount(openingBalance: number, side: OpeningBalanceSide): number {
  const value = Number(openingBalance) || 0;
  // Dr side uses positive opening balance, Cr side uses negative opening balance magnitude.
  return side === "dr" ? Math.max(0, value) : Math.max(0, -value);
}

export function getOpeningBalanceVoucherLabel(side: OpeningBalanceSide): string {
  // Keep explicit side in label so user knows which side is being linked.
  return side === "dr" ? "Opening Balance (Dr)" : "Opening Balance (Cr)";
}

import type { Account } from "@/components/bank-cash/types";

export function coerceBankAccountIsSpecial(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

export function normalizeBankAccountSpecialFields<T extends Account>(row: T): T {
  return {
    ...row,
    isSpecial: coerceBankAccountIsSpecial(row.isSpecial),
  };
}

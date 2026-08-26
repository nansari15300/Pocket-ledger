import { cn } from "@/lib/utils";
import { BTN_SAVE_CLASS } from "@/components/vouchers/voucherButtonStyles";

/** Pay EMI — due = solid green; upcoming = blue chrome pill (Loan & Staff + Loan Overview). */
export function payEmiButtonVariant(emiDue: boolean): "default" | "chromePill" {
  return emiDue ? "default" : "chromePill";
}

export function payEmiButtonClassName(emiDue: boolean, className?: string) {
  return cn(emiDue ? BTN_SAVE_CLASS : undefined, className);
}

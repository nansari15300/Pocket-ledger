import type { DateRange } from "@/components/ui/ad-calendar";
import { endOfDay, startOfDay } from "date-fns";
import { tryParseIsoDate } from "./loanDateUtils";

/** Loan accounting row payment date within ledger date range (inclusive). */
export function loanTxnPaymentDateInRange(paymentDateIso: string, range?: DateRange): boolean {
  if (!range?.from && !range?.to) return true;
  const d = tryParseIsoDate(paymentDateIso);
  if (!d) return false;
  const day = startOfDay(d);
  if (range.from && day < startOfDay(range.from)) return false;
  if (range.to && day > endOfDay(range.to)) return false;
  return true;
}

import { resolveDefaultCurrentMonthScope } from "@/lib/fyPagination/periodBounds";
import type { FyActiveScope } from "@/lib/fyPagination/types";

type FyScopeCompany = { country?: string };

/** Base scope before min-txn backfill (current month only). */
export function resolveDefaultFyScopeForCompany(
  company: FyScopeCompany | null | undefined,
  today = new Date()
): FyActiveScope {
  return resolveDefaultCurrentMonthScope(company?.country, today);
}

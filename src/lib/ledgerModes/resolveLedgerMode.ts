/**
 * Ledger mode router — UI/forms call this instead of branching on company flags.
 * See docs/LEDGER_MODE_ARCHITECTURE.md
 */
import type { Company } from "@/hooks/useCompany";

export type LedgerMode = "online" | "localDrive" | "plServer";

export function resolveLedgerMode(company: Company | null | undefined): LedgerMode {
  if (!company) return "localDrive";
  if ((company as { plServerShared?: boolean }).plServerShared === true) return "plServer";
  const storage = String((company as { storageOption?: string }).storageOption || "").toLowerCase();
  const syncPolicy = String((company as { syncPolicy?: string }).syncPolicy || "").toLowerCase();
  const authoritativeId = String((company as { authoritativeCompanyId?: string }).authoritativeCompanyId || "").trim();
  const syncedFromCloud = (company as { syncedFromCloud?: boolean }).syncedFromCloud === true;
  if (
    storage === "firebase" ||
    syncPolicy === "online" ||
    syncedFromCloud ||
    !!authoritativeId
  ) {
    return "online";
  }
  return "localDrive";
}

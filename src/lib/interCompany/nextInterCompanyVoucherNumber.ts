/**
 * Inter Company — har company ka apna `inter_company` prefix + next serial (save par).
 */
import {
  DEFAULT_VOUCHER_PREFIX_LABELS,
  getNextVoucherNumberForCompany,
} from "@/lib/nextVoucherNumber";
import { normalizePrefix } from "@/lib/voucherNumberFormat";

const DEFAULT_INTER_COMPANY_PREFIX = DEFAULT_VOUCHER_PREFIX_LABELS.inter_company;

/** Company doc se inter_company prefix — settings ya default IC- */
export function readInterCompanyVoucherPrefix(companyDoc: Record<string, unknown> | null | undefined): string {
  const configured = companyDoc?.voucherPrefixes as Record<string, string[] | undefined> | undefined;
  const prefixes = configured?.inter_company;
  if (Array.isArray(prefixes) && prefixes[0]) {
    const row = String(prefixes[0]).trim();
    const norm = normalizePrefix(row).toUpperCase();
    if (row === "IC-" || norm === "IC" || row === "FT-" || norm === "FT") {
      return DEFAULT_INTER_COMPANY_PREFIX;
    }
    return row;
  }
  return DEFAULT_INTER_COMPANY_PREFIX;
}

/** Ek company ke existing inter_company vouchers se agla number (FY segment + SQLite/Firestore merge). */
export async function getNextInterCompanyVoucherNumber(
  companyId: string,
  companyDoc: Record<string, unknown> | null | undefined,
  opts?: { voucherDate?: unknown }
): Promise<string> {
  return getNextVoucherNumberForCompany({
    companyId,
    companyDoc,
    voucherLike: { type: "inter_company" },
    selectedPrefix: readInterCompanyVoucherPrefix(companyDoc),
    voucherDate: opts?.voucherDate ?? new Date(),
  });
}

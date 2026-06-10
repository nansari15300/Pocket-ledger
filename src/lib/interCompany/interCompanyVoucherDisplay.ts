import { formatVoucherNumber, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";
import { interCompanyVoucherViewerSide } from "@/lib/interCompany/interCompanyVoucherHydrate";

const IC_PREFIXES = ["IC", "IC Out", "IC In"];

/** Ledger / print — source copy: IC Out - 00x; target copy: IC In - 00x */
export function formatInterCompanyLedgerVoucherNumber(
  voucher: Record<string, unknown> | null | undefined
): string {
  const raw = String(voucher?.voucherNumber ?? voucher?.voucher_number ?? "").trim();
  if (!raw || String(voucher?.type || "") !== "inter_company") return raw;

  let num = NaN;
  for (const p of IC_PREFIXES) {
    const n = parseVoucherNumberPart(raw, p);
    if (!isNaN(n)) {
      num = n;
      break;
    }
  }
  if (isNaN(num)) {
    const m = raw.match(/(\d+)\s*$/);
    if (m) num = parseInt(m[1], 10);
  }
  if (isNaN(num)) return raw;

  const side = interCompanyVoucherViewerSide(voucher);
  const prefix = side === "target" ? "IC In" : "IC Out";
  return formatVoucherNumber(prefix, num);
}

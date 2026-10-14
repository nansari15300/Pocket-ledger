import {
  formatVoucherNumber,
  formatVoucherNumberWithFy,
  parseFySegmentFromVoucherNumber,
  parseVoucherNumberPart,
  parseVoucherSerial,
} from "@/lib/voucherNumberFormat";
import { interCompanyVoucherViewerSide } from "@/lib/interCompany/interCompanyVoucherHydrate";

const IC_PREFIXES = ["IC", "IC Out", "IC In"];
/** Stored voucher no prefixes (form save: IC-83-84-027). */
const IC_STORED_PREFIXES = ["IC-", "IC", "IC Out", "IC In", "FT-", "FT"];

/** Ledger / print — source copy: IC Out - 00x; target copy: IC In - 00x */
export function formatInterCompanyLedgerVoucherNumber(
  voucher: Record<string, unknown> | null | undefined
): string {
  const raw = String(voucher?.voucherNumber ?? voucher?.voucher_number ?? "").trim();
  if (!raw || String(voucher?.type || "") !== "inter_company") return raw;

  const side = interCompanyVoucherViewerSide(voucher);
  const displayPrefix = side === "target" ? "IC In" : "IC Out";

  for (const storedPrefix of IC_STORED_PREFIXES) {
    const fy = parseFySegmentFromVoucherNumber(raw, storedPrefix);
    if (!fy) continue;
    const serial = parseVoucherSerial(raw, storedPrefix, fy);
    if (Number.isFinite(serial) && !Number.isNaN(serial)) {
      return formatVoucherNumberWithFy(displayPrefix, fy, serial);
    }
  }

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

  return formatVoucherNumber(displayPrefix, num);
}

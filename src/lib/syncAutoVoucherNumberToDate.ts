import {
  autoVoucherIncludesFySegment,
  resolveVoucherNumberFyFormat,
} from "@/lib/nextVoucherNumber";
import { voucherFySegmentForDate } from "@/lib/fiscalYearLabel";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";
import {
  formatVoucherNumberWithFy,
  parseFySegmentFromVoucherNumber,
  parseVoucherNumberPart,
  parseVoucherSerial,
} from "@/lib/voucherNumberFormat";

function resolveVoucherDateForFy(raw: unknown): Date {
  const d = parseFirestoreDateFieldToJsDate(raw);
  return d && !isNaN(d.getTime()) ? d : new Date();
}

/** Keep serial; refresh FY span (and prefix stem) when voucher date or FY settings change — edit + new. */
export function syncAutoVoucherNumberToDate(params: {
  companyDoc: Record<string, unknown> | null | undefined;
  prefix: string;
  currentVoucherNumber: string;
  voucherDate: unknown;
}): string {
  const { companyDoc, prefix, currentVoucherNumber, voucherDate } = params;
  const trimmed = String(currentVoucherNumber || "").trim();
  if (!trimmed) return trimmed;
  if (!autoVoucherIncludesFySegment(companyDoc)) return trimmed;

  const fyFormat = resolveVoucherNumberFyFormat(companyDoc);
  const fySegment = voucherFySegmentForDate(
    companyDoc as { country?: string; fiscalYearStart?: unknown },
    resolveVoucherDateForFy(voucherDate),
    fyFormat
  );
  const oldFy = parseFySegmentFromVoucherNumber(trimmed, prefix);
  let serial = parseVoucherSerial(trimmed, prefix, oldFy);
  if (!Number.isFinite(serial)) serial = parseVoucherSerial(trimmed, prefix, fySegment);
  if (!Number.isFinite(serial)) serial = parseVoucherNumberPart(trimmed, prefix);
  if (!Number.isFinite(serial) || serial < 1) return trimmed;

  const next = formatVoucherNumberWithFy(prefix, fySegment, serial);
  return next === trimmed ? trimmed : next;
}

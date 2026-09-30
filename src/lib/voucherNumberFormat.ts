/**
 * Voucher number format: "prefix - NNN" with consistent space-dash-space and zero-padding.
 * Padding: 1-99 → 001-099 (3 digits), 100-999 → 0100-0999 (4 digits), 1000+ → 01000... (one leading zero).
 */
export function padVoucherNumberPart(num: number): string {
  if (num < 1 || !Number.isInteger(num)) return String(num);
  const len = String(num).length;
  const targetLen = Math.max(3, len + 1);
  return String(num).padStart(targetLen, "0");
}

/** Remove trailing dashes/spaces from prefix so format is always "prefix - number" not "prefix- - number". */
export function normalizePrefix(prefix: string): string {
  return (prefix || "").trim().replace(/[\s-]+$/, "");
}

/** Format: "prefix - 001" (space, dash, space, zero-padded number). Prefix is normalized so we never get "dash space dash". */
export function formatVoucherNumber(prefix: string, num: number): string {
  return `${normalizePrefix(prefix)} - ${padVoucherNumberPart(num)}`;
}

/** Prefix stem for FY nos — always one dash before FY span (`RCPT-83-84-063`). */
export function voucherPrefixStemForFy(prefix: string): string {
  const base = normalizePrefix(prefix);
  if (!base) return "";
  return base.endsWith("-") ? base : `${base}-`;
}

/** FY auto format: `PUR-82-83-002` / `RCPT-83-84-063` (prefix + dash + FY span + serial). */
export function formatVoucherNumberWithFy(prefix: string, fySegment: string | null | undefined, num: number): string {
  const fy = String(fySegment || "").trim();
  if (!fy) return formatVoucherNumber(prefix, num);
  const stem = voucherPrefixStemForFy(prefix);
  return `${stem}${fy}-${padVoucherNumberPart(num)}`;
}

export function voucherNumberHeadWithFy(prefix: string, fySegment: string | null | undefined): string {
  const fy = String(fySegment || "").trim();
  if (!fy) return `${normalizePrefix(prefix)} - `;
  return `${voucherPrefixStemForFy(prefix)}${fy}-`;
}

/**
 * Parse numeric part from a voucher number string.
 * Handles "prefix - 001", "prefix 001", "prefix001". Prefix may have trailing dash (e.g. "PYMT-"); we normalize so "PYMT - 003" parses correctly.
 */
export function parseVoucherNumberPart(voucherStr: string, prefix: string): number {
  const usePrefix = normalizePrefix(prefix) || (prefix || "").trim();
  if (!voucherStr || !usePrefix || (!voucherStr.startsWith(usePrefix) && !voucherStr.startsWith(prefix))) return NaN;
  const afterPrefix = voucherStr.startsWith(usePrefix)
    ? voucherStr.slice(usePrefix.length)
    : voucherStr.slice((prefix || "").length);
  const numStr = afterPrefix.replace(/^[\s-]+/, "").trim();
  return parseInt(numStr, 10);
}

/** Parse serial from FY voucher (`PUR-82-83-002`) or legacy (`PUR - 002`). */
export function parseVoucherSerial(voucherStr: string, prefix: string, fySegment?: string | null): number {
  const fy = String(fySegment || "").trim();
  if (fy) {
    const head = voucherNumberHeadWithFy(prefix, fy);
    const trimmed = (voucherStr || "").trim();
    if (!trimmed.startsWith(head)) return NaN;
    const numStr = trimmed.slice(head.length).replace(/^[\s-]+/, "").trim();
    const parsed = parseInt(numStr, 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return parseVoucherNumberPart(voucherStr, prefix);
}

/** FY span embedded in stored voucher no (e.g. `82-83`), if any. */
/** Match stored voucher no to configured prefix list (FY / legacy). */
export function resolvePrefixFromVoucherNumber(
  voucherNo: string,
  prefixList: string[],
  fallback: string
): string {
  const vn = String(voucherNo || "").trim();
  if (!vn) return fallback;
  for (const p of prefixList) {
    const raw = String(p || "").trim();
    if (!raw) continue;
    const stem = voucherPrefixStemForFy(raw);
    const norm = normalizePrefix(raw);
    if (stem && vn.startsWith(stem)) return raw;
    if (norm && vn.startsWith(norm)) return raw;
    if (vn.startsWith(raw)) return raw;
  }
  return fallback;
}

export function parseFySegmentFromVoucherNumber(voucherStr: string, prefix: string): string | null {
  const trimmed = (voucherStr || "").trim();
  const stem = voucherPrefixStemForFy(prefix);
  const base = normalizePrefix(prefix);
  if (!trimmed || (!stem && !base)) return null;
  if (stem && trimmed.startsWith(stem)) {
    const m = /^(\d{2,4}-\d{2,4})-/.exec(trimmed.slice(stem.length));
    if (m) return m[1];
  }
  if (base && trimmed.startsWith(base)) {
    const rest = trimmed.slice(base.length);
    let m = /^-(\d{2,4}-\d{2,4})-/.exec(rest);
    if (m) return m[1];
    m = /^(\d{2,4}-\d{2,4})-/.exec(rest);
    return m ? m[1] : null;
  }
  return null;
}

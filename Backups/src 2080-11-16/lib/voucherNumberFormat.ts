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
